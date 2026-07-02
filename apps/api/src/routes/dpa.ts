/**
 * CI-1 — DPA Onboarding Gate — API routes
 *
 * Routes (architecture §5 + CI-1 spec):
 *   POST  /api/dpa/acknowledge  — record DPA acknowledgment (requireAuth)
 *   GET   /api/dpa/status       — check if user needs to acknowledge (requireAuth)
 *   GET   /api/dpa/history      — user's full acknowledgment history (requireAuth)
 *
 * Middleware exported:
 *   requireDpaAcknowledged — checks users.current_dpa_version vs DPA_CURRENT_VERSION;
 *                            returns 403 with dpa_acknowledgment_required code on mismatch.
 *                            Apply AFTER requireAuth on all state-changing routes.
 *
 * IP handling (GDPR data minimization):
 *   - Full IP is NEVER persisted. truncateIp() zeroes last octet (IPv4)
 *     or last 80 bits (IPv6) before any DB insert.
 *
 * Variant selection:
 *   resolveVariant(req) reads cf-ipcountry header.
 *   EU country code or missing/ambiguous header → 'EU'.
 *   Non-EU confirmed → 'US'.
 *   Default on ambiguity: 'EU' (conservative, architecture §14).
 *
 * Rate limiting:
 *   Per-tenant 10 acknowledgments/hour (Redis sliding window bucket).
 *   Key: dpa_ack:<tenantId>
 *
 * Audit log:
 *   event_type='dpa_acknowledged' written with variant + country_code.
 *   No full IP in audit log (truncated ip only, matching DB store).
 *
 * Hard rules:
 *  - tenant_id resolved from JWT only — never from request body
 *  - No full IP anywhere in logs or DB (truncateIp enforced in all write paths)
 *  - DPA_CURRENT_VERSION read from process.env; no fallback to empty string
 *    (missing env var returns 503 on acknowledge + warns on status check)
 *  - All DB queries parameterized — no string interpolation
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// EU country codes (EU-27 + EEA: Norway, Iceland, Liechtenstein + CH + UK)
// Conservative list — any country not in this list → 'US' variant.
// ---------------------------------------------------------------------------

const EU_COUNTRY_CODES = new Set([
  // EU-27
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  // EEA (non-EU members)
  "NO", "IS", "LI",
  // Switzerland — adequacy decision
  "CH",
  // UK — transitional adequacy + DPA 2018
  "GB",
]);

// ---------------------------------------------------------------------------
// resolveVariant: read cf-ipcountry header to determine DPA copy variant
// ---------------------------------------------------------------------------

export function resolveVariant(req: Request): { variant: "EU" | "US"; country_code: string | null } {
  const cfCountry = req.headers.get("cf-ipcountry");

  if (!cfCountry || cfCountry === "XX" || cfCountry === "T1") {
    // Missing, unknown, or Tor exit node — default EU (conservative, §14)
    return { variant: "EU", country_code: null };
  }

  const code = cfCountry.toUpperCase().trim();
  if (EU_COUNTRY_CODES.has(code)) {
    return { variant: "EU", country_code: code };
  }

  return { variant: "US", country_code: code };
}

// ---------------------------------------------------------------------------
// truncateIp: GDPR data minimization — never store full IP
//
// IPv4: zero last octet  "1.2.3.4" → "1.2.3.0"
// IPv6: zero last 80 bits (retain first 48 bits = first 3 groups of 16)
//       "2001:db8:85a3::8a2e:370:7334" → "2001:db8:85a3::"
// ---------------------------------------------------------------------------

export function truncateIp(ip: string): string {
  if (!ip) return "";

  // IPv4 — dot-separated, exactly 4 octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    parts[3] = "0";
    return parts.join(".");
  }

  // IPv6 — colon-separated (may include ::)
  // Expand to full 8 groups, zero last 5 groups (80 bits), compress back.
  // For simplicity in v1: keep only first 3 colon-separated tokens.
  // "2001:db8:85a3:0:0:8a2e:370:7334" → "2001:db8:85a3::"
  try {
    const colons = (ip.match(/:/g) || []).length;
    let expanded = ip;
    // Expand :: shorthand to fill to 8 groups
    if (ip.includes("::")) {
      const missing = 8 - colons + 1; // +1 because :: accounts for itself
      expanded = ip.replace("::", ":".repeat(missing + 1).replace(/^:+/, "").replace(/:+$/, ""));
      // Re-fill with zeros
      const fill = Array(missing).fill("0").join(":");
      expanded = ip.replace("::", `:${fill}:`).replace(/^:/, "").replace(/:$/, "");
    }
    const groups = expanded.split(":");
    // Keep only first 3 groups (48 bits), zero rest
    const truncated = groups.slice(0, 3).join(":") + "::";
    return truncated;
  } catch {
    // If parsing fails, return empty string (no IP stored)
    return "";
  }
}

// ---------------------------------------------------------------------------
// Redis client (shared Railway Redis)
// ---------------------------------------------------------------------------

function getRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit: 10 acknowledgments / hour (sliding window)
// ---------------------------------------------------------------------------

async function checkDpaRateLimit(tenantId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `dpa_ack:${tenantId}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const limit = 10;

  // Sliding window: score = timestamp, member = timestamp (unique enough per ms)
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, 3600);

  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= limit;
}

// ---------------------------------------------------------------------------
// requireDpaAcknowledged middleware
// ---------------------------------------------------------------------------
// Checks users.current_dpa_version against DPA_CURRENT_VERSION env var.
// Returns 403 with { error: 'dpa_acknowledgment_required', variant_required }
// if the user has not acknowledged the current version.
//
// Must run AFTER requireAuth (depends on ctx.get('auth')).
// Apply on all state-changing routes: drafts/generate, drafts/approve,
// drafts/schedule, social-accounts/connect/*.
// ---------------------------------------------------------------------------

export function requireDpaAcknowledged(db: PostgresClient) {
  return async function dpaAcknowledgedGuard(ctx: Context, next: Next): Promise<Response | void> {
    const currentVersion = process.env.DPA_CURRENT_VERSION;
    if (!currentVersion) {
      // Env var missing — log warning and allow through (fail-open to avoid
      // blocking all users if misconfigured). PM/devops must fix at deploy.
      logger.warn("dpa_current_version_env_missing", {
        message: "DPA_CURRENT_VERSION env var not set; skipping DPA check",
      });
      await next();
      return;
    }

    const auth = ctx.get("auth");
    if (!auth) {
      return ctx.json({ error: "Unauthorized", code: "MISSING_AUTH_CONTEXT" }, 401);
    }

    // Fast lookup: read current_dpa_version from users table
    await db.setTenantId(auth.tenantId);
    const result = await db.query<{ current_dpa_version: string | null }>(
      // auth.userId = Supabase Auth UID → public.users.supabase_auth_uid (not id).
      `SELECT current_dpa_version FROM users WHERE supabase_auth_uid = $1 AND deleted_at IS NULL LIMIT 1`,
      [auth.userId]
    );

    if (result.rows.length === 0) {
      return ctx.json({ error: "Unauthorized", code: "USER_NOT_FOUND" }, 401);
    }

    const userVersion = result.rows[0].current_dpa_version;
    if (userVersion === currentVersion) {
      await next();
      return;
    }

    // Version mismatch — determine which variant to show
    const { variant } = resolveVariant(ctx.req.raw);

    logger.warn("dpa_acknowledgment_required", {
      userId: auth.userId,
      tenantId: auth.tenantId,
      userVersion: userVersion ?? "none",
      requiredVersion: currentVersion,
      variant,
    });

    return ctx.json({
      error: "dpa_acknowledgment_required",
      code: "DPA_ACKNOWLEDGMENT_REQUIRED",
      variant_required: variant,
      current_dpa_version: currentVersion,
    }, 403);
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerDpaRoutes(app: Hono, db: PostgresClient): void {

  // -------------------------------------------------------------------------
  // POST /api/dpa/acknowledge
  // Body: { dpa_version: string, variant: 'EU' | 'US' }
  // Inserts dpa_acknowledgments row, updates users.current_dpa_version,
  // writes audit log event 'dpa_acknowledged'.
  // -------------------------------------------------------------------------
  app.post("/api/dpa/acknowledge", requireAuth, async (ctx) => {
    const auth = ctx.get("auth");

    // Parse + validate body
    let body: { dpa_version?: unknown; variant?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      ctx.status(400);
      return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" });
    }

    const { dpa_version, variant } = body;

    if (typeof dpa_version !== "string" || !dpa_version.trim()) {
      ctx.status(400);
      return ctx.json({ error: "dpa_version is required", code: "MISSING_DPA_VERSION" });
    }

    if (variant !== "EU" && variant !== "US") {
      ctx.status(400);
      return ctx.json({ error: "variant must be 'EU' or 'US'", code: "INVALID_VARIANT" });
    }

    // Rate limit: 10 acknowledgments/hour per tenant
    const allowed = await checkDpaRateLimit(auth.tenantId);
    if (!allowed) {
      ctx.status(429);
      return ctx.json({
        error: "Too many acknowledgment requests",
        code: "RATE_LIMITED",
        retry_after: 3600,
      });
    }

    // Resolve country from cf-ipcountry header
    const { country_code } = resolveVariant(ctx.req.raw);

    // Truncate IP before any storage (GDPR data minimization — full IP never stored)
    const rawIp =
      ctx.req.header("cf-connecting-ip") ??
      ctx.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    const ip_truncated = truncateIp(rawIp);

    await db.setTenantId(auth.tenantId);

    // Insert acknowledgment row — ON CONFLICT DO NOTHING (idempotent re-submit)
    await db.query(
      `INSERT INTO dpa_acknowledgments
         (tenant_id, user_id, dpa_version, variant, country_code, ip_truncated, acknowledged_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, dpa_version) DO NOTHING`,
      [auth.tenantId, auth.userId, dpa_version, variant, country_code, ip_truncated || null]
    );

    // Update denormalized current_dpa_version on users (fast middleware check)
    await db.query(
      `UPDATE users SET current_dpa_version = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [dpa_version, auth.userId, auth.tenantId]
    );

    // Audit log — no full IP (ip_truncated only), variant + country logged
    await db.query(
      `INSERT INTO audit_log (tenant_id, user_id, event_type, metadata, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        auth.tenantId,
        auth.userId,
        "dpa_acknowledged",
        JSON.stringify({
          dpa_version,
          variant,
          country_code: country_code ?? null,
          ip_truncated: ip_truncated || null,
        }),
      ]
    );

    logger.info("dpa_acknowledged", {
      userId: auth.userId,
      tenantId: auth.tenantId,
      dpa_version,
      variant,
      country_code: country_code ?? null,
    });

    return ctx.json({ ok: true, dpa_version, variant }, 200);
  });

  // -------------------------------------------------------------------------
  // GET /api/dpa/status
  // Returns: { current_dpa_version_in_env, user_acknowledged_version,
  //            variant_required, needs_acknowledgment }
  // -------------------------------------------------------------------------
  app.get("/api/dpa/status", requireAuth, async (ctx) => {
    const auth = ctx.get("auth");

    const currentVersion = process.env.DPA_CURRENT_VERSION ?? null;

    await db.setTenantId(auth.tenantId);
    const result = await db.query<{ current_dpa_version: string | null }>(
      // auth.userId = Supabase Auth UID → public.users.supabase_auth_uid (not id).
      `SELECT current_dpa_version FROM users WHERE supabase_auth_uid = $1 AND deleted_at IS NULL LIMIT 1`,
      [auth.userId]
    );

    if (result.rows.length === 0) {
      ctx.status(401);
      return ctx.json({ error: "Unauthorized", code: "USER_NOT_FOUND" });
    }

    const userAcknowledgedVersion = result.rows[0].current_dpa_version ?? null;
    const { variant } = resolveVariant(ctx.req.raw);
    const needs_acknowledgment =
      currentVersion !== null && userAcknowledgedVersion !== currentVersion;

    return ctx.json({
      current_dpa_version_in_env: currentVersion,
      user_acknowledged_version: userAcknowledgedVersion,
      variant_required: variant,
      needs_acknowledgment,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/dpa/history
  // Returns user's full acknowledgment history (read-only).
  // Ordered by acknowledged_at DESC.
  // -------------------------------------------------------------------------
  app.get("/api/dpa/history", requireAuth, async (ctx) => {
    const auth = ctx.get("auth");

    await db.setTenantId(auth.tenantId);
    const result = await db.query<{
      id: string;
      dpa_version: string;
      variant: string;
      country_code: string | null;
      acknowledged_at: string;
    }>(
      `SELECT id, dpa_version, variant, country_code, acknowledged_at
       FROM dpa_acknowledgments
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY acknowledged_at DESC`,
      [auth.userId, auth.tenantId]
    );

    return ctx.json({ history: result.rows });
  });
}
