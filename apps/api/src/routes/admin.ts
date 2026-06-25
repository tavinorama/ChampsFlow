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
 *
 * Hard rules:
 *   - Parameterized queries ONLY — no string interpolation in any SQL
 *   - No PII in logs (no emails, no tenant names in log entries)
 *   - All inputs validated at the API boundary before business logic
 *   - Auth: requireAuth + requireSuperAdmin on every route
 */

import { Hono } from "hono";
import { requireAuth, requireSuperAdmin } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["requested", "contacted", "won", "lost"]);

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
            starter: byTier["starter"] ?? 0,
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
      const result = await db.query<{
        id: string;
        name: string;
        plan_tier: string | null;
        created_at: string;
        brand_count: string;
      }>(
        `SELECT t.id, t.name, t.plan_tier, t.created_at,
                COUNT(DISTINCT b.id) AS brand_count
         FROM tenants t
         LEFT JOIN brands b ON b.tenant_id = t.id
         GROUP BY t.id
         ORDER BY t.created_at DESC
         LIMIT 200`
      );

      logger.info("admin_clients_fetched", { count: result.rows.length });

      return c.json({
        clients: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          plan_tier: row.plan_tier,
          created_at: row.created_at,
          brand_count: parseInt(row.brand_count, 10),
        })),
      });
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
      }>(
        `SELECT id, email, brand, category, region, source, created_at
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
}
