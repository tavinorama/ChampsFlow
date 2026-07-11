/**
 * engagements.ts — OrganicPosts done-for-you (DFY) handoff.
 *
 * The consultancy arm surfaced as a billable, in-product request. A subscriber
 * who won't execute their GEO plan themselves requests an engagement from
 * /brands/[id]; this creates a tenant-scoped `engagement` row (the "seen +
 * costed" handoff) that the ops team advances out-of-band.
 *
 * Tenant-scoped (RLS): the client creates + reads its own requests only.
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { requireAuth, requireRole } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SKUS = new Set(["geo_sprint", "managed_geo"]);

export function registerEngagementRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/engagements — request an OrganicPosts done-for-you engagement
  // -------------------------------------------------------------------------
  app.post("/api/engagements", requireAuth, requireRole(["owner", "editor"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId, userId } = auth;

    let body: { brandId?: string; sku?: string; note?: string; email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    const brandId = (body.brandId ?? "").trim();
    const sku = (body.sku ?? "").trim();
    const note = ((body.note ?? "").trim() || null)?.slice(0, 2000) ?? null;
    const email = (body.email ?? "").trim() || null;

    if (!UUID_RE.test(brandId)) return c.json({ message: "A valid brandId is required." }, 400);
    if (!SKUS.has(sku)) return c.json({ message: "sku must be 'geo_sprint' or 'managed_geo'." }, 400);
    if (email && !EMAIL_RE.test(email)) return c.json({ message: "Invalid email." }, 400);

    await db.setTenantId(tenantId);

    // Snapshot the brand for sales (RLS scopes the SELECT to this tenant — a
    // brandId from another tenant returns no row → 404, never leaks).
    const b = await db.query<{ name: string; category: string | null; region: string }>(
      `SELECT name, category, region FROM brands WHERE id = $1`,
      [brandId]
    );
    const brand = b.rows[0];
    if (!brand) return c.json({ message: "Brand not found." }, 404);

    const snapshot = {
      name: brand.name,
      category: brand.category,
      region: brand.region,
      requested_by: userId,
    };

    const id = randomUUID();
    await db.query(
      `INSERT INTO engagement
         (id, tenant_id, brand_id, sku, contact_email, note, brand_snapshot, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'requested', NOW(), NOW())`,
      [id, tenantId, brandId, sku, email, note, jsonbParam(snapshot)]
    );

    // Best-effort audit trail (reuse audit_log; never blocks the request).
    try {
      await db.query(
        `INSERT INTO audit_log
           (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, created_at)
         VALUES ('engagement_requested', $1, $2, 'engagement', $3, $4, NOW())`,
        [userId, tenantId, id, jsonbParam({ brandId, sku })]
      );
    } catch (err) {
      logger.warn("engagement_audit_log_failed", { message: (err as Error).message });
    }

    logger.info("engagement_requested", { tenant_id: tenantId, sku });
    return c.json({ id, sku, status: "requested" }, 201);
  });

  // -------------------------------------------------------------------------
  // GET /api/engagements — this tenant's engagements (so the UI reflects state)
  // -------------------------------------------------------------------------
  app.get("/api/engagements", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const res = await db.query<{
      id: string; brand_id: string; sku: string; status: string; created_at: string;
    }>(
      `SELECT id, brand_id, sku, status, created_at FROM engagement ORDER BY created_at DESC`
    );
    return c.json({ engagements: res.rows });
  });
}
