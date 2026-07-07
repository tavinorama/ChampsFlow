/**
 * api-keys.ts — D2: Public API + API keys.
 *
 * Two surfaces, one module:
 *
 *  1. Key management (JWT-authed, tenant-scoped) — for the in-app settings page:
 *       GET    /api/account/api-keys          — list this tenant's keys (no secrets)
 *       POST   /api/account/api-keys          — create a key (owner only); returns
 *                                               the plaintext ONCE
 *       DELETE /api/account/api-keys/:id      — revoke a key (owner only, soft delete)
 *
 *  2. Public read-only API (API-key-authed) — for the customer's own systems:
 *       GET /api/v1/me                        — tenant + plan + scopes (auth probe)
 *       GET /api/v1/brands                    — list brands + latest Ozvor AI Visibility Score
 *       GET /api/v1/brands/:id                — brand detail + latest score breakdown
 *       GET /api/v1/brands/:id/audits         — recent audits for a brand
 *       GET /api/v1/audits/:id                — a single audit's scores
 *
 * Security model (see migration 20260626000004_api_key):
 *  - Only the SHA-256 hash of the secret is stored. The 256-bit random key is its
 *    own entropy, so a fast hash (not bcrypt) is correct and avoids a per-request
 *    KDF on every API call.
 *  - requireApiKey() resolves the key UNSCOPED (privileged login role bypasses
 *    RLS — we don't know the tenant yet), then runs the handler inside that
 *    tenant's scope via runWithTenant() so every downstream query is RLS-enforced
 *    as app_user. Same isolation guarantee as requireAuth for JWT requests.
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { tryGetSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth, requireRole, requireSuperAdmin } from "../auth/middleware";
import { runWithTenant } from "../db/tenant-context";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PREFIX = "ozk_live_";
const MAX_ACTIVE_KEYS = 10;

// Extend Hono's context with the resolved API-key identity.
declare module "hono" {
  interface ContextVariableMap {
    apiKey: { id: string; tenantId: string; scopes: string[] };
  }
}

// ---------------------------------------------------------------------------
// Key generation + hashing
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Mint a new key. Returns the plaintext (shown once), its display prefix, and hash. */
function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  // 30 random bytes → 40 url-safe chars. Total key entropy 240 bits.
  const secret = randomBytes(30).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 16), // e.g. "ozk_live_AbC12d" — safe to display
    hash: sha256Hex(plaintext),
  };
}

// ---------------------------------------------------------------------------
// Per-key rate limit — sliding window, best-effort (fail-open if no Redis infra)
// ---------------------------------------------------------------------------

function getApiRedis(): SharedRedis | null {
  return tryGetSharedRedis();
}

const API_RATE_LIMIT = 120; // requests
const API_WINDOW_MS = 60_000; // per minute

async function checkApiRateLimit(keyId: string): Promise<boolean> {
  try {
    const redis = getApiRedis();
    if (!redis) return true; // no rate-limit infra → allow (fail-open)
    const key = `api_rl:${keyId}`;
    const now = Date.now();
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - API_WINDOW_MS);
    pipeline.zadd(key, { score: now, member: `${now}:${randomBytes(4).toString("hex")}` });
    pipeline.zcard(key);
    pipeline.expire(key, 60);
    const results = await pipeline.exec();
    const count = results[2] as number;
    return count <= API_RATE_LIMIT;
  } catch {
    return true; // Redis hiccup must not take the public API down
  }
}

// ---------------------------------------------------------------------------
// requireApiKey — authenticate a public-API request by API key
// ---------------------------------------------------------------------------

export function requireApiKey(db: PostgresClient) {
  return async function apiKeyGuard(c: Context, next: Next): Promise<Response | void> {
    // Accept "Authorization: Bearer ozk_…" or "X-API-Key: ozk_…".
    let presented = "";
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) presented = authHeader.slice(7).trim();
    if (!presented) presented = (c.req.header("X-API-Key") ?? "").trim();

    if (!presented || !presented.startsWith("ozk_")) {
      return c.json(
        {
          error: "unauthorized",
          code: "MISSING_API_KEY",
          message:
            "Provide your Ozvor API key as 'Authorization: Bearer ozk_…' or the 'X-API-Key' header.",
        },
        401
      );
    }

    const hash = sha256Hex(presented);

    // Unscoped lookup — no tenant scope is active yet, so this runs as the
    // privileged login role and can find the row across tenants by hash.
    let key: { id: string; tenant_id: string; scopes: string[]; revoked_at: string | null } | undefined;
    try {
      const { rows } = await db.query<{
        id: string;
        tenant_id: string;
        scopes: string[];
        revoked_at: string | null;
      }>(`SELECT id, tenant_id, scopes, revoked_at FROM api_key WHERE key_hash = $1 LIMIT 1`, [hash]);
      key = rows[0];
    } catch (err) {
      logger.error("api_key_lookup_failed", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "KEY_LOOKUP_FAILED" }, 500);
    }

    if (!key || key.revoked_at) {
      return c.json(
        { error: "unauthorized", code: "INVALID_API_KEY", message: "API key is invalid or revoked." },
        401
      );
    }

    const allowed = await checkApiRateLimit(key.id);
    if (!allowed) {
      return c.json(
        {
          error: "rate_limited",
          code: "RATE_LIMITED",
          message: `Rate limit exceeded (${API_RATE_LIMIT} requests/minute).`,
        },
        429
      );
    }

    // Touch last_used_at — fire-and-forget, unscoped (login role).
    void db.query(`UPDATE api_key SET last_used_at = NOW() WHERE id = $1`, [key.id]).catch(() => {});

    c.set("apiKey", { id: key.id, tenantId: key.tenant_id, scopes: key.scopes });

    // Scope the rest of the request to the key's tenant → RLS as app_user.
    await runWithTenant(key.tenant_id, () => next());
  };
}

// ---------------------------------------------------------------------------
// requireOperatorKey — authenticate the Hermes operator agent by API key.
// Same hash lookup + rate limit as requireApiKey, but requires the 'operator'
// scope and intentionally does NOT enter a tenant scope: operator endpoints
// run unscoped and are restricted to PII-FREE platform aggregates (ids,
// statuses, scores, liveness — never emails, brand names, or tenant names).
// ---------------------------------------------------------------------------

export function requireOperatorKey(db: PostgresClient) {
  return async function operatorKeyGuard(c: Context, next: Next): Promise<Response | void> {
    let presented = "";
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) presented = authHeader.slice(7).trim();
    if (!presented) presented = (c.req.header("X-API-Key") ?? "").trim();

    if (!presented || !presented.startsWith("ozk_")) {
      return c.json(
        { error: "unauthorized", code: "MISSING_API_KEY", message: "Provide an operator API key." },
        401
      );
    }

    const hash = sha256Hex(presented);
    let key:
      | { id: string; tenant_id: string; scopes: string[]; revoked_at: string | null }
      | undefined;
    try {
      const { rows } = await db.query<{
        id: string;
        tenant_id: string;
        scopes: string[];
        revoked_at: string | null;
      }>(`SELECT id, tenant_id, scopes, revoked_at FROM api_key WHERE key_hash = $1 LIMIT 1`, [hash]);
      key = rows[0];
    } catch (err) {
      logger.error("api_key_lookup_failed", { message: (err as Error).message });
      return c.json({ error: "internal_error", code: "KEY_LOOKUP_FAILED" }, 500);
    }

    if (!key || key.revoked_at) {
      return c.json(
        { error: "unauthorized", code: "INVALID_API_KEY", message: "API key is invalid or revoked." },
        401
      );
    }

    if (!key.scopes.includes("operator")) {
      return c.json(
        {
          error: "forbidden",
          code: "OPERATOR_SCOPE_REQUIRED",
          message: "This endpoint requires an operator-scoped key.",
        },
        403
      );
    }

    const allowed = await checkApiRateLimit(key.id);
    if (!allowed) {
      return c.json(
        {
          error: "rate_limited",
          code: "RATE_LIMITED",
          message: `Rate limit exceeded (${API_RATE_LIMIT} requests/minute).`,
        },
        429
      );
    }

    void db.query(`UPDATE api_key SET last_used_at = NOW() WHERE id = $1`, [key.id]).catch(() => {});
    c.set("apiKey", { id: key.id, tenantId: key.tenant_id, scopes: key.scopes });

    // No runWithTenant on purpose — see header comment.
    await next();
  };
}

/** Presence boolean only — never the value. */
function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Score helper — derive the overall Ozvor AI Visibility Score from the three vectors
// (AI 35 / Performance 35 / Brand 30), matching the public report endpoint.
// ---------------------------------------------------------------------------

function withOverall<T extends { score_brand: number | null; score_performance: number | null; score_ai: number | null }>(
  row: T
): T & { trustindex_score: number | null } {
  const { score_brand: b, score_performance: p, score_ai: a } = row;
  const overall =
    b != null && p != null && a != null ? Math.round(b * 0.3 + p * 0.35 + a * 0.35) : null;
  return { ...row, trustindex_score: overall };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerApiKeyRoutes(app: Hono, db: PostgresClient): void {
  // =========================================================================
  // 1) Key management (JWT-authed, tenant-scoped via requireAuth)
  // =========================================================================

  // GET /api/account/api-keys — list this tenant's keys (never returns secrets)
  app.get("/api/account/api-keys", requireAuth, async (c) => {
    const { rows } = await db.query<{
      id: string;
      name: string;
      prefix: string;
      scopes: string[];
      last_used_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }>(
      `SELECT id, name, prefix, scopes, last_used_at, revoked_at, created_at
         FROM api_key
        ORDER BY created_at DESC`,
      []
    );
    return c.json({ data: rows });
  });

  // POST /api/account/api-keys — mint a key (owner only). Plaintext returned ONCE.
  app.post("/api/account/api-keys", requireAuth, requireRole(["owner"]), async (c) => {
    const auth = c.get("auth");

    let body: { name?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      // empty body is fine — default the name
    }
    const name = (body?.name ?? "").toString().trim().slice(0, 80) || "API key";

    // Cap active keys per tenant.
    const cnt = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM api_key WHERE revoked_at IS NULL`,
      []
    );
    if ((cnt.rows[0]?.n ?? 0) >= MAX_ACTIVE_KEYS) {
      return c.json(
        {
          error: "limit_reached",
          code: "KEY_LIMIT",
          message: `Maximum of ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`,
        },
        409
      );
    }

    const { plaintext, prefix, hash } = generateApiKey();

    const ins = await db.query<{
      id: string;
      name: string;
      prefix: string;
      scopes: string[];
      created_at: string;
    }>(
      `INSERT INTO api_key (tenant_id, name, prefix, key_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, prefix, scopes, created_at`,
      [auth.tenantId, name, prefix, hash, auth.userId]
    );

    logger.info("api_key_created", { tenant_id: auth.tenantId, key_id: ins.rows[0]?.id });

    return c.json(
      {
        ...ins.rows[0],
        key: plaintext,
        warning: "Store this key now — it will not be shown again.",
      },
      201
    );
  });

  // DELETE /api/account/api-keys/:id — revoke (owner only, soft delete)
  app.delete("/api/account/api-keys/:id", requireAuth, requireRole(["owner"]), async (c) => {
    const id = c.req.param("id") ?? "";
    if (!UUID_RE.test(id)) {
      return c.json({ error: "bad_request", code: "INVALID_ID" }, 400);
    }
    const upd = await db.query<{ id: string }>(
      `UPDATE api_key SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [id]
    );
    if (!upd.rows[0]) {
      return c.json({ error: "not_found", code: "KEY_NOT_FOUND" }, 404);
    }
    return c.json({ id, revoked: true });
  });

  // =========================================================================
  // 2) Public read-only API (API-key-authed via requireApiKey → tenant scope)
  // =========================================================================
  const apiKey = requireApiKey(db);

  // GET /api/v1/me — auth probe: returns the calling tenant, plan, scopes.
  app.get("/api/v1/me", apiKey, async (c) => {
    const { id, tenantId, scopes } = c.get("apiKey");
    const { rows } = await db.query<{ plan_tier: string }>(
      `SELECT plan_tier FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return c.json({ tenant_id: tenantId, plan: rows[0]?.plan_tier ?? null, scopes, key_id: id });
  });

  // GET /api/v1/brands — list brands with the latest overall Ozvor AI Visibility Score.
  app.get("/api/v1/brands", apiKey, async (c) => {
    const { rows } = await db.query<{
      id: string;
      name: string;
      domain: string | null;
      category: string | null;
      region: string | null;
      monitoring_enabled: boolean;
      latest_score: number | null;
    }>(
      `SELECT b.id, b.name, b.domain, b.category, b.region, b.monitoring_enabled,
              (s.provider_breakdown->>'overall')::int AS latest_score
         FROM brands b
         LEFT JOIN LATERAL (
           SELECT provider_breakdown
             FROM geo_score gs
            WHERE gs.brand_id = b.id
            ORDER BY recorded_at DESC
            LIMIT 1
         ) s ON TRUE
        ORDER BY b.created_at ASC`,
      []
    );
    return c.json({ data: rows });
  });

  // GET /api/v1/brands/:id — brand detail + latest score breakdown.
  app.get("/api/v1/brands/:id", apiKey, async (c) => {
    const brandId = c.req.param("id") ?? "";
    if (!UUID_RE.test(brandId)) return c.json({ error: "bad_request", code: "INVALID_ID" }, 400);

    const brandRes = await db.query<{
      id: string;
      name: string;
      domain: string | null;
      category: string | null;
      region: string | null;
      monitoring_enabled: boolean;
      tracked_models: unknown;
      tracking_frequency: string | null;
    }>(
      `SELECT id, name, domain, category, region, monitoring_enabled, tracked_models, tracking_frequency
         FROM brands WHERE id = $1`,
      [brandId]
    );
    const brand = brandRes.rows[0];
    if (!brand) return c.json({ error: "not_found", code: "BRAND_NOT_FOUND" }, 404);

    const scoreRes = await db.query<{
      recorded_at: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      score_overall: number | null;
    }>(
      `SELECT recorded_at, score_brand, score_performance, score_ai,
              (provider_breakdown->>'overall')::int AS score_overall
         FROM geo_score
        WHERE brand_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [brandId]
    );

    return c.json({ ...brand, latest_score: scoreRes.rows[0] ?? null });
  });

  // GET /api/v1/brands/:id/audits — recent audits for a brand (newest first).
  app.get("/api/v1/brands/:id/audits", apiKey, async (c) => {
    const brandId = c.req.param("id") ?? "";
    if (!UUID_RE.test(brandId)) return c.json({ error: "bad_request", code: "INVALID_ID" }, 400);

    // RLS confines this to the caller's tenant; an out-of-tenant brand simply
    // returns no rows.
    const { rows } = await db.query<{
      id: string;
      status: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      created_at: string;
    }>(
      `SELECT id, status, score_brand, score_performance, score_ai, created_at
         FROM geo_audit
        WHERE brand_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [brandId]
    );
    return c.json({ data: rows.map(withOverall) });
  });

  // GET /api/v1/audits/:id — a single audit's status + scores.
  app.get("/api/v1/audits/:id", apiKey, async (c) => {
    const auditId = c.req.param("id") ?? "";
    if (!UUID_RE.test(auditId)) return c.json({ error: "bad_request", code: "INVALID_ID" }, 400);

    const res = await db.query<{
      id: string;
      brand_id: string;
      status: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      created_at: string;
    }>(
      `SELECT id, brand_id, status, score_brand, score_performance, score_ai, created_at
         FROM geo_audit WHERE id = $1`,
      [auditId]
    );
    const audit = res.rows[0];
    if (!audit) return c.json({ error: "not_found", code: "AUDIT_NOT_FOUND" }, 404);
    return c.json(withOverall(audit));
  });

  // =========================================================================
  // 3) Operator API (Hermes agent) — read-only, PII-free, 'operator' scope.
  //    Lets the operations agent monitor the platform (engine liveness, infra,
  //    audit outcomes) without dashboard credentials and without any access to
  //    customer data, billing, or secrets.
  // =========================================================================
  const operatorKey = requireOperatorKey(db);

  // GET /api/v1/operator/system-health — engines + infra liveness
  app.get("/api/v1/operator/system-health", operatorKey, async (c) => {
    const engines = [
      { engine: "anthropic", live: envPresent("ANTHROPIC_API_KEY") },
      { engine: "openai", live: envPresent("OPENAI_API_KEY") },
      { engine: "gemini", live: envPresent("GEMINI_API_KEY") },
      { engine: "perplexity", live: envPresent("PERPLEXITY_API_KEY") },
      { engine: "serp", live: envPresent("SERP_API_KEY") },
    ];

    let postgresStatus: "up" | "down" = "down";
    try {
      await db.query(`SELECT 1`, []);
      postgresStatus = "up";
    } catch {
      // stays "down"
    }

    let redisStatus: "up" | "down" | "not_configured" = "not_configured";
    try {
      const redis = tryGetSharedRedis();
      if (redis) {
        await redis.ping();
        redisStatus = "up";
      }
    } catch {
      redisStatus = "down";
    }

    return c.json({
      engines,
      infrastructure: { postgres: postgresStatus, redis: redisStatus },
      checked_at: new Date().toISOString(),
    });
  });

  // GET /api/v1/operator/audits/recent — last 20 audits, PII-free
  app.get("/api/v1/operator/audits/recent", operatorKey, async (c) => {
    const { rows } = await db.query<{
      id: string;
      status: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      created_at: string;
    }>(
      `SELECT id, status, score_brand, score_performance, score_ai, created_at
         FROM geo_audit
        ORDER BY created_at DESC
        LIMIT 20`,
      []
    );
    return c.json({
      audits: rows.map(withOverall),
      note: "PII-free by design: no tenant, brand, or user fields.",
    });
  });

  // =========================================================================
  // 4) Operator key minting — founder only (super_admin). Rotation semantics:
  //    minting a new operator key revokes all previous operator keys, so at
  //    most one is live. Plaintext returned ONCE.
  // =========================================================================
  app.post("/api/admin/operator-key", requireAuth, requireSuperAdmin, async (c) => {
    const auth = c.get("auth");
    if (!auth?.tenantId) {
      return c.json({ error: "internal_error", code: "NO_TENANT_FOR_ADMIN" }, 500);
    }

    await db.query(
      `UPDATE api_key SET revoked_at = NOW() WHERE revoked_at IS NULL AND 'operator' = ANY(scopes)`,
      []
    );

    const { plaintext, prefix, hash } = generateApiKey();
    const ins = await db.query<{
      id: string;
      name: string;
      prefix: string;
      scopes: string[];
      created_at: string;
    }>(
      `INSERT INTO api_key (tenant_id, name, prefix, key_hash, scopes, created_by)
       VALUES ($1, $2, $3, $4, ARRAY['operator']::text[], $5)
       RETURNING id, name, prefix, scopes, created_at`,
      [auth.tenantId, "hermes-operator", prefix, hash, auth.userId]
    );

    logger.info("operator_key_created", { key_id: ins.rows[0]?.id });

    return c.json(
      {
        ...ins.rows[0],
        key: plaintext,
        endpoints: ["/api/v1/operator/system-health", "/api/v1/operator/audits/recent"],
        warning:
          "Store this key in the Hermes VPS config now — it will not be shown again. Any previous operator key was just revoked.",
      },
      201
    );
  });
}
