/**
 * Agency OS v1 — Agency API routes
 *
 * Routes (architecture §5 API contracts; Agency OS capability):
 *   GET    /api/agency/white-label           — fetch agency branding (Owner)
 *   PUT    /api/agency/white-label           — upsert agency branding (Owner)
 *   POST   /api/brands/:id/share             — create share token for a brand report (Owner)
 *   GET    /api/brands/:id/shares            — list share tokens for a brand (Owner)
 *   DELETE /api/brands/:id/shares/:shareId   — revoke a share token (Owner)
 *   GET    /api/r/:token                     — PUBLIC — resolve share token and return branded report
 *
 * Plan gate:
 *   All management routes require plan_tier = 'agency'. The public /api/r/:token
 *   route has NO plan gate — the token itself is the capability.
 *
 * Security model for the public token route:
 *   - NO auth middleware, NO tenant context set.
 *   - tenant_id and brand_id are resolved EXCLUSIVELY from the token row in
 *     report_share, never from the URL or request headers.
 *   - All downstream queries use the token-resolved tenant_id + brand_id in
 *     explicit WHERE clauses — never RLS alone (RLS is bypassed because no
 *     session tenant is set).
 *   - Invalid/revoked/expired tokens always return 404 with no distinguishing
 *     error text (capability-URL security: no oracle).
 *   - No competitor data, raw probe text, or tenant metadata exposed in the
 *     public response.
 *
 * Hard rules:
 *   - All DB queries parameterized — no string interpolation
 *   - tenant_id resolved from JWT only (authed routes) / token row only (public route)
 *   - No PII in logs
 *   - audit_log: INSERT only (append-only)
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { requireAuth, requireRole } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Domain label map (shared with audits.ts; re-declared here for independence)
// ---------------------------------------------------------------------------

const DOMAIN_LABELS: Record<string, string> = {
  "reddit.com": "Reddit",
  "en.wikipedia.org": "Wikipedia",
  "wikipedia.org": "Wikipedia",
  "linkedin.com": "LinkedIn",
  "g2.com": "G2",
  "trustpilot.com": "Trustpilot",
  "crunchbase.com": "Crunchbase",
  "youtube.com": "YouTube",
  "github.com": "GitHub",
  "twitter.com": "X (Twitter)",
  "x.com": "X (Twitter)",
  "forbes.com": "Forbes",
  "techcrunch.com": "TechCrunch",
  "capterra.com": "Capterra",
  "producthunt.com": "Product Hunt",
};

// ---------------------------------------------------------------------------
// Rate limiting for the public branded report route
// 60 requests / 10 minutes per IP (sliding-window ZSET, @upstash/redis).
// Gracefully skips limiting when Upstash env vars are not configured (dev).
// ---------------------------------------------------------------------------

let _agencyRedis: Redis | null = null;

function getAgencyRedis(): Redis | null {
  if (_agencyRedis) return _agencyRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // dev/test mode — skip rate limiting
  _agencyRedis = new Redis({ url, token });
  return _agencyRedis;
}

const SHARE_RATE_LIMIT = 60;
const SHARE_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SHARE_RATE_WINDOW_S = 600;

async function checkShareRateLimit(ip: string): Promise<boolean> {
  const redis = getAgencyRedis();
  if (!redis) return true; // unconfigured — allow in dev
  const key = `share_rl:${ip}`;
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - SHARE_RATE_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, SHARE_RATE_WINDOW_S);
  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= SHARE_RATE_LIMIT;
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

// ---------------------------------------------------------------------------
// Audit log helper (append-only, parameterized)
// ---------------------------------------------------------------------------

async function writeAuditLog(
  db: PostgresClient,
  eventType: string,
  userId: string | null,
  tenantId: string,
  targetEntity: string,
  targetId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [eventType, userId, tenantId, targetEntity, targetId, JSON.stringify(metadata)]
  );
}

// ---------------------------------------------------------------------------
// Top-sources helper — aggregates source domains from citation_check rows
// ---------------------------------------------------------------------------

function extractTopDomains(
  sourcesArrays: Array<unknown>,
  topN: number
): Array<{ domain: string; label: string }> {
  const counts: Map<string, number> = new Map();

  for (const sources of sourcesArrays) {
    if (!Array.isArray(sources)) continue;
    for (const src of sources) {
      if (typeof src !== "string") continue;
      try {
        const url = new URL(src.startsWith("http") ? src : `https://${src}`);
        const domain = url.hostname.replace(/^www\./, "");
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      } catch {
        // ignore unparseable URLs
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([domain]) => ({
      domain,
      label: DOMAIN_LABELS[domain] ?? domain,
    }));
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAgencyRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/agency/white-label — fetch agency branding
  // Requires: auth + owner role + agency plan
  // -------------------------------------------------------------------------
  app.get("/api/agency/white-label", requireAuth, requireRole(["owner"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId } = auth;

    // Plan gate — must be on agency plan
    const planRes = await db.query<{ plan_tier: string }>(
      `SELECT plan_tier FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tier = planRes.rows[0]?.plan_tier ?? "free";
    if (tier !== "agency") {
      return c.json(
        {
          message:
            "This feature is available on the Agency plan. Upgrade to unlock multi-brand management, white-label reports, and branded sharing.",
          code: "PLAN_LIMIT_AGENCY",
        },
        403
      );
    }

    await db.setTenantId(tenantId);

    const res = await db.query<{
      agency_name: string | null;
      accent_hex: string | null;
      logo_url: string | null;
    }>(
      `SELECT agency_name, accent_hex, logo_url
         FROM white_label
        WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = res.rows[0];

    if (!row) {
      return c.json({ agency_name: null, accent_hex: null, logo_url: null }, 200);
    }

    return c.json(row, 200);
  });

  // -------------------------------------------------------------------------
  // PUT /api/agency/white-label — upsert agency branding
  // Requires: auth + owner role + agency plan
  // Body: { agency_name?: string, accent_hex?: string, logo_url?: string }
  // -------------------------------------------------------------------------
  app.put("/api/agency/white-label", requireAuth, requireRole(["owner"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId } = auth;

    // Plan gate
    const planRes = await db.query<{ plan_tier: string }>(
      `SELECT plan_tier FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tier = planRes.rows[0]?.plan_tier ?? "free";
    if (tier !== "agency") {
      return c.json(
        {
          message:
            "This feature is available on the Agency plan. Upgrade to unlock multi-brand management, white-label reports, and branded sharing.",
          code: "PLAN_LIMIT_AGENCY",
        },
        403
      );
    }

    // Parse body
    let body: {
      agency_name?: unknown;
      accent_hex?: unknown;
      logo_url?: unknown;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body.", code: "INVALID_BODY" }, 400);
    }

    // Validate agency_name
    if (body.agency_name !== undefined && body.agency_name !== null) {
      if (typeof body.agency_name !== "string") {
        return c.json({ message: "agency_name must be a string.", code: "INVALID_FIELD" }, 400);
      }
      if (body.agency_name.length > 100) {
        return c.json(
          { message: "agency_name must be 100 characters or fewer.", code: "INVALID_FIELD" },
          400
        );
      }
    }

    // Validate accent_hex
    if (body.accent_hex !== undefined && body.accent_hex !== null) {
      if (typeof body.accent_hex !== "string") {
        return c.json({ message: "accent_hex must be a string.", code: "INVALID_FIELD" }, 400);
      }
      if (!/^#[0-9a-fA-F]{3,8}$/.test(body.accent_hex)) {
        return c.json(
          {
            message: "accent_hex must be a valid hex colour (e.g. #0A7E5A).",
            code: "INVALID_FIELD",
          },
          400
        );
      }
    }

    // Validate logo_url
    if (body.logo_url !== undefined && body.logo_url !== null) {
      if (typeof body.logo_url !== "string") {
        return c.json({ message: "logo_url must be a string.", code: "INVALID_FIELD" }, 400);
      }
      if (!body.logo_url.startsWith("https://")) {
        return c.json(
          { message: "logo_url must be an absolute HTTPS URL.", code: "INVALID_FIELD" },
          400
        );
      }
    }

    await db.setTenantId(tenantId);

    const agencyName =
      body.agency_name !== undefined
        ? (body.agency_name as string | null)
        : null;
    const accentHex =
      body.accent_hex !== undefined
        ? (body.accent_hex as string | null)
        : null;
    const logoUrl =
      body.logo_url !== undefined ? (body.logo_url as string | null) : null;

    const upsertRes = await db.query<{
      agency_name: string | null;
      accent_hex: string | null;
      logo_url: string | null;
      updated_at: string;
    }>(
      `INSERT INTO white_label (tenant_id, agency_name, accent_hex, logo_url, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id) DO UPDATE
           SET agency_name = EXCLUDED.agency_name,
               accent_hex  = EXCLUDED.accent_hex,
               logo_url    = EXCLUDED.logo_url,
               updated_at  = NOW()
       RETURNING agency_name, accent_hex, logo_url, updated_at`,
      [tenantId, agencyName, accentHex, logoUrl]
    );

    logger.info("agency_white_label_updated", { tenant_id: tenantId });

    return c.json(upsertRes.rows[0], 200);
  });

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/share — create a share token for a brand report
  // Requires: auth + owner role + agency plan
  // Returns: { id, token, share_url, created_at }
  // -------------------------------------------------------------------------
  app.post("/api/brands/:id/share", requireAuth, requireRole(["owner"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId, userId } = auth;
    const brandId = c.req.param("id");

    // Plan gate
    const planRes = await db.query<{ plan_tier: string }>(
      `SELECT plan_tier FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tier = planRes.rows[0]?.plan_tier ?? "free";
    if (tier !== "agency") {
      return c.json(
        {
          message:
            "This feature is available on the Agency plan. Upgrade to unlock multi-brand management, white-label reports, and branded sharing.",
          code: "PLAN_LIMIT_AGENCY",
        },
        403
      );
    }

    await db.setTenantId(tenantId);

    // Verify brand exists and belongs to this tenant. Explicit tenant_id in WHERE
    // is belt-and-suspenders alongside RLS, matching the pattern in the public
    // /api/r/:token route where RLS is not active.
    const brandRes = await db.query<{ id: string }>(
      `SELECT id FROM brands WHERE id = $1 AND tenant_id = $2`,
      [brandId, tenantId]
    );
    if (!brandRes.rows[0]) {
      return c.json({ message: "Brand not found.", code: "NOT_FOUND" }, 404);
    }

    // Generate a cryptographically random UUID as the capability token.
    // randomUUID() produces 122 bits of entropy — sufficient for an unguessable
    // share token that is not easily brute-forced.
    const token = randomUUID();

    const shareRes = await db.query<{
      id: string;
      token: string;
      created_at: string;
    }>(
      `INSERT INTO report_share (token, tenant_id, brand_id, created_by)
            VALUES ($1, $2, $3, $4)
       RETURNING id, token, created_at`,
      [token, tenantId, brandId, userId]
    );

    const share = shareRes.rows[0];

    // Append audit log (fire-and-forget — do not block the response)
    writeAuditLog(db, "share_created", userId, tenantId, "report_share", share.id, {
      brand_id: brandId,
    }).catch((err: Error) => {
      logger.warn("agency_audit_log_failed", { message: err.message });
    });

    logger.info("agency_share_created", { tenant_id: tenantId, brand_id: brandId });

    return c.json(
      {
        id: share.id,
        token: share.token,
        share_url: `/r/${share.token}`,
        created_at: share.created_at,
      },
      201
    );
  });

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/shares — list share tokens for a brand
  // Requires: auth + owner role + agency plan
  // Returns: { shares: [...] }
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id/shares", requireAuth, requireRole(["owner"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId } = auth;
    const brandId = c.req.param("id");

    // Plan gate
    const planRes = await db.query<{ plan_tier: string }>(
      `SELECT plan_tier FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tier = planRes.rows[0]?.plan_tier ?? "free";
    if (tier !== "agency") {
      return c.json(
        {
          message:
            "This feature is available on the Agency plan. Upgrade to unlock multi-brand management, white-label reports, and branded sharing.",
          code: "PLAN_LIMIT_AGENCY",
        },
        403
      );
    }

    await db.setTenantId(tenantId);

    const sharesRes = await db.query<{
      id: string;
      token: string;
      created_at: string;
      revoked_at: string | null;
      expires_at: string | null;
    }>(
      `SELECT id, token, created_at, revoked_at, expires_at
         FROM report_share
        WHERE tenant_id = $1
          AND brand_id  = $2
        ORDER BY created_at DESC`,
      [tenantId, brandId]
    );

    return c.json({ shares: sharesRes.rows }, 200);
  });

  // -------------------------------------------------------------------------
  // DELETE /api/brands/:id/shares/:shareId — revoke a share token
  // Requires: auth + owner role + agency plan
  // Returns: { id, revoked: true }
  // -------------------------------------------------------------------------
  app.delete(
    "/api/brands/:id/shares/:shareId",
    requireAuth,
    requireRole(["owner"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");
      const shareId = c.req.param("shareId");

      // Plan gate
      const planRes = await db.query<{ plan_tier: string }>(
        `SELECT plan_tier FROM tenants WHERE id = $1`,
        [tenantId]
      );
      const tier = planRes.rows[0]?.plan_tier ?? "free";
      if (tier !== "agency") {
        return c.json(
          {
            message:
              "This feature is available on the Agency plan. Upgrade to unlock multi-brand management, white-label reports, and branded sharing.",
            code: "PLAN_LIMIT_AGENCY",
          },
          403
        );
      }

      await db.setTenantId(tenantId);

      // Set revoked_at — idempotent (re-revoking an already-revoked share is safe)
      const revokeRes = await db.query<{ id: string }>(
        `UPDATE report_share
            SET revoked_at = NOW()
          WHERE id        = $1
            AND tenant_id = $2
            AND brand_id  = $3
          RETURNING id`,
        [shareId, tenantId, brandId]
      );

      if (!revokeRes.rows[0]) {
        return c.json({ message: "Share not found.", code: "NOT_FOUND" }, 404);
      }

      logger.info("agency_share_revoked", {
        tenant_id: tenantId,
        brand_id: brandId,
        share_id: shareId,
      });

      return c.json({ id: revokeRes.rows[0].id, revoked: true }, 200);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/r/:token — PUBLIC branded report endpoint
  //
  // SECURITY: This route is intentionally public (no auth, no tenant context).
  // The opaque capability token in the URL IS the access credential.
  // All data access is scoped to the tenant_id + brand_id resolved from the
  // token row. No tenant_id or brand_id is accepted from the request — only
  // the token is used, and it is only used as a lookup key in report_share.
  //
  // Explicit WHERE clauses on every query: RLS alone is NOT relied on here
  // because no Postgres session tenant is set for public requests.
  // -------------------------------------------------------------------------
  app.get("/api/r/:token", async (c) => {
    const token = c.req.param("token");

    // -----------------------------------------------------------------------
    // Rate limit — 60 req / 10 min / IP. Prevents DB-level abuse on the public
    // unauthenticated path. Gracefully no-ops when Upstash is not configured.
    // -----------------------------------------------------------------------
    const ip = clientIp(c);
    const allowed = await checkShareRateLimit(ip).catch(() => true);
    if (!allowed) {
      c.header("Retry-After", "600");
      return c.json({ message: "Too many requests. Please try again later." }, 429);
    }

    // -----------------------------------------------------------------------
    // Step 1: Resolve the share — validate token is active and not expired.
    // The WHERE clause simultaneously checks revocation and expiry.
    // On miss, return 404 with no distinguishing reason (no oracle).
    // IMPORTANT: db.query() runs WITHOUT a tenant session here (the async
    // context has no tenant set) so this executes as the privileged login role
    // with no RLS filtering — the explicit WHERE is what scopes the read.
    // -----------------------------------------------------------------------
    const shareRes = await db.query<{
      tenant_id: string;
      brand_id: string;
    }>(
      `SELECT rs.tenant_id, rs.brand_id
         FROM report_share rs
        WHERE rs.token      = $1
          AND rs.revoked_at IS NULL
          AND (rs.expires_at IS NULL OR rs.expires_at > NOW())`,
      [token]
    );

    const share = shareRes.rows[0];
    if (!share) {
      // Return identical 404 whether the token is unknown, revoked, or expired.
      // This prevents an oracle attack distinguishing the three cases.
      return c.json(
        { message: "Report not found or link is no longer valid.", code: "NOT_FOUND" },
        404
      );
    }

    // Resolved from the token — never from the URL path or request headers.
    const resolvedTenantId = share.tenant_id;
    const resolvedBrandId = share.brand_id;

    // -----------------------------------------------------------------------
    // Step 2: Resolve white-label branding (explicit WHERE, no tenant context)
    // -----------------------------------------------------------------------
    const brandingRes = await db.query<{
      agency_name: string | null;
      accent_hex: string | null;
      logo_url: string | null;
    }>(
      `SELECT agency_name, accent_hex, logo_url
         FROM white_label
        WHERE tenant_id = $1`,
      [resolvedTenantId]
    );
    const branding = brandingRes.rows[0] ?? {
      agency_name: null,
      accent_hex: null,
      logo_url: null,
    };

    // -----------------------------------------------------------------------
    // Step 3: Get brand info (explicit brand_id AND tenant_id — both from
    // the token resolution in step 1, never from the request)
    // -----------------------------------------------------------------------
    const brandRes = await db.query<{
      name: string;
      domain: string | null;
      category: string | null;
    }>(
      `SELECT name, domain, category
         FROM brands
        WHERE id        = $1
          AND tenant_id = $2`,
      [resolvedBrandId, resolvedTenantId]
    );

    const brand = brandRes.rows[0];
    if (!brand) {
      // Should not happen if FK constraints are intact; return 404 defensively.
      return c.json(
        { message: "Report not found or link is no longer valid.", code: "NOT_FOUND" },
        404
      );
    }

    // -----------------------------------------------------------------------
    // Step 4: Get latest completed audit + geo_score
    // Both brand_id AND tenant_id from the resolved share row — not the URL.
    // -----------------------------------------------------------------------
    const auditRes = await db.query<{
      audit_id: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      provider_breakdown: unknown;
      audit_date: string;
    }>(
      `SELECT ga.id           AS audit_id,
              gs.score_brand,
              gs.score_performance,
              gs.score_ai,
              gs.provider_breakdown,
              ga.created_at   AS audit_date
         FROM geo_audit ga
         JOIN geo_score gs
           ON gs.audit_id = ga.id
        WHERE ga.brand_id  = $1
          AND ga.tenant_id = $2
          AND ga.status    = 'complete'
        ORDER BY ga.created_at DESC
        LIMIT 1`,
      [resolvedBrandId, resolvedTenantId]
    );

    const auditRow = auditRes.rows[0];

    // -----------------------------------------------------------------------
    // Step 5: If no completed audit, return minimal response
    // -----------------------------------------------------------------------
    if (!auditRow) {
      return c.json(
        {
          brand: {
            name: brand.name,
            domain: brand.domain,
            category: brand.category,
          },
          scores: null,
          audit_date: null,
          top_sources: [],
          branding,
          no_audit: true,
        },
        200
      );
    }

    // -----------------------------------------------------------------------
    // Step 6: Compute overall score from the 3 vectors
    // Formula: brand*0.3 + performance*0.35 + ai*0.35
    // Provider breakdown may also carry a pre-computed overall.
    // -----------------------------------------------------------------------
    const bd = (auditRow.provider_breakdown ?? {}) as Record<string, unknown>;
    const precomputedOverall =
      typeof (bd as { overall?: unknown }).overall === "number"
        ? (bd as { overall: number }).overall
        : null;

    const scoreBrand = auditRow.score_brand ?? 0;
    const scorePerformance = auditRow.score_performance ?? 0;
    const scoreAi = auditRow.score_ai ?? 0;

    const overall =
      precomputedOverall ??
      Math.round(scoreBrand * 0.3 + scorePerformance * 0.35 + scoreAi * 0.35);

    // Derived citation_readiness: proxy as average of brand + ai scores
    const citationReadiness = Math.round((scoreBrand + scoreAi) / 2);

    // -----------------------------------------------------------------------
    // Step 7: Top cited sources from citation_check
    // Explicit audit_id AND verify via the already-confirmed audit row (which
    // was fetched with brand_id + tenant_id scoping). No second tenant check
    // is needed here because auditRow was already constrained to the resolved
    // brand+tenant in step 4.
    //
    // NEVER set a tenant context — this stays as the privileged login role,
    // and the explicit audit_id is the only scope.
    // -----------------------------------------------------------------------
    const citationRes = await db.query<{ sources: unknown }>(
      `SELECT sources
         FROM citation_check
        WHERE audit_id = $1
        LIMIT 50`,
      [auditRow.audit_id]
    );

    const topSources = extractTopDomains(
      citationRes.rows.map((r) => r.sources),
      5
    );

    // -----------------------------------------------------------------------
    // Step 8: Build response — no competitor data, no raw probe text,
    // no tenant metadata beyond the white-label fields.
    // -----------------------------------------------------------------------
    return c.json(
      {
        brand: {
          name: brand.name,
          domain: brand.domain,
          category: brand.category,
        },
        scores: {
          overall,
          visibility: scoreAi,
          citation_readiness: citationReadiness,
          execution: null,
        },
        audit_date: auditRow.audit_date,
        top_sources: topSources,
        branding,
        no_audit: false,
      },
      200
    );
  });
}
