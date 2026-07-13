/**
 * operator.ts — Hermes business-operations API ('operator' + 'business' scopes).
 *
 * The founder runs operations through the Hermes agent (VPS): market analysis,
 * revenue tracking, upselling, lead follow-up, opportunity triage. These
 * endpoints give it that surface — machine-authenticated, unscoped reads over
 * the platform's OWN business data.
 *
 * Access tiers:
 *   'operator'            — PII-free monitoring (lives in api-keys.ts)
 *   'operator'+'business' — everything here. Includes lead contact data
 *     (emails): authorized by the founder as data controller; the Hermes VPS
 *     acts as processor. ROPA entry ships with P5 (legal completion).
 *
 * HARD LIMITS — never exposed at any scope:
 *   - Secrets / key material (platform keys, BYOK keys, OAuth tokens)
 *   - Stripe money movement (charges, refunds, payouts) — founder only
 *   - Destructive operations (no DELETEs anywhere on this surface)
 *   - Raw cross-tenant client CONTENT (drafts, audits detail stay tenant-scoped)
 *
 * Writes are limited to safe, internal, reversible verbs:
 *   - PATCH engagement status (pipeline: requested → contacted → won/lost)
 *   - PATCH CRM annotation (sales stage / note / next follow-up on crm_contact)
 *   - POST nurture enrollment — reuses the compliant email machine
 *     (idempotent, suppression-checked, unsubscribe built in). Hermes cannot
 *     compose free-form outbound email; it can only enroll into sequences the
 *     founder already approved.
 * None of these move money or send free-form email — those stay founder-only.
 *
 * Observability: every access is logged with the key id and row COUNTS —
 * never emails or names in logs.
 */

import { Hono } from "hono";
import { requireOperatorKey } from "./api-keys";
import { enrollNurture, checkNurtureEligibility } from "./nurture";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { mrrForTier, arrFromMrr } from "../../../../packages/shared/src/pricing";
import { fetchEnrichedClients, fetchRevenueSummary } from "../lib/cockpit";
import { fetchOperatingCadence } from "../lib/cadence";
import { normalizeCrmPatch } from "../lib/crm-validation";
import { upsertCrmContact } from "../lib/crm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ENGAGEMENT_STATUSES = new Set(["requested", "contacted", "won", "lost"]);
const VALID_SEQUENCES = new Set(["free_to_kit", "kit_to_dfy"]);

function clampLimit(raw: string | undefined, dflt: number, max: number): number {
  const n = parseInt(raw ?? "", 10);
  if (Number.isNaN(n) || n <= 0) return dflt;
  return Math.min(n, max);
}

export function registerOperatorBusinessRoutes(app: Hono, db: PostgresClient): void {
  const businessKey = requireOperatorKey(db, ["operator", "business"]);

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/analytics — revenue + funnel summary
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/analytics", businessKey, async (c) => {
    try {
      const [leads, leads30d, kitsPaid, subsByTier, engagements] = await Promise.all([
        db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM lead_capture`, []),
        db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM lead_capture WHERE created_at >= NOW() - INTERVAL '30 days'`,
          []
        ),
        db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM kit_order WHERE paid_at IS NOT NULL`,
          []
        ),
        db.query<{ plan_tier: string; count: string }>(
          `SELECT plan_tier, COUNT(*) AS count
             FROM billing_subscriptions
            WHERE status = 'active'
            GROUP BY plan_tier`,
          []
        ),
        db.query<{ status: string; count: string }>(
          `SELECT status, COUNT(*) AS count FROM engagement GROUP BY status`,
          []
        ),
      ]);

      const tiers: Record<string, number> = {};
      for (const row of subsByTier.rows) tiers[row.plan_tier] = parseInt(row.count, 10);
      const growth = tiers["growth"] ?? 0;
      const agency = tiers["agency"] ?? 0;
      // MRR from actively-billing subs only — same canonical rule as the founder
      // dashboard (packages/shared/src/pricing), so the two never disagree.
      const mrrUsd = growth * mrrForTier("growth") + agency * mrrForTier("agency");

      const pipeline: Record<string, number> = {};
      for (const row of engagements.rows) pipeline[row.status] = parseInt(row.count, 10);

      const key = c.get("apiKey");
      logger.info("operator_analytics_accessed", { key_id: key.id });

      return c.json({
        leads: {
          total: parseInt(leads.rows[0]?.count ?? "0", 10),
          last_30d: parseInt(leads30d.rows[0]?.count ?? "0", 10),
        },
        kit_orders_paid: parseInt(kitsPaid.rows[0]?.count ?? "0", 10),
        subscriptions: { growth, agency },
        mrr_usd: mrrUsd,
        arr_usd: arrFromMrr(mrrUsd),
        dfy_pipeline: pipeline,
        note: "List-price MRR from active Stripe subscriptions; founder-granted plans excluded.",
      });
    } catch (err) {
      logger.error("operator_analytics_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ANALYTICS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/clients?limit=200 — the client cockpit: each tenant
  // with owner email, subscription state, per-tenant MRR, and product usage
  // (audits run + last audit). Same shared query the founder dashboard uses.
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/clients", businessKey, async (c) => {
    const limit = clampLimit(c.req.query("limit"), 200, 500);
    try {
      const clients = await fetchEnrichedClients(db, limit);
      const key = c.get("apiKey");
      logger.info("operator_clients_accessed", { key_id: key.id, count: clients.length });
      return c.json({ clients });
    } catch (err) {
      logger.error("operator_clients_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CLIENTS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/revenue — full money picture (recurring MRR/ARR from
  // active subs + one-time Kit/Pages revenue + refund counts). Read-only;
  // Stripe money movement stays founder-only (hard limit above).
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/revenue", businessKey, async (c) => {
    try {
      const summary = await fetchRevenueSummary(db);
      const key = c.get("apiKey");
      logger.info("operator_revenue_accessed", { key_id: key.id });
      return c.json(summary);
    } catch (err) {
      logger.error("operator_revenue_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "REVENUE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/leads?limit=50 — lead contact data (founder-authorized)
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/leads", businessKey, async (c) => {
    const limit = clampLimit(c.req.query("limit"), 50, 200);
    try {
      const { rows } = await db.query<{
        id: string;
        email: string | null;
        brand: string | null;
        category: string | null;
        region: string | null;
        source: string | null;
        created_at: string;
      }>(
        `SELECT id, email, brand, category, region, source, created_at
           FROM lead_capture
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit]
      );
      const key = c.get("apiKey");
      logger.info("operator_leads_accessed", { key_id: key.id, count: rows.length });
      return c.json({ leads: rows });
    } catch (err) {
      logger.error("operator_leads_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "LEADS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/kit-orders?limit=50
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/kit-orders", businessKey, async (c) => {
    const limit = clampLimit(c.req.query("limit"), 50, 200);
    try {
      const { rows } = await db.query<{
        id: string;
        email: string | null;
        brand: string | null;
        status: string;
        created_at: string;
        paid_at: string | null;
        delivered_at: string | null;
      }>(
        `SELECT id, email, brand, status, created_at, paid_at, delivered_at
           FROM kit_order
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit]
      );
      const key = c.get("apiKey");
      logger.info("operator_kit_orders_accessed", { key_id: key.id, count: rows.length });
      return c.json({ kit_orders: rows });
    } catch (err) {
      logger.error("operator_kit_orders_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "KIT_ORDERS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/opportunities — upsell targets
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/opportunities", businessKey, async (c) => {
    try {
      // Kit buyers with no active subscription (best-effort join on email).
      const { rows: kitBuyers } = await db.query<{
        email: string;
        brand: string | null;
        paid_at: string;
      }>(
        `SELECT k.email, k.brand, k.paid_at
           FROM kit_order k
          WHERE k.paid_at IS NOT NULL
            AND k.email IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM users u
                JOIN billing_subscriptions b ON b.tenant_id = u.tenant_id
               WHERE lower(u.email) = lower(k.email)
                 AND b.status IN ('active', 'trialing')
            )
          ORDER BY k.paid_at DESC
          LIMIT 100`,
        []
      );

      // Recent leads with contact data (14 days).
      const { rows: hotLeads } = await db.query<{
        email: string;
        brand: string | null;
        category: string | null;
        created_at: string;
      }>(
        `SELECT email, brand, category, created_at
           FROM lead_capture
          WHERE email IS NOT NULL
            AND created_at >= NOW() - INTERVAL '14 days'
          ORDER BY created_at DESC
          LIMIT 100`,
        []
      );

      const key = c.get("apiKey");
      logger.info("operator_opportunities_accessed", {
        key_id: key.id,
        kit_buyers: kitBuyers.length,
        hot_leads: hotLeads.length,
      });
      return c.json({
        kit_buyers_without_subscription: kitBuyers,
        recent_leads: hotLeads,
        note: "Best-effort joins on email; leads without email excluded.",
      });
    } catch (err) {
      logger.error("operator_opportunities_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "OPPORTUNITIES_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/engagements — DFY pipeline (cross-tenant)
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/engagements", businessKey, async (c) => {
    try {
      const { rows } = await db.query<{
        id: string;
        sku: string;
        status: string;
        contact_email: string | null;
        note: string | null;
        brand_name: string | null;
        tenant_name: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT e.id, e.sku, e.status, e.contact_email, e.note,
                b.name AS brand_name, t.name AS tenant_name,
                e.created_at, e.updated_at
           FROM engagement e
           LEFT JOIN brands b ON b.id = e.brand_id
           LEFT JOIN tenants t ON t.id = e.tenant_id
          ORDER BY e.created_at DESC
          LIMIT 200`,
        []
      );
      const key = c.get("apiKey");
      logger.info("operator_engagements_accessed", { key_id: key.id, count: rows.length });
      return c.json({ engagements: rows });
    } catch (err) {
      logger.error("operator_engagements_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ENGAGEMENTS_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/operator/engagements/:id — pipeline status transitions only
  // -------------------------------------------------------------------------
  app.patch("/api/v1/operator/engagements/:id", businessKey, async (c) => {
    const id = c.req.param("id") ?? "";
    if (!UUID_RE.test(id)) {
      return c.json({ error: "bad_request", code: "INVALID_ID" }, 400);
    }
    let body: { status?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", code: "INVALID_BODY" }, 400);
    }
    const status = typeof body.status === "string" ? body.status : "";
    if (!VALID_ENGAGEMENT_STATUSES.has(status)) {
      return c.json(
        {
          error: "invalid_input",
          code: "INVALID_STATUS",
          message: "status must be one of: requested, contacted, won, lost",
        },
        400
      );
    }
    try {
      const { rows } = await db.query<{ id: string; status: string }>(
        `UPDATE engagement SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
        [status, id]
      );
      if (!rows[0]) return c.json({ error: "not_found", code: "ENGAGEMENT_NOT_FOUND" }, 404);
      const key = c.get("apiKey");
      logger.info("operator_engagement_updated", { key_id: key.id, engagement_id: id, status });
      return c.json(rows[0]);
    } catch (err) {
      logger.error("operator_engagement_update_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ENGAGEMENT_UPDATE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/cadence — the autonomous-loop brief: follow-ups due,
  // new leads to triage, upsell targets, stale contacts. Hermes reads this to
  // decide what to do, then acts via the write endpoints. Read-only.
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/cadence", businessKey, async (c) => {
    try {
      const cadence = await fetchOperatingCadence(db);
      const key = c.get("apiKey");
      logger.info("operator_cadence_accessed", { key_id: key.id, ...cadence.summary });
      return c.json(cadence);
    } catch (err) {
      logger.error("operator_cadence_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CADENCE_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/crm — read the email-keyed CRM annotations so Hermes
  // knows each contact's current sales stage / note / follow-up. Degrades to an
  // empty list if the crm_contact table has not been migrated yet.
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/crm", businessKey, async (c) => {
    try {
      const { rows } = await db.query<{
        email: string;
        stage: string;
        note: string | null;
        next_follow_up: string | null;
        updated_at: string;
      }>(
        `SELECT email, stage, note, next_follow_up, updated_at
           FROM crm_contact
          ORDER BY (next_follow_up IS NULL), next_follow_up ASC, updated_at DESC
          LIMIT 1000`
      );
      const key = c.get("apiKey");
      logger.info("operator_crm_accessed", { key_id: key.id, count: rows.length });
      return c.json({ contacts: rows, migrationPending: false });
    } catch (err) {
      if ((err as { code?: string }).code === "42P01") {
        return c.json({ contacts: [], migrationPending: true });
      }
      logger.error("operator_crm_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CRM_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/operator/crm — Hermes moves a contact through the sales
  // pipeline: set stage / note / next follow-up. INTERNAL, reversible write on
  // the annotation only — never money, never email (those stay founder-only).
  // Same validation + upsert the founder dashboard uses, so the two never drift.
  // -------------------------------------------------------------------------
  app.patch("/api/v1/operator/crm", businessKey, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", code: "INVALID_BODY" }, 400);
    }
    const parsed = normalizeCrmPatch(raw);
    if (!parsed.ok) {
      return c.json({ error: "invalid_input", code: parsed.code, message: parsed.message }, 400);
    }
    try {
      // updated_by is null: the operator key is a machine actor, not a user row.
      const contact = await upsertCrmContact(db, parsed.patch, null);
      const key = c.get("apiKey");
      logger.info("operator_crm_upserted", { key_id: key.id, stage: parsed.patch.stage ?? "unchanged" });
      return c.json({ contact });
    } catch (err) {
      if ((err as { code?: string }).code === "42P01") {
        return c.json({ error: "migration_pending", code: "CRM_TABLE_MISSING" }, 503);
      }
      logger.error("operator_crm_upsert_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "CRM_UPSERT_FAILED" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/operator/nurture/enroll — founder-approved sequences ONLY.
  // Reuses the compliant nurture machine: idempotent (ON CONFLICT DO NOTHING),
  // suppression-checked, unsubscribe token built in. Hermes cannot send
  // free-form email through this surface.
  // -------------------------------------------------------------------------
  app.post("/api/v1/operator/nurture/enroll", businessKey, async (c) => {
    let body: { email?: unknown; sequence?: unknown; brand?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", code: "INVALID_BODY" }, 400);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const sequence = typeof body.sequence === "string" ? body.sequence : "";
    const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 120) : "";
    if (!EMAIL_RE.test(email)) {
      return c.json({ error: "invalid_input", code: "INVALID_EMAIL" }, 400);
    }
    if (!VALID_SEQUENCES.has(sequence)) {
      return c.json(
        {
          error: "invalid_input",
          code: "INVALID_SEQUENCE",
          message: "sequence must be one of: free_to_kit, kit_to_dfy",
        },
        400
      );
    }
    const seq = sequence as "free_to_kit" | "kit_to_dfy";
    try {
      const eligibility = await checkNurtureEligibility(db, email, seq);
      if (eligibility.suppressed || eligibility.alreadyEnrolled) {
        const key = c.get("apiKey");
        logger.info("operator_nurture_enroll_blocked", {
          key_id: key.id,
          sequence: seq,
          reason: eligibility.suppressed ? "suppressed" : "already_enrolled",
        });
        return c.json(
          {
            enrolled: false,
            reason: eligibility.suppressed ? "suppressed" : "already_enrolled",
            message: eligibility.suppressed
              ? "Lead unsubscribed or converted — suppressed. Nothing sent."
              : "Lead is already in this sequence. Nothing sent.",
          },
          409
        );
      }
      const result = await enrollNurture(db, {
        email,
        sequence: seq,
        brand: brand || "unknown",
        metadata: { enrolled_by: "hermes-operator" },
      });
      const key = c.get("apiKey");
      logger.info("operator_nurture_enrolled", { key_id: key.id, sequence: seq });
      return c.json({ enrolled: !result.alreadyEnrolled, sequence: seq }, 201);
    } catch (err) {
      logger.error("operator_nurture_enroll_error", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "ENROLL_FAILED" }, 500);
    }
  });
}
