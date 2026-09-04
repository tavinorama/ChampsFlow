/**
 * Founder Admin Dashboard — cross-tenant read routes.
 *
 * All routes require both requireAuth AND requireSuperAdmin. Super-admins run
 * WITHOUT a tenant scope in AsyncLocalStorage (requireAuth skips runWithTenant
 * for super-admins — see middleware.ts lines 216-219). As a result, db.query()
 * calls in these handlers execute as the privileged login role, bypassing RLS
 * entirely. This is the intentional cross-tenant read mechanism.
 *
 * IMPORTANT: Do NOT call db.setTenantId() in any handler here. There is no
 * AsyncLocalStorage scope active, so calling it would update a non-existent
 * store and silently have no effect. Just call db.query() directly.
 *
 * Routes:
 *   GET   /api/admin/overview         — KPI summary
 *   GET   /api/admin/clients          — tenant list with brand count
 *   GET   /api/admin/leads            — lead_capture rows (newest first)
 *   GET   /api/admin/kit-orders       — kit_order rows (newest first)
 *   GET   /api/admin/engagements      — all engagement rows (cross-tenant)
 *   PATCH /api/admin/engagements/:id  — update engagement status
 *   GET   /api/admin/system-health    — infra + env key presence + engine liveness
 *                                       + the Delivery Health summary (P0-09)
 *   GET   /api/admin/delivery-health  — "are we delivering?" — indicators with
 *                                       their contracts + the Ozvor canary
 *   GET   /api/admin/analytics        — funnel metrics, MRR, ARR, trends
 *   GET   /api/admin/opportunities    — upsell targets (kit buyers without sub, hot DFY leads)
 *   GET   /api/admin/contacts/:email/dossier — per-client timeline (o ficheiro)
 *   GET   /api/admin/recycle-batches  — 60-day recycling batches (from CRM markers)
 *
 * Hard rules:
 *   - Parameterized queries ONLY — no string interpolation in any SQL
 *   - No PII in logs (no emails, no tenant names in log entries)
 *   - All inputs validated at the API boundary before business logic
 *   - Auth: requireAuth + requireSuperAdmin on every route
 */

import { Hono } from "hono";
import { requireAuth, requireSuperAdmin } from "../auth/middleware";
import { agentOpsSummary, clampDays } from "../lib/agent-ops";
import { tryGetSharedRedis } from "../shared-redis";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { sendKitDeliveryEmail } from "../../../../packages/shared/src/emails/kit-delivery";
import { encryptToken } from "../../../../packages/shared/src/crypto";
import {
  PLATFORM_KEY_PROVIDERS,
  PLATFORM_KEY_ENV_VAR,
  bootEnvHasKey,
  isPlatformKeyProvider,
  validatePlatformKeyInput,
} from "../../../../packages/shared/src/platform-keys";
import { refreshPlatformKeys } from "../lib/platform-keys";
import { resolveAssetDownloads } from "../../../../packages/shared/src/assets-manifest";
import { normalizeCrmPatch } from "../lib/crm-validation";
import { upsertCrmContact } from "../lib/crm";
import {
  buildDossier,
  crmNoteEntries,
  leadCaptureEntries,
  normalizeDossierEmail,
  nurtureEntries,
  orderEntries,
  smartleadEntries,
  type DossierEntry,
  type NurtureSendRow,
  type OrderRowForDossier,
} from "../lib/dossier";
import { groupRecycleBatches } from "../lib/recycle";
import { LIST_PRICE_USD } from "../../../../packages/shared/src/pricing";
import { fetchEnrichedClients, fetchRevenueSummary } from "../lib/cockpit";
import { fetchReceivedMrr } from "../lib/received-mrr";
import { fetchOperatingCadence } from "../lib/cadence";
import { readDeliveryHealth } from "../lib/delivery-health-read";
import { deliveryColor } from "../../../../packages/llm/src/delivery-health";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the named env var is set to a non-empty string.
 * NEVER returns the actual value — presence boolean only.
 */
/**
 * #152 — this month's api_spend split by HOW each row's number was obtained.
 * measured = tokens × list price (real), rate = calls × per-call rate, flat =
 * fixed per-op number, legacy = rows written before the source column existed.
 * Pre-migration (42703) the split is unknowable: everything is 'legacy' and
 * legacySchema=true says so. Never throws — an unreadable ledger is reported
 * as null + an attention flag, not a 500 on the health page.
 */
export async function apiSpendBySource(db: PostgresClient): Promise<{
  monthCents: number;
  bySource: { measured: number; rate: number; flat: number; legacy: number };
  rowsBySource: { measured: number; rate: number; flat: number; legacy: number };
  measuredShare: number;
  legacySchema: boolean;
} | null> {
  const empty = { measured: 0, rate: 0, flat: 0, legacy: 0 };
  try {
    const r = await db.query<{ source: string | null; cents: number; rows: number }>(
      `SELECT source,
              COALESCE(SUM(COALESCE(measured_cost_cents, est_cost_cents)), 0)::float AS cents,
              COUNT(*)::int AS rows
         FROM api_spend
        WHERE created_at >= date_trunc('month', NOW())
        GROUP BY source`
    );
    const bySource = { ...empty };
    const rowsBySource = { ...empty };
    let monthCents = 0;
    for (const row of r.rows) {
      const key = (row.source ?? "legacy") as keyof typeof empty;
      const k: keyof typeof empty = key in empty ? key : "legacy";
      bySource[k] += Number(row.cents) || 0;
      rowsBySource[k] += Number(row.rows) || 0;
      monthCents += Number(row.cents) || 0;
    }
    return {
      monthCents: Math.round(monthCents * 100) / 100,
      bySource,
      rowsBySource,
      measuredShare: monthCents > 0 ? Math.round((bySource.measured / monthCents) * 1000) / 1000 : 0,
      legacySchema: false,
    };
  } catch (err) {
    if ((err as { code?: unknown })?.code !== "42703") {
      logger.error("admin_api_spend_read_failed", { message: (err as Error).message?.slice(0, 200) });
      return null;
    }
  }
  try {
    const r = await db.query<{ cents: number; rows: number }>(
      `SELECT COALESCE(SUM(est_cost_cents), 0)::float AS cents, COUNT(*)::int AS rows
         FROM api_spend
        WHERE created_at >= date_trunc('month', NOW())`
    );
    const cents = Number(r.rows[0]?.cents ?? 0);
    const rows = Number(r.rows[0]?.rows ?? 0);
    return {
      monthCents: cents,
      bySource: { ...empty, legacy: cents },
      rowsBySource: { ...empty, legacy: rows },
      measuredShare: 0,
      legacySchema: true,
    };
  } catch (err) {
    logger.error("admin_api_spend_read_failed", { message: (err as Error).message?.slice(0, 200) });
    return null;
  }
}

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["requested", "contacted", "won", "lost"]);

// Pricing constants — sourced from the shared canonical module (packages/shared
// src/pricing) so the founder dashboard and the Hermes operator surface never
// drift. Names kept for the existing call sites below.
const KIT_PRICE_USD = LIST_PRICE_USD.kit;
// Growth/Agency sticker prices are no longer used for MRR here — the analytics
// endpoint now reports RECEIVED-value MRR (fetchReceivedMrr), not list price.
const GEO_SPRINT_PRICE_USD = LIST_PRICE_USD.geoSprint;
const MANAGED_GEO_PRICE_USD = LIST_PRICE_USD.managedGeo;

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdminRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/admin/overview — KPI summary (cross-tenant, login role)
  // -------------------------------------------------------------------------
  app.get("/api/admin/overview", requireAuth, requireSuperAdmin, async (c) => {
    try {
      // Total tenant count
      const tenantsTotal = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tenants`
      );

      // Paid tenants by plan_tier (excludes free / null)
      const tenantsByTier = await db.query<{ plan_tier: string; count: string }>(
        `SELECT plan_tier, COUNT(*) AS count
         FROM tenants
         WHERE plan_tier IS NOT NULL AND plan_tier != 'free'
         GROUP BY plan_tier`
      );

      // Total leads
      const leadsTotal = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lead_capture`
      );

      // Kit orders: total count
      const kitOrdersTotal = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM kit_order`
      );

      // Engagements grouped by status
      const engagementsByStatus = await db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM engagement GROUP BY status`
      );

      // Build byTier map
      const byTier: Record<string, number> = {};
      for (const row of tenantsByTier.rows) {
        byTier[row.plan_tier] = parseInt(row.count, 10);
      }

      // Build engagements map
      const engagements = { requested: 0, contacted: 0, won: 0, lost: 0 };
      for (const row of engagementsByStatus.rows) {
        const s = row.status as keyof typeof engagements;
        if (s in engagements) {
          engagements[s] = parseInt(row.count, 10);
        }
      }

      logger.info("admin_overview_fetched", {});

      return c.json({
        tenants: {
          total: parseInt(tenantsTotal.rows[0]?.count ?? "0", 10),
          byTier: {
            growth: byTier["growth"] ?? 0,
            agency: byTier["agency"] ?? 0,
          },
        },
        leads: {
          total: parseInt(leadsTotal.rows[0]?.count ?? "0", 10),
        },
        kitOrders: {
          total: parseInt(kitOrdersTotal.rows[0]?.count ?? "0", 10),
          // kit_order has no amount_cents column — revenue tracking not yet available
          revenueUsdCents: null,
        },
        engagements,
      });
    } catch (err) {
      logger.error("admin_overview_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "OVERVIEW_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/clients — tenant list with brand count (cross-tenant)
  // -------------------------------------------------------------------------
  app.get("/api/admin/clients", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const clients = await fetchEnrichedClients(db, 200);
      logger.info("admin_clients_fetched", { count: clients.length });
      return c.json({ clients });
    } catch (err) {
      logger.error("admin_clients_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CLIENTS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/leads — recent lead_capture rows (cross-tenant)
  //
  // Actual lead_capture columns (from migration 20260611000001_products):
  //   id, email, brand, competitor, category, region, result, source,
  //   ip_truncated, created_at
  // Note: no score_teaser or score_numeric columns exist in this table.
  // -------------------------------------------------------------------------
  app.get("/api/admin/leads", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const result = await db.query<{
        id: string;
        email: string | null;
        brand: string;
        category: string;
        region: string;
        source: string;
        created_at: string;
        origin_from: string | null;
        utm_campaign: string | null;
      }>(
        // Campaign origin lives inside the result jsonb: /test and /ai-audit
        // write result->'attribution' (from + utm_*); /book writes the legacy
        // top-level result->>'from'. COALESCE covers both — no migration.
        `SELECT id, email, brand, category, region, source, created_at,
                COALESCE(result->'attribution'->>'from', result->>'from') AS origin_from,
                result->'attribution'->>'utm_campaign' AS utm_campaign
         FROM lead_capture
         ORDER BY created_at DESC
         LIMIT 200`
      );

      logger.info("admin_leads_fetched", { count: result.rows.length });

      return c.json({ leads: result.rows });
    } catch (err) {
      logger.error("admin_leads_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "LEADS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/audits — recent geo_audit rows (cross-tenant), joined to
  // brand + tenant so the founder can see WHOSE audit each was — including
  // their own dogfood runs (is_internal). Super-admin only; this panel is
  // behind auth, so unlike the PII-free operator feed it may show brand/domain.
  // -------------------------------------------------------------------------
  app.get("/api/admin/audits", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const result = await db.query<{
        id: string;
        status: string;
        score_brand: number | null;
        score_performance: number | null;
        score_ai: number | null;
        created_at: string;
        triggered_by: string | null;
        brand: string | null;
        domain: string | null;
        tenant_name: string | null;
        plan_tier: string | null;
        is_internal: boolean;
      }>(
        `SELECT a.id, a.status, a.score_brand, a.score_performance, a.score_ai,
                a.created_at, a.triggered_by,
                b.name AS brand, b.domain,
                t.name AS tenant_name, t.plan_tier,
                (a.tenant_id IN (
                   SELECT tenant_id FROM api_key
                    WHERE revoked_at IS NULL AND 'operator' = ANY(scopes)
                 )) AS is_internal
           FROM geo_audit a
           LEFT JOIN brands b ON b.id = a.brand_id
           LEFT JOIN tenants t ON t.id = a.tenant_id
          ORDER BY a.created_at DESC
          LIMIT 100`
      );

      logger.info("admin_audits_fetched", { count: result.rows.length });

      return c.json({ audits: result.rows });
    } catch (err) {
      logger.error("admin_audits_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "AUDITS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/kit-orders — kit_order rows (cross-tenant)
  //
  // Actual kit_order columns (from migration 20260611000001_products):
  //   id, order_token, email, brand, domain, category, region, status,
  //   stripe_session_id, deliverable, created_at, paid_at, delivered_at
  // Note: no amount_cents column exists in this table.
  // -------------------------------------------------------------------------
  app.get("/api/admin/kit-orders", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const result = await db.query<{
        id: string;
        email: string;
        brand: string;
        status: string;
        stripe_session_id: string | null;
        created_at: string;
        paid_at: string | null;
        delivered_at: string | null;
      }>(
        `SELECT id, email, brand, status, stripe_session_id, created_at, paid_at, delivered_at
         FROM kit_order
         ORDER BY created_at DESC
         LIMIT 200`
      );

      logger.info("admin_kit_orders_fetched", { count: result.rows.length });

      return c.json({ kitOrders: result.rows });
    } catch (err) {
      logger.error("admin_kit_orders_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "KIT_ORDERS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/kit-orders/:id/resend-email — re-send the Kit delivery
  // email for a paid/delivered order (support: spam folder, typo, or a past
  // send failure). Reuses the exact Resend path the webhook uses. Super-admin.
  // -------------------------------------------------------------------------
  app.post("/api/admin/kit-orders/:id/resend-email", requireAuth, requireSuperAdmin, async (c) => {
    const id = c.req.param("id");
    try {
      const { rows } = await db.query<{
        email: string;
        brand: string;
        order_token: string;
        status: string;
      }>(
        `SELECT email, brand, order_token, status FROM kit_order WHERE id = $1`,
        [id]
      );
      const order = rows[0];
      if (!order) {
        return c.json({ error: "not_found", code: "KIT_ORDER_NOT_FOUND" }, 404);
      }
      // Only re-send for orders that actually paid — never email an unpaid order.
      if (order.status !== "paid" && order.status !== "delivered") {
        return c.json(
          { error: "not_paid", code: "KIT_ORDER_NOT_PAID", message: "Only paid or delivered orders can be re-sent." },
          409
        );
      }
      if (!order.email || !order.brand) {
        return c.json({ error: "missing_recipient", code: "KIT_ORDER_NO_EMAIL" }, 422);
      }
      const result = await sendKitDeliveryEmail({ to: order.email, brand: order.brand, orderToken: order.order_token });
      // Recipient email intentionally NOT logged — hard rule (PII).
      logger.info("admin_kit_email_resent", { kit_order_id: id, message_id: result.id });
      // Return the Resend message id + timestamp so the admin UI can confirm the send.
      return c.json({ ok: true, id: result.id, sentAt: new Date().toISOString() });
    } catch (err) {
      logger.error("admin_kit_email_resend_failed", { kit_order_id: id, message: (err as Error).message });
      return c.json({ error: "resend_failed", code: "KIT_EMAIL_RESEND_FAILED", message: (err as Error).message }, 502);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/engagements — all engagement rows cross-tenant
  // -------------------------------------------------------------------------
  app.get("/api/admin/engagements", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const result = await db.query<{
        id: string;
        tenant_id: string;
        brand_id: string;
        sku: string;
        status: string;
        contact_email: string | null;
        note: string | null;
        created_at: string;
        updated_at: string;
        brand_name: string | null;
        tenant_name: string | null;
      }>(
        `SELECT e.id, e.tenant_id, e.brand_id, e.sku, e.status,
                e.contact_email, e.note, e.created_at, e.updated_at,
                b.name AS brand_name, t.name AS tenant_name
         FROM engagement e
         LEFT JOIN brands b ON b.id = e.brand_id
         LEFT JOIN tenants t ON t.id = e.tenant_id
         ORDER BY e.created_at DESC
         LIMIT 500`
      );

      logger.info("admin_engagements_fetched", { count: result.rows.length });

      return c.json({ engagements: result.rows });
    } catch (err) {
      logger.error("admin_engagements_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ENGAGEMENTS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/admin/engagements/:id — update engagement status (cross-tenant)
  // -------------------------------------------------------------------------
  app.patch("/api/admin/engagements/:id", requireAuth, requireSuperAdmin, async (c) => {
    const id = c.req.param("id") ?? "";

    // Validate UUID path param
    if (!UUID_RE.test(id)) {
      return c.json({ error: "Bad Request", code: "INVALID_ID" }, 400);
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Bad Request", code: "INVALID_JSON" }, 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("status" in body) ||
      typeof (body as Record<string, unknown>).status !== "string"
    ) {
      return c.json({ error: "Bad Request", code: "MISSING_STATUS" }, 400);
    }

    const status = ((body as Record<string, unknown>).status as string).trim();

    if (!VALID_STATUSES.has(status)) {
      return c.json(
        {
          error: "Bad Request",
          code: "INVALID_STATUS",
          allowed: Array.from(VALID_STATUSES),
        },
        400
      );
    }

    try {
      const result = await db.query<{
        id: string;
        status: string;
        updated_at: string;
      }>(
        `UPDATE engagement
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, status, updated_at`,
        [status, id]
      );

      if (result.rows.length === 0) {
        return c.json({ error: "Not Found", code: "ENGAGEMENT_NOT_FOUND" }, 404);
      }

      logger.info("admin_engagement_status_updated", { engagement_id: id, status });

      return c.json({ engagement: result.rows[0] });
    } catch (err) {
      logger.error("admin_engagement_update_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ENGAGEMENT_UPDATE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/crm — lightweight CRM annotations (email-keyed).
  //
  // Deliberately SEPARATE from /leads and /kit-orders (not a JOIN). The web
  // client merges these annotations into the leads rows by email.
  // migrationPending is always false (migrations run at boot); the field stays
  // for web-client compatibility.
  // -------------------------------------------------------------------------
  app.get("/api/admin/crm", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const result = await db.query<{
        email: string;
        stage: string;
        note: string | null;
        next_follow_up: string | null;
        owner: string | null;
        updated_at: string;
      }>(
        `SELECT email, stage, note, next_follow_up, owner, updated_at
           FROM crm_contact
          ORDER BY (next_follow_up IS NULL), next_follow_up ASC, updated_at DESC
          LIMIT 1000`
      );
      logger.info("admin_crm_fetched", { count: result.rows.length });
      return c.json({ contacts: result.rows, migrationPending: false });
    } catch (err) {
      logger.error("admin_crm_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CRM_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/admin/crm — upsert a contact's stage / note / next_follow_up.
  // Email in the body (not the path) so addresses with reserved URL chars need
  // no encoding dance. All validation is in normalizeCrmPatch (unit-tested).
  // -------------------------------------------------------------------------
  app.patch("/api/admin/crm", requireAuth, requireSuperAdmin, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "Bad Request", code: "INVALID_JSON" }, 400);
    }

    const parsed = normalizeCrmPatch(raw);
    if (!parsed.ok) {
      return c.json({ error: "Bad Request", code: parsed.code, message: parsed.message }, 400);
    }
    const p = parsed.patch;
    const auth = c.get("auth") as { userId?: string } | undefined;

    try {
      const contact = await upsertCrmContact(db, p, auth?.userId ?? null);
      logger.info("admin_crm_upserted", { stage: p.stage ?? "unchanged" });
      return c.json({ contact });
    } catch (err) {
      logger.error("admin_crm_upsert_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CRM_UPSERT_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/contacts/:email/dossier — o ficheiro do cliente.
  //
  // Founder directive (01/09): every client has their own file from the first
  // email on. Pure READ aggregation over what is already recorded append-only:
  // smartlead_event (raw provider events, reply content included when the
  // stored payload carries it), crm_contact (stage + note-line history),
  // lead_capture (tests + attribution), kit_order / ai_audit_order
  // (purchases), nurture_enrollment / nurture_send_log. No new tables, no
  // writes. Capped at DOSSIER_MAX_ENTRIES (200), newest first.
  //
  // GDPR/LGPD note: this view aggregates EXISTING personal data for a
  // legitimate CRM purpose (Art. 6(1)(f) GDPR / Art. 7(IX) LGPD — same basis
  // as the underlying tables); it creates and retains NO new personal data.
  // Deletion/DSR requests are handled by deleting the underlying rows (the
  // existing DSR machinery) — the dossier then simply has nothing to show.
  //
  // Each source is queried independently and fails soft INTO THE RESPONSE
  // (sourcesUnavailable lists what could not be read) — degradation is
  // visible, never silent, and one broken table never blanks the whole file.
  // -------------------------------------------------------------------------
  app.get("/api/admin/contacts/:email/dossier", requireAuth, requireSuperAdmin, async (c) => {
    const email = normalizeDossierEmail(c.req.param("email") ?? "");
    if (!email) {
      return c.json({ error: "Bad Request", code: "INVALID_EMAIL" }, 400);
    }

    const sourcesUnavailable: string[] = [];
    const groups: DossierEntry[][] = [];

    // 1. Smartlead events (latest 200 — the per-source cap mirrors the total).
    let smartleadOk = false;
    try {
      const r = await db.query<{
        event_type: string;
        campaign_id: number | null;
        payload: unknown;
        received_at: string;
      }>(
        `SELECT event_type, campaign_id, payload, received_at
           FROM smartlead_event
          WHERE lead_email = $1
          ORDER BY received_at DESC
          LIMIT 200`,
        [email]
      );
      groups.push(smartleadEntries(r.rows));
      smartleadOk = true;
    } catch (err) {
      sourcesUnavailable.push("smartlead");
      logger.error("admin_dossier_source_failed", {
        source: "smartlead",
        message: (err as Error).message?.slice(0, 160),
      });
    }

    // 2. CRM annotation — current stage + the note-line history.
    let crm: {
      stage: string;
      note: string | null;
      next_follow_up: string | null;
      owner: string | null;
      updated_at: string;
    } | null = null;
    try {
      const r = await db.query<{
        stage: string;
        note: string | null;
        next_follow_up: string | null;
        owner: string | null;
        updated_at: string;
      }>(
        `SELECT stage, note, next_follow_up, owner, updated_at
           FROM crm_contact
          WHERE email = $1`,
        [email]
      );
      crm = r.rows[0] ?? null;
      if (crm) {
        // "[smartlead] …" note lines are echoes of source 1 — skip them only
        // when source 1 actually loaded (see crmNoteEntries).
        groups.push(crmNoteEntries(crm, { skipSmartleadLines: smartleadOk }));
      }
    } catch (err) {
      sourcesUnavailable.push("crm");
      logger.error("admin_dossier_source_failed", {
        source: "crm",
        message: (err as Error).message?.slice(0, 160),
      });
    }

    // 3. Lead captures (tests + attribution) — same jsonb paths as /leads.
    try {
      const r = await db.query<{
        brand: string;
        source: string;
        origin_from: string | null;
        utm_campaign: string | null;
        created_at: string;
      }>(
        `SELECT brand, source, created_at,
                COALESCE(result->'attribution'->>'from', result->>'from') AS origin_from,
                result->'attribution'->>'utm_campaign' AS utm_campaign
           FROM lead_capture
          WHERE email = $1
          ORDER BY created_at DESC
          LIMIT 50`,
        [email]
      );
      groups.push(leadCaptureEntries(r.rows));
    } catch (err) {
      sourcesUnavailable.push("lead_capture");
      logger.error("admin_dossier_source_failed", {
        source: "lead_capture",
        message: (err as Error).message?.slice(0, 160),
      });
    }

    // 4. Purchases — kit_order + ai_audit_order (both CITEXT email keys).
    const orders: OrderRowForDossier[] = [];
    try {
      const r = await db.query<{
        brand: string;
        status: string;
        created_at: string;
        paid_at: string | null;
        delivered_at: string | null;
      }>(
        `SELECT brand, status, created_at, paid_at, delivered_at
           FROM kit_order
          WHERE email = $1
          ORDER BY created_at DESC
          LIMIT 50`,
        [email]
      );
      for (const row of r.rows) {
        orders.push({ product: "kit", status: row.status, created_at: row.created_at, paid_at: row.paid_at, delivered_at: row.delivered_at, extra: row.brand });
      }
    } catch (err) {
      sourcesUnavailable.push("kit_order");
      logger.error("admin_dossier_source_failed", {
        source: "kit_order",
        message: (err as Error).message?.slice(0, 160),
      });
    }
    try {
      const r = await db.query<{
        status: string;
        business_type: string | null;
        primary_focus: string | null;
        created_at: string;
        paid_at: string | null;
        delivered_at: string | null;
      }>(
        `SELECT status, business_type, primary_focus, created_at, paid_at, delivered_at
           FROM ai_audit_order
          WHERE email = $1
          ORDER BY created_at DESC
          LIMIT 50`,
        [email]
      );
      for (const row of r.rows) {
        orders.push({
          product: "ai_audit",
          status: row.status,
          created_at: row.created_at,
          paid_at: row.paid_at,
          delivered_at: row.delivered_at,
          extra: [row.business_type, row.primary_focus].filter(Boolean).join(" / ") || null,
        });
      }
    } catch (err) {
      sourcesUnavailable.push("ai_audit_order");
      logger.error("admin_dossier_source_failed", {
        source: "ai_audit_order",
        message: (err as Error).message?.slice(0, 160),
      });
    }
    groups.push(orderEntries(orders));

    // 5. Nurture — enrollments + append-only send log.
    try {
      const enrollments = await db.query<{
        sequence: string;
        current_step: number;
        total_steps: number;
        enrolled_at: string;
        suppressed: boolean;
        suppressed_reason: string | null;
        completed_at: string | null;
      }>(
        `SELECT sequence, current_step, total_steps, enrolled_at,
                suppressed, suppressed_reason, completed_at
           FROM nurture_enrollment
          WHERE email = $1
          ORDER BY enrolled_at DESC
          LIMIT 50`,
        [email]
      );
      let sends: NurtureSendRow[] = [];
      try {
        const s = await db.query<{ sequence: string; step: number; sent_at: string }>(
          `SELECT e.sequence, l.step, l.sent_at
             FROM nurture_send_log l
             JOIN nurture_enrollment e ON e.id = l.enrollment_id
            WHERE e.email = $1
            ORDER BY l.sent_at DESC
            LIMIT 100`,
          [email]
        );
        sends = s.rows;
      } catch {
        sourcesUnavailable.push("nurture_send_log");
      }
      groups.push(nurtureEntries(enrollments.rows, sends));
    } catch (err) {
      sourcesUnavailable.push("nurture");
      logger.error("admin_dossier_source_failed", {
        source: "nurture",
        message: (err as Error).message?.slice(0, 160),
      });
    }

    const { entries, truncated } = buildDossier(groups);
    // No PII in logs — count only, never the email.
    logger.info("admin_dossier_fetched", {
      entries: entries.length,
      sourcesUnavailable: sourcesUnavailable.join(",") || "none",
    });
    return c.json({ email, crm, entries, truncated, sourcesUnavailable });
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/recycle-batches — the 60-day recycling batches.
  //
  // The batch artifact IS the append-only "[recycle] proposto <date> campanha
  // <slug>" marker lines on crm_contact (written by the weekly worker job) —
  // no new table. This endpoint rebuilds the batches from those markers so
  // the founder can download a batch as CSV and load it into a NEW SmartLead
  // campaign by hand. The machine never sends.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // GET /api/admin/ccpa-requests — CCPA/CPRA privacy requests, newest first.
  //
  // ccpa_requests was WRITE-ONLY: submissions landed (routes/ccpa.ts) and no
  // surface ever read them — a CCPA request fell into the void (2026-09-02
  // sweep, PENDING 10.A.9). Same cross-tenant super-admin read pattern as the
  // other admin lists; unauthenticated rows (tenant_id NULL) are exactly the
  // ones only this surface can see.
  // -------------------------------------------------------------------------
  app.get("/api/admin/ccpa-requests", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const r = await db.query<{
        id: string;
        requester_email: string;
        requester_name: string | null;
        request_type: string;
        status: string;
        created_at: string;
      }>(
        `SELECT id, requester_email, requester_name, request_type, status, created_at
           FROM ccpa_requests
          ORDER BY created_at DESC
          LIMIT 200`
      );
      logger.info("admin_ccpa_requests_fetched", { count: r.rows.length });
      return c.json({ requests: r.rows });
    } catch (err) {
      logger.error("admin_ccpa_requests_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CCPA_REQUESTS_FAILED" }, 500);
    }
  });

  app.get("/api/admin/recycle-batches", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const r = await db.query<{ email: string; note: string | null }>(
        `SELECT email, note
           FROM crm_contact
          WHERE note LIKE '%[recycle] proposto%'
          ORDER BY updated_at DESC
          LIMIT 2000`
      );
      const batches = groupRecycleBatches(r.rows);
      logger.info("admin_recycle_batches_fetched", {
        batches: batches.length,
        contacts: r.rows.length,
      });
      return c.json({ batches });
    } catch (err) {
      logger.error("admin_recycle_batches_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "RECYCLE_BATCHES_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/system-health — infra health + env key presence + engine liveness
  // -------------------------------------------------------------------------
  app.get("/api/admin/system-health", requireAuth, requireSuperAdmin, async (c) => {
    // Check Postgres connectivity
    let postgresStatus: "ok" | "error" = "ok";
    try {
      await db.query("SELECT 1");
    } catch {
      postgresStatus = "error";
    }

    // Engine liveness — live = at least one real key is set for that engine
    const anthropicLive  = present("ANTHROPIC_API_KEY") || present("AWS_ACCESS_KEY_ID");
    const openaiLive     = present("OPENAI_API_KEY");
    const geminiLive     = present("GEMINI_API_KEY");
    const perplexityLive = present("PERPLEXITY_API_KEY");
    const serpLive       = present("SERP_API_KEY");

    const engines = [
      { id: "anthropic",  label: "Anthropic Claude",  live: anthropicLive },
      { id: "openai",     label: "OpenAI GPT-4o",      live: openaiLive },
      { id: "gemini",     label: "Google Gemini",      live: geminiLive },
      { id: "perplexity", label: "Perplexity",         live: perplexityLive },
      { id: "serp",       label: "Google AI Overview", live: serpLive },
    ];

    // Env key presence — boolean only, never the values
    const envKeyNames = [
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "PERPLEXITY_API_KEY",
      "SERP_API_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "ANTHROPIC_API_KEY",
    ] as const;

    const envKeys = envKeyNames.map((name) => ({ name, set: present(name) }));

    // Build attention flags
    const attentionFlags: string[] = [];

    for (const engine of engines) {
      if (!engine.live) {
        attentionFlags.push(`Engine '${engine.id}' running in mock mode`);
      }
    }

    // Warn if ALL AI engine keys are absent (already covered per-engine, but add summary)
    const anyAiLive = anthropicLive || openaiLive || geminiLive || perplexityLive || serpLive;
    if (!anyAiLive) {
      attentionFlags.push("No AI engines have live keys");
    }

    if (!present("STRIPE_WEBHOOK_SECRET")) {
      attentionFlags.push("STRIPE_WEBHOOK_SECRET not set");
    }
    if (!present("RESEND_API_KEY")) {
      attentionFlags.push("RESEND_API_KEY not set");
    }

    const mode = anyAiLive ? "live" : "demo";

    // Real Redis health probe via the shared Railway-Redis client (the old
    // hardcoded "unknown" predates shared-redis.ts). 2s timeout so a Redis
    // outage can't hang the health endpoint.
    let redisStatus: "up" | "down" | "not_configured" = "not_configured";
    const sharedRedis = tryGetSharedRedis();
    if (sharedRedis) {
      try {
        const pong = await Promise.race([
          sharedRedis.ping(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
        ]);
        redisStatus = pong === "PONG" ? "up" : "down";
      } catch {
        redisStatus = "down";
      }
    }
    if (redisStatus !== "up") {
      attentionFlags.push(`Redis is ${redisStatus === "down" ? "unreachable" : "not configured (REDIS_URL unset)"}`);
    }

    // #152 — how much of this month's ledger is MEASURED (tokens × price) vs
    // still a rate/flat estimate. Additive; the founder reads margins from
    // `measured` once it accumulates.
    const apiSpend = await apiSpendBySource(db);
    if (apiSpend === null) {
      attentionFlags.push("api_spend ledger unreadable");
    } else if (apiSpend.legacySchema) {
      attentionFlags.push("api_spend: measured columns missing (migration 20260815000001 not applied) — ledger is estimate-only");
    }

    // -----------------------------------------------------------------------
    // P0-09 — Delivery Health, BESIDE the infra block, never in place of it.
    //
    // The audit's finding was that this panel stayed green through delivery
    // incidents because everything above measures infrastructure. So the same
    // response now carries the answer to "are we delivering?", and its
    // non-green states become attention flags here: a broken loop or a failing
    // canary changes the colour of System Health. That is the whole item.
    //
    // Never fatal: if the delivery read itself falls over, the infra panel
    // still renders and the failure is reported as a flag.
    // -----------------------------------------------------------------------
    let delivery: {
      status: string;
      color: "green" | "amber" | "red";
      counts: Record<string, number>;
      reasons: string[];
      canary: { version: string; status: string };
      readAt: string;
    } | null = null;
    try {
      const dh = await readDeliveryHealth(db);
      delivery = {
        status: dh.rollup.status,
        color: deliveryColor(dh.rollup.status),
        counts: dh.rollup.counts,
        reasons: dh.rollup.reasons,
        canary: { version: dh.canary.version, status: dh.canary.status },
        readAt: dh.rollup.readAt,
      };
      if (dh.rollup.status !== "healthy") {
        attentionFlags.push(
          `Delivery Health is ${dh.rollup.status.replace(/_/g, " ")} — ${dh.rollup.reasons.length} finding(s); see the Delivery Health panel`
        );
      }
      if (dh.canary.status !== "healthy") {
        attentionFlags.push(
          `Ozvor canary (${dh.canary.version}) is ${dh.canary.status.replace(/_/g, " ")}: ${
            dh.canary.reasons[0] ?? "see the Delivery Health panel"
          }`
        );
      }
    } catch (err) {
      logger.error("admin_delivery_health_failed", {
        message: (err as Error).message?.slice(0, 200),
      });
      attentionFlags.push("Delivery Health could not be read — delivery is UNKNOWN, not healthy");
    }

    logger.info("admin_system_health_fetched", {
      postgres: postgresStatus,
      redis: redisStatus,
      mode,
      delivery: delivery?.status ?? "unreadable",
    });

    return c.json({
      engines,
      infrastructure: {
        postgres: postgresStatus,
        redis: redisStatus,
      },
      envKeys,
      attentionFlags,
      mode,
      apiSpend,
      delivery,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/delivery-health — P0-09, RELATORIO §3.4 / §14.
  //
  // "Estamos entregando?" before "as APIs estão online?". Every indicator ships
  // with its contract (owner, source of truth, grain, timezone, inclusion/
  // exclusion, late-data policy, quality test) so the panel can show what a
  // number means and who answers for it. Absent data is returned as
  // not_measured / not_connected / insufficient_evidence — never as 0.
  // -------------------------------------------------------------------------
  app.get("/api/admin/delivery-health", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const dh = await readDeliveryHealth(db);
      logger.info("admin_delivery_health_fetched", {
        status: dh.rollup.status,
        canary: dh.canary.status,
        canary_version: dh.canaryVersion,
      });
      return c.json({
        status: dh.rollup.status,
        color: deliveryColor(dh.rollup.status),
        readAt: dh.rollup.readAt,
        counts: dh.rollup.counts,
        reasons: dh.rollup.reasons,
        indicators: dh.rollup.indicators.map((i) => ({
          id: i.id,
          label: i.label,
          status: i.status,
          color: deliveryColor(i.status),
          value: i.value,
          sample: i.sample,
          unit: i.unit,
          direction: i.direction,
          degradedAt: i.degradedAt,
          failingAt: i.failingAt,
          reason: i.reason,
          contract: {
            question: i.contract.question,
            owner: i.contract.owner,
            sourceOfTruth: i.contract.sourceOfTruth,
            grain: i.contract.grain,
            timezone: i.contract.timezone,
            windowDays: i.contract.windowDays,
            includes: i.contract.includes,
            excludes: i.contract.excludes,
            lateData: i.contract.lateData,
            qualityTest: i.contract.qualityTest,
            minSample: i.contract.minSample,
          },
        })),
        canary: {
          version: dh.canary.version,
          status: dh.canary.status,
          color: deliveryColor(dh.canary.status),
          auditId: dh.canary.auditId,
          checks: dh.canary.checks.map((k) => ({
            id: k.id,
            label: k.label,
            status: k.status,
            color: deliveryColor(k.status),
            detail: k.detail,
          })),
        },
      });
    } catch (err) {
      logger.error("admin_delivery_health_error", { message: (err as Error).message?.slice(0, 200) });
      return c.json({ error: "internal_error", code: "DELIVERY_HEALTH_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/analytics — funnel metrics, MRR, ARR, conversion rates, trends
  // -------------------------------------------------------------------------
  app.get("/api/admin/analytics", requireAuth, requireSuperAdmin, async (c) => {
    try {
      // 1. Total leads
      const leadsRes = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lead_capture`
      );
      const totalLeads = parseInt(leadsRes.rows[0]?.count ?? "0", 10);

      // 2. Kit orders — count ONLY paid/delivered. Pending, failed and
      //    refunded orders are not revenue; counting them all inflated the
      //    reported Kit revenue (kitCount * $29). Matches lib/cockpit.ts.
      const kitRes = await db.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IN ('paid', 'delivered')) AS count FROM kit_order`
      );
      const kitCount = parseInt(kitRes.rows[0]?.count ?? "0", 10);

      // 3. Active subscriptions by plan_tier
      const subRes = await db.query<{ plan_tier: string; count: string }>(
        `SELECT plan_tier, COUNT(*) AS count
         FROM billing_subscriptions
         WHERE status = $1
         GROUP BY plan_tier`,
        ["active"]
      );
      const subMap: Record<string, number> = {};
      for (const row of subRes.rows) {
        subMap[row.plan_tier] = parseInt(row.count, 10);
      }
      // Phantom `starter` tier removed (PENDING 10.A.7).
      const growthSubs      = subMap["growth"]  ?? 0;
      const agencySubs      = subMap["agency"]  ?? 0;
      const totalActiveSubs = growthSubs + agencySubs;
      // RECEIVED-value MRR: what Stripe actually bills active subs (annual
      // amortized + founder/coupon discounts), same source as the revenue
      // surface so the founder never sees two different MRR numbers. Degrades to
      // list price when Stripe is unavailable (see lib/received-mrr.ts).
      const receivedMrr     = await fetchReceivedMrr(db);
      const mrr             = receivedMrr.monthlyUsd;
      const mrrListUsd      = receivedMrr.listMonthlyUsd;
      const mrrSource       = receivedMrr.source;
      const arr             = mrr * 12;

      // 4. Engagements by status + sku (for pipeline value)
      const engRes = await db.query<{ status: string; sku: string; count: string }>(
        `SELECT status, sku, COUNT(*) AS count FROM engagement GROUP BY status, sku`
      );
      const engStatusMap: Record<string, number> = { requested: 0, contacted: 0, won: 0, lost: 0 };
      let pipelineValue = 0;
      for (const row of engRes.rows) {
        const cnt = parseInt(row.count, 10);
        const s = row.status as keyof typeof engStatusMap;
        if (s in engStatusMap) {
          engStatusMap[s] = (engStatusMap[s] ?? 0) + cnt;
        }
        // Open engagements (requested + contacted) contribute to pipeline value
        if (row.status === "requested" || row.status === "contacted") {
          const price =
            row.sku === "geo_sprint"  ? GEO_SPRINT_PRICE_USD :
            row.sku === "managed_geo" ? MANAGED_GEO_PRICE_USD :
            0;
          pipelineValue += cnt * price;
        }
      }

      // 5. Nurture active — degrade gracefully if table doesn't exist yet
      let nurtureActive = 0;
      try {
        const nurtureRes = await db.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM nurture_enrollment
           WHERE suppressed = FALSE AND current_step < total_steps`
        );
        nurtureActive = parseInt(nurtureRes.rows[0]?.count ?? "0", 10);
      } catch {
        // nurture_enrollment may not exist in older environments — return 0 silently
        logger.info("admin_analytics_nurture_unavailable", {});
      }

      // 6. Churn metrics
      const churnRes = await db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count
         FROM billing_subscriptions
         WHERE status IN ($1, $2)
         GROUP BY status`,
        ["canceled", "past_due"]
      );
      const churnMap: Record<string, number> = {};
      for (const row of churnRes.rows) {
        churnMap[row.status] = parseInt(row.count, 10);
      }

      // 7. Leads per week — last 12 weeks
      const leadsWeekRes = await db.query<{ week: string; count: string }>(
        `SELECT date_trunc('week', created_at)::text AS week, COUNT(*) AS count
         FROM lead_capture
         WHERE created_at >= NOW() - INTERVAL '12 weeks'
         GROUP BY date_trunc('week', created_at)
         ORDER BY week ASC`
      );

      // 8. Kit orders per week — last 12 weeks
      const kitWeekRes = await db.query<{ week: string; count: string }>(
        `SELECT date_trunc('week', created_at)::text AS week, COUNT(*) AS count
         FROM kit_order
         WHERE created_at >= NOW() - INTERVAL '12 weeks'
         GROUP BY date_trunc('week', created_at)
         ORDER BY week ASC`
      );

      // Conversion rate formatter — avoids division by zero
      const fmtPct = (num: number, denom: number): string => {
        if (denom === 0) return "0.0%";
        return `${((num / denom) * 100).toFixed(1)}%`;
      };

      logger.info("admin_analytics_fetched", {});

      return c.json({
        funnel: {
          totalLeads,
          kitOrders: {
            count:      kitCount,
            revenueUsd: kitCount * KIT_PRICE_USD,
          },
          activeSubscriptions: {
            growth:  growthSubs,
            agency:  agencySubs,
            total:   totalActiveSubs,
          },
          mrr,
          arr,
          mrrListUsd,
          mrrSource,
          engagements: {
            requested:       engStatusMap["requested"],
            contacted:       engStatusMap["contacted"],
            won:             engStatusMap["won"],
            lost:            engStatusMap["lost"],
            pipelineValueUsd: pipelineValue,
          },
          nurtureActive,
        },
        conversion: {
          leadToKit: fmtPct(kitCount, totalLeads),
          leadToSub: fmtPct(totalActiveSubs, totalLeads),
          kitToSub:  fmtPct(totalActiveSubs, kitCount),
        },
        churn: {
          canceled: churnMap["canceled"] ?? 0,
          pastDue:  churnMap["past_due"] ?? 0,
        },
        trends: {
          leadsPerWeek:     leadsWeekRes.rows.map((r) => ({ week: r.week, count: parseInt(r.count, 10) })),
          kitOrdersPerWeek: kitWeekRes.rows.map((r)  => ({ week: r.week, count: parseInt(r.count, 10) })),
        },
      });
    } catch (err) {
      logger.error("admin_analytics_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ANALYTICS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/revenue — full money picture: recurring MRR/ARR (active subs
  // only), one-time Kit + Pages revenue, refund counts. Same shared query the
  // operator surface uses, so the founder and Hermes never see different money.
  // -------------------------------------------------------------------------
  app.get("/api/admin/revenue", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const summary = await fetchRevenueSummary(db);
      logger.info("admin_revenue_fetched", {});
      return c.json(summary);
    } catch (err) {
      logger.error("admin_revenue_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "REVENUE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/cadence — the same autonomous-loop brief Hermes reads
  // (follow-ups due, new leads to triage, upsell targets, stale contacts), so
  // the founder sees exactly the worklist the agent is acting on.
  // -------------------------------------------------------------------------
  app.get("/api/admin/cadence", requireAuth, requireSuperAdmin, async (c) => {
    try {
      const cadence = await fetchOperatingCadence(db);
      logger.info("admin_cadence_fetched", cadence.summary);
      return c.json(cadence);
    } catch (err) {
      logger.error("admin_cadence_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CADENCE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/opportunities — upsell targets
  // -------------------------------------------------------------------------
  app.get("/api/admin/opportunities", requireAuth, requireSuperAdmin, async (c) => {
    // 1. Kit buyers without an active subscription (best-effort join on email)
    let kitBuyersWithoutSub: Array<{
      email: string;
      brand: string;
      kitPaidAt: string | null;
      suggestedAction: string;
    }> = [];

    try {
      const kitBuyersRes = await db.query<{
        email: string;
        brand: string;
        paid_at: string | null;
      }>(
        `SELECT k.email, k.brand, k.paid_at
         FROM kit_order k
         WHERE k.status IN ($1, $2)
           AND k.email IS NOT NULL
           AND k.email NOT IN (
             SELECT u.email
             FROM users u
             JOIN billing_subscriptions bs ON bs.tenant_id = u.tenant_id
             WHERE bs.status = $3
           )
         ORDER BY k.paid_at DESC NULLS LAST
         LIMIT 50`,
        ["paid", "delivered", "active"]
      );

      kitBuyersWithoutSub = kitBuyersRes.rows.map((row) => ({
        email:           row.email,
        brand:           row.brand,
        kitPaidAt:       row.paid_at ?? null,
        suggestedAction: "Upsell to Growth or DFY",
      }));
    } catch (err) {
      logger.error("admin_opportunities_kit_buyers_error", { message: (err as Error).message });
      // Degrade gracefully — return empty array
    }

    // 2. Hot DFY leads — leads with email (prefer marketing_consent = TRUE)
    let hotDfyLeads: Array<{
      email: string;
      brand: string;
      createdAt: string;
      suggestedAction: string;
    }> = [];

    try {
      // Primary query — uses marketing_consent column (added in migration 20260625000001)
      const leadsRes = await db.query<{
        email: string;
        brand: string;
        created_at: string;
      }>(
        `SELECT email, brand, created_at
         FROM lead_capture
         WHERE email IS NOT NULL
           AND marketing_consent = TRUE
         ORDER BY created_at DESC
         LIMIT 50`
      );

      hotDfyLeads = leadsRes.rows.map((row) => ({
        email:           row.email,
        brand:           row.brand,
        createdAt:       row.created_at,
        suggestedAction: "Offer Get-Cited Kit or DFY Sprint",
      }));
    } catch {
      // marketing_consent column may not exist in older environments — fall back to all leads
      try {
        const leadsRes = await db.query<{
          email: string;
          brand: string;
          created_at: string;
        }>(
          `SELECT email, brand, created_at
           FROM lead_capture
           WHERE email IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 50`
        );

        hotDfyLeads = leadsRes.rows.map((row) => ({
          email:           row.email,
          brand:           row.brand,
          createdAt:       row.created_at,
          suggestedAction: "Offer Get-Cited Kit or DFY Sprint",
        }));
      } catch (err2) {
        logger.error("admin_opportunities_leads_error", { message: (err2 as Error).message });
        // Degrade gracefully — return empty array
      }
    }

    logger.info("admin_opportunities_fetched", {
      kitBuyersCount: kitBuyersWithoutSub.length,
      hotLeadsCount:  hotDfyLeads.length,
    });

    return c.json({
      kitBuyersWithoutSub,
      hotDfyLeads,
      note: "Best-effort joins on email. Leads with no email are excluded.",
    });
  });

  // -------------------------------------------------------------------------
  // Platform provider keys — founder-rotatable, WRITE-ONLY.
  // GET returns presence metadata (last4/rotated_at) — never a key value.
  // PUT stores a new key (AES-256-GCM, platform_provider_key) and applies it
  // to the running api immediately; the worker refreshes within 60s.
  // DELETE removes the override → env fallback restored on next refresh.
  // -------------------------------------------------------------------------

  app.get("/api/admin/provider-keys", requireAuth, requireSuperAdmin, async (c) => {
    let rows: { provider: string; key_last4: string; rotated_at: string }[] = [];
    try {
      const res = await db.query<{ provider: string; key_last4: string; rotated_at: string }>(
        `SELECT provider, key_last4, rotated_at FROM platform_provider_key`
      );
      rows = res.rows;
    } catch (err) {
      // Migrations run at boot — any error here (missing table included, which
      // would mean a broken deploy) is a real failure and must be visible.
      logger.error("admin_provider_keys_query_failed", {
        code: (err as { code?: string }).code ?? "unknown",
        message: (err as Error).message?.slice(0, 120),
      });
      return c.json({ error: "internal_error", code: "PROVIDER_KEYS_QUERY_FAILED" }, 500);
    }
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const keys = PLATFORM_KEY_PROVIDERS.map((p) => {
      const row = byProvider.get(p);
      return {
        provider: p,
        env_var: PLATFORM_KEY_ENV_VAR[p],
        env_configured: bootEnvHasKey(p),
        override: row ? { last4: row.key_last4, rotated_at: row.rotated_at } : null,
        active_source: row ? "dashboard" : bootEnvHasKey(p) ? "railway_env" : "none",
      };
    });
    return c.json({ keys });
  });

  app.put("/api/admin/provider-keys/:provider", requireAuth, requireSuperAdmin, async (c) => {
    const provider = c.req.param("provider") ?? "";
    let body: { key?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", message: "Invalid JSON body." }, 400);
    }
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const validationError = validatePlatformKeyInput(provider, key);
    if (validationError) {
      return c.json({ error: "invalid_input", message: validationError }, 400);
    }
    let encrypted: Buffer;
    try {
      encrypted = encryptToken(key).encrypted;
    } catch {
      // OAUTH_TOKEN_KEY missing/misconfigured — surface clearly, log no detail.
      logger.error("admin_provider_key_encrypt_unavailable", { provider });
      return c.json(
        { error: "encryption_unavailable", message: "Encryption key not configured on the server." },
        500
      );
    }
    const auth = c.get("auth") as { userId?: string } | undefined;
    const last4 = key.slice(-4);
    await db.query(
      `INSERT INTO platform_provider_key (provider, key_encrypted, key_last4, rotated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE
         SET key_encrypted = EXCLUDED.key_encrypted,
             key_last4     = EXCLUDED.key_last4,
             rotated_by    = EXCLUDED.rotated_by,
             rotated_at    = NOW()`,
      [provider, encrypted, last4, auth?.userId ?? null]
    );
    try {
      await refreshPlatformKeys(db);
    } catch (err) {
      // Hermes review: never claim success when the runtime did not apply the
      // key. The row IS stored; the 60s interval will retry the apply.
      logger.error("admin_platform_key_apply_failed", { provider });
      return c.json(
        {
          error: "apply_failed",
          code: "KEY_STORED_NOT_APPLIED",
          message:
            "The key was stored encrypted, but applying it to the running API failed. It will be retried automatically within 60s — check system health before relying on it.",
        },
        500
      );
    }
    logger.info("admin_platform_key_rotated", { provider, last4 });
    return c.json({
      ok: true,
      provider,
      last4,
      note: "Active in the API now; the worker picks it up within 60 seconds.",
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/assets — the asset library (deliverables, brand, GTM pack).
  // Static manifest from packages/shared; the Assets tab renders it.
  // -------------------------------------------------------------------------
  app.get("/api/admin/assets", requireAuth, requireSuperAdmin, async (c) => {
    // Gated assets resolve to freshly-signed /api/download URLs so the founder
    // can download them from the Assets tab without any public link existing.
    const origin = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";
    return c.json({ assets: resolveAssetDownloads(origin) });
  });

  app.delete("/api/admin/provider-keys/:provider", requireAuth, requireSuperAdmin, async (c) => {
    const provider = c.req.param("provider") ?? "";
    if (!isPlatformKeyProvider(provider)) {
      return c.json({ error: "invalid_input", message: "unknown provider" }, 400);
    }
    await db.query(`DELETE FROM platform_provider_key WHERE provider = $1`, [provider]);
    try {
      await refreshPlatformKeys(db);
    } catch (err) {
      logger.error("admin_platform_key_revert_failed", { provider });
      return c.json(
        {
          error: "apply_failed",
          code: "OVERRIDE_REMOVED_NOT_REVERTED",
          message:
            "The override row was removed, but reverting the running API to the env key failed. It will be retried automatically within 60s.",
        },
        500
      );
    }
    logger.info("admin_platform_key_override_removed", { provider });
    return c.json({
      ok: true,
      provider,
      note: "Override removed — reverted to the Railway env key (worker within 60s).",
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/agent-ops — #151: the CEO→VP→job drill-down.
  // One query builder (lib/agent-ops.ts) shared with the operator route, so
  // the founder's screen and Hermes's Daily Brief can never disagree.
  // ops.* is PII-free by construction (slugs/hashes/numbers only).
  // -------------------------------------------------------------------------
  app.get("/api/admin/agent-ops", requireAuth, requireSuperAdmin, async (c) => {
    const days = clampDays(c.req.query("days"));
    try {
      const summary = await agentOpsSummary(db, days);
      return c.json(summary);
    } catch (err) {
      logger.error("admin_agent_ops_failed", { message: (err as Error).message?.slice(0, 160) });
      return c.json({ error: "internal", message: "Could not load agent ops." }, 500);
    }
  });
}
