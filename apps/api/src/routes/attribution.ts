/**
 * Attribution v1 (#86) — Google Analytics + Search Console OAuth + metrics
 *
 * Routes:
 *   GET    /api/google/status                                  — no auth — config check
 *   POST   /api/brands/:id/google/connect/:kind                — requireAuth + owner/editor
 *   GET    /api/google/callback                                — no auth — OAuth redirect receiver
 *   GET    /api/brands/:id/google/connections                  — requireAuth
 *   PATCH  /api/brands/:id/google/connections/:connectionId/property — requireAuth + owner/editor
 *   DELETE /api/brands/:id/google/connections/:connectionId    — requireAuth + owner/editor
 *   GET    /api/brands/:id/google/metrics                      — requireAuth
 *   GET    /api/brands/:id/attribution/summary                 — requireAuth
 *
 * Security:
 *  - All DB queries parameterized — no string interpolation
 *  - tenant_id exclusively from JWT (requireAuth) — never from URL/body
 *  - Tokens NEVER returned to client or written to logs
 *  - CSRF: 256-bit random state token stored in Redis, consumed once
 *  - Tenant isolation enforced in every query via explicit WHERE tenant_id = $N
 *  - raw_response stored as null in google_metric_cache (no token/PII storage)
 *
 * Degraded state (env vars absent):
 *  - GET /api/google/status → { configured: false }
 *  - POST connect/:kind → { configured: false } (200)
 *  - GET metrics → { configured: false, ga4: null, gsc: null }
 *  - GET attribution/summary → { summary: null, ..., configured: false }
 *
 * Brand naming: "Ozvor AI Visibility Score" / "Visibility" — never "TrustIndex".
 */

import { Hono } from "hono";
import { tryGetSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth, requireRole } from "../auth/middleware";
import {
  googleOAuthConfigured,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  fetchGA4OrganicSessions,
  fetchGSCSearchAnalytics,
} from "../lib/google-oauth";
import {
  createGoogleOAuthState,
  consumeGoogleOAuthState,
  GoogleOAuthStateError,
} from "../auth/google-oauth-state";
import { encryptToken, decryptToken } from "../../../../packages/shared/src/crypto";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { computeAttributionSummary } from "../lib/attribution-summary";
import { logger } from "../../../../packages/shared/src/logger";
import type { PostgresClient } from "./social-accounts";

// ---------------------------------------------------------------------------
// Rate limiting — Google connect endpoint
// 10 req / 1 min per tenant (sliding-window ZSET via shared Redis).
// Gracefully no-ops when REDIS_URL is absent (dev/test).
// ---------------------------------------------------------------------------

function getAttributionRedis(): SharedRedis | null {
  return tryGetSharedRedis();
}

const CONNECT_RATE_LIMIT = 10;
const CONNECT_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const CONNECT_RATE_WINDOW_S = 60;

/**
 * Per-tenant sliding-window rate limit for POST connect/:kind.
 * Returns true if the request is allowed, false if it should be rejected.
 */
async function checkConnectRateLimit(tenantId: string): Promise<boolean> {
  const redis = getAttributionRedis();
  if (!redis) return true; // unconfigured — allow in dev
  const key = `gconn_rl:${tenantId}`;
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - CONNECT_RATE_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, CONNECT_RATE_WINDOW_S);
  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= CONNECT_RATE_LIMIT;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Valid ga4PropertyId formats:
 *   - Bare numeric: "123456789"
 *   - Prefixed: "properties/123456789"
 * Rejects anything with path-traversal characters, slashes in unexpected positions,
 * or non-numeric segments after the optional "properties/" prefix.
 */
const GA4_PROPERTY_ID_RE = /^(\d+|properties\/\d+)$/;

/** Exported for unit tests. */
export function isValidGa4PropertyId(value: string): boolean {
  return GA4_PROPERTY_ID_RE.test(value);
}

/**
 * Valid GSC siteUrl formats:
 *   - URL prefix: "https?://hostname/..." (must have at least one path char after /)
 *   - Domain property: "sc-domain:hostname"
 * Rejects:
 *   - Bare IPs
 *   - Private/link-local ranges (RFC 1918 + 169.254.*)
 *   - Values longer than 2000 chars
 */
/** Exported for unit tests. */
export function isValidGscSiteUrl(value: string): boolean {
  if (value.length > 2000) return false;

  // sc-domain: format — must have a non-empty hostname, no slashes
  if (value.startsWith("sc-domain:")) {
    const host = value.slice("sc-domain:".length);
    if (!host || host.includes("/")) return false;
    return !isPrivateHostname(host);
  }

  // URL prefix format: must start with http:// or https://
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // Must have a non-empty path (URL prefix properties require a trailing slash at minimum)
  if (parsed.pathname.length === 0) return false;

  return !isPrivateHostname(parsed.hostname);
}

/**
 * Returns true when the hostname resolves to a bare IP or falls in a private
 * range. We check syntactically only (no DNS) — sufficient for input validation
 * since the stored value is passed to Google's API (not fetched directly by us).
 */
function isPrivateHostname(hostname: string): boolean {
  // Bare IPv4 address
  const ipv4Re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = ipv4Re.exec(hostname);
  if (m) {
    const o = [m[1]!, m[2]!, m[3]!, m[4]!].map(Number);
    // 10.0.0.0/8
    if (o[0] === 10) return true;
    // 172.16.0.0/12
    if (o[0] === 172 && o[1]! >= 16 && o[1]! <= 31) return true;
    // 192.168.0.0/16
    if (o[0] === 192 && o[1] === 168) return true;
    // 169.254.0.0/16 (link-local + cloud metadata)
    if (o[0] === 169 && o[1] === 254) return true;
    // 127.0.0.0/8 (loopback)
    if (o[0] === 127) return true;
    // Any other bare IP (not a registered domain)
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_KINDS = ["ga4", "gsc"] as const;
type Kind = (typeof VALID_KINDS)[number];

/** Re-fetch cache after 24 hours */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Refresh token if it expires within 5 minutes */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Frontend base URL for redirects after OAuth callback
function getFrontendUrl(): string {
  return process.env["WEB_ORIGIN"] ?? "http://localhost:3000";
}

// ---------------------------------------------------------------------------
// DB row types (internal — tokens never returned to client)
// ---------------------------------------------------------------------------

interface GoogleConnectionRow {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  kind: Kind;
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  scope: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Safe connection shape (no token fields) */
interface ConnectionPublic {
  id: string;
  kind: Kind;
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  scope: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface MetricCacheRow {
  id: string;
  connection_id: string;
  kind: Kind;
  fetched_at: string;
  period_start: string;
  period_end: string;
  series: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPublic(row: GoogleConnectionRow): ConnectionPublic {
  return {
    id: row.id,
    kind: row.kind,
    ga4_property_id: row.ga4_property_id,
    gsc_site_url: row.gsc_site_url,
    scope: row.scope,
    expires_at: row.expires_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

function isExpiredOrNearExpiry(expiresAt: string | null): boolean {
  if (!expiresAt) return true; // treat unknown expiry as expired
  const expMs = new Date(expiresAt).getTime();
  return Date.now() + TOKEN_REFRESH_BUFFER_MS >= expMs;
}

/**
 * Ensure we have a valid access token for a connection.
 * Refreshes if needed and updates the DB row.
 * Returns the plaintext access token (caller must NOT log it).
 */
async function ensureValidAccessToken(
  db: PostgresClient,
  conn: GoogleConnectionRow,
  tenantId: string
): Promise<string> {
  let accessToken: string;

  if (conn.access_token_enc) {
    accessToken = decryptToken(conn.access_token_enc);
  } else {
    throw new Error("Connection has no access token");
  }

  if (!isExpiredOrNearExpiry(conn.expires_at)) {
    return accessToken;
  }

  // Need to refresh
  if (!conn.refresh_token_enc) {
    throw new Error("Connection has no refresh token and access token is expired");
  }

  const refreshToken = decryptToken(conn.refresh_token_enc);
  const refreshed = await refreshGoogleToken(refreshToken);

  // Encrypt the new access token and update the DB
  const { encrypted: newAccessEnc } = encryptToken(refreshed.accessToken);
  const newExpiresAt = new Date(
    Date.now() + refreshed.expiresIn * 1000
  ).toISOString();

  await db.query(
    `UPDATE google_connection
        SET access_token_enc = $1,
            expires_at       = $2
      WHERE id        = $3
        AND tenant_id = $4
        AND revoked_at IS NULL`,
    [newAccessEnc, newExpiresAt, conn.id, tenantId]
  );

  logger.info("google_token_refreshed", { connection_id: conn.id, kind: conn.kind });

  return refreshed.accessToken;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

// Only these internal frontend paths may be used as the post-OAuth return
// destination. Anything else (external URLs, protocol-relative //host, path
// traversal, backslashes) falls back to the legacy connections page — an
// open-redirect guard, since the raw value comes from a query param.
const RETURN_ALLOWLIST = ["/dashboard-v3", "/account/connections"];
function safeReturnPath(raw: string | undefined | null): string {
  const fallback = "/account/connections";
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) {
    return fallback;
  }
  const path = raw.split("?")[0];
  return RETURN_ALLOWLIST.some((p) => path === p || path.startsWith(`${p}/`)) ? raw : fallback;
}

export function registerAttributionRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/google/status
  // No auth — returns { configured: boolean }
  // Never crashes when env vars are absent.
  // -------------------------------------------------------------------------
  app.get("/api/google/status", (c) => {
    return c.json({ configured: googleOAuthConfigured() }, 200);
  });

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/google/connect/:kind
  // requireAuth + requireRole(['owner', 'editor'])
  // kind must be 'ga4' or 'gsc'
  // Returns { authorizationUrl } or { configured: false }
  // Rate limiting: declared per architecture; implementation relies on the
  // upstream rate-limit middleware configured in apps/api infra config.
  // -------------------------------------------------------------------------
  app.post(
    "/api/brands/:id/google/connect/:kind",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId, userId } = auth;

      // Rate limit: 10 req / 1 min per tenant. Graceful no-op when Upstash absent.
      const allowed = await checkConnectRateLimit(tenantId).catch(() => true);
      if (!allowed) {
        c.header("Retry-After", "60");
        return c.json(
          { error: "Too many connection requests. Please try again later.", code: "RATE_LIMITED" },
          429
        );
      }

      if (!googleOAuthConfigured()) {
        return c.json({ configured: false }, 200);
      }

      // Validate kind
      const kind = c.req.param("kind") as string;
      if (!VALID_KINDS.includes(kind as Kind)) {
        return c.json(
          { error: "Invalid kind. Must be 'ga4' or 'gsc'.", code: "INVALID_KIND" },
          400
        );
      }

      const brandId: string = c.req.param("id") ?? "";

      if (!brandId) {
        return c.json({ error: "Brand id is required.", code: "INVALID_PARAM" }, 400);
      }

      // Verify brand belongs to this tenant
      await db.setTenantId(tenantId);
      const brandCheck = await db.query<{ id: string }>(
        `SELECT id FROM brands WHERE id = $1 AND tenant_id = $2`,
        [brandId, tenantId]
      );
      if (!brandCheck.rows[0]) {
        return c.json({ error: "Brand not found.", code: "NOT_FOUND" }, 404);
      }

      // Where to send the user after Google's callback — allowlisted so a v3
      // client returns to the v3 dashboard, legacy clients to the old page.
      const returnTo = safeReturnPath(c.req.query("return"));

      // Generate CSRF state (256-bit random, stored in Redis, 10-min TTL)
      const state = await createGoogleOAuthState({
        userId,
        tenantId,
        brandId,
        kind: kind as Kind,
        returnTo,
      });

      const authorizationUrl = buildGoogleAuthUrl(kind as Kind, state);

      logger.info("google_oauth_connect_initiated", {
        kind,
        tenant_id: tenantId,
        brand_id: brandId,
      });

      return c.json({ authorizationUrl }, 200);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/google/callback
  // No requireAuth — Google redirects here after user approves.
  // Validates state (consumed once from Redis), exchanges code, stores tokens.
  // Redirects frontend on success/failure.
  // NEVER log tokens.
  // -------------------------------------------------------------------------
  app.get("/api/google/callback", async (c) => {
    const frontendUrl = getFrontendUrl();
    const errorRedirect = (reason: string) =>
      c.redirect(`${frontendUrl}/account/connections?google_error=${encodeURIComponent(reason)}`, 302);

    // If Google returned an error param
    const errorParam = c.req.query("error");
    if (errorParam) {
      logger.warn("google_oauth_callback_error_param", {
        error: errorParam === "access_denied" ? "access_denied" : "provider_error",
      });
      return errorRedirect(errorParam === "access_denied" ? "access_denied" : "provider_error");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      logger.warn("google_oauth_callback_missing_params", {});
      return errorRedirect("callback_failed");
    }

    // Validate and consume state (single-use CSRF token)
    let statePayload;
    try {
      statePayload = await consumeGoogleOAuthState(state);
    } catch (err) {
      const code = err instanceof GoogleOAuthStateError ? err.code : "STATE_ERROR";
      logger.warn("google_oauth_state_invalid", { code });
      return errorRedirect("callback_failed");
    }

    const { tenantId, userId, brandId, kind } = statePayload;
    const redirectUri = process.env["GOOGLE_OAUTH_REDIRECT_URI"] ?? "";

    // Return the user to wherever they started the flow (v3 or legacy page).
    const returnBase = safeReturnPath(statePayload.returnTo);
    const withParam = (k: string, v: string): string => {
      const sep = returnBase.includes("?") ? "&" : "?";
      return `${frontendUrl}${returnBase}${sep}${k}=${encodeURIComponent(v)}`;
    };

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeGoogleCode(code, redirectUri);
    } catch {
      // Do NOT log the code or error details that might contain token hints
      logger.warn("google_oauth_code_exchange_failed", { kind, tenant_id: tenantId });
      return c.redirect(withParam("google_error", "callback_failed"), 302);
    }

    // Encrypt tokens before storage — NEVER write plaintext to DB
    const { encrypted: accessEnc } = encryptToken(tokens.accessToken);
    const refreshEnc = tokens.refreshToken
      ? encryptToken(tokens.refreshToken).encrypted
      : null;

    const expiresAt = new Date(
      Date.now() + tokens.expiresIn * 1000
    ).toISOString();

    // Upsert: if active row exists for (tenant_id, brand_id, kind) → UPDATE
    // otherwise INSERT. The unique index uq_google_connection_active enforces
    // one active connection per (tenant, brand, kind).
    try {
      await db.setTenantId(tenantId);

      // Check for existing active connection
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM google_connection
          WHERE tenant_id = $1
            AND kind = $2
            AND brand_id IS NOT DISTINCT FROM $3
            AND revoked_at IS NULL`,
        [tenantId, kind, brandId]
      );

      if (existing.rows[0]) {
        // Update existing row
        await db.query(
          `UPDATE google_connection
              SET access_token_enc  = $1,
                  refresh_token_enc = $2,
                  scope             = $3,
                  expires_at        = $4
            WHERE id        = $5
              AND tenant_id = $6`,
          [accessEnc, refreshEnc, tokens.scope, expiresAt, existing.rows[0].id, tenantId]
        );
        logger.info("google_connection_updated", {
          kind,
          tenant_id: tenantId,
          brand_id: brandId,
          // no token info logged
        });
      } else {
        // Insert new row
        await db.query(
          `INSERT INTO google_connection
             (tenant_id, brand_id, kind, access_token_enc, refresh_token_enc, scope, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, brandId, kind, accessEnc, refreshEnc, tokens.scope, expiresAt]
        );
        logger.info("google_connection_created", {
          kind,
          tenant_id: tenantId,
          brand_id: brandId,
        });
      }
    } catch {
      logger.error("google_connection_store_failed", {
        kind,
        tenant_id: tenantId,
        brand_id: brandId,
        // no token data in log
      });
      return c.redirect(withParam("google_error", "callback_failed"), 302);
    }

    return c.redirect(withParam("google_connected", kind), 302);
  });

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/google/connections
  // requireAuth (any role)
  // Returns list of connections (no token fields)
  // -------------------------------------------------------------------------
  app.get(
    "/api/brands/:id/google/connections",
    requireAuth,
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      await db.setTenantId(tenantId);

      const res = await db.query<GoogleConnectionRow>(
        `SELECT id, tenant_id, brand_id, kind,
                ga4_property_id, gsc_site_url, scope, expires_at,
                created_at, revoked_at
           FROM google_connection
          WHERE tenant_id = $1
            AND brand_id IS NOT DISTINCT FROM $2
          ORDER BY created_at DESC`,
        [tenantId, brandId]
      );

      return c.json({ connections: res.rows.map(toPublic) }, 200);
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /api/brands/:id/google/connections/:connectionId/property
  // requireAuth + requireRole(['owner', 'editor'])
  // Body: { ga4PropertyId?: string, gscSiteUrl?: string }
  // Returns updated connection (no token fields)
  // -------------------------------------------------------------------------
  app.patch(
    "/api/brands/:id/google/connections/:connectionId/property",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");
      const connectionId = c.req.param("connectionId");

      // Parse body
      let body: { ga4PropertyId?: unknown; gscSiteUrl?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body.", code: "INVALID_BODY" }, 400);
      }

      // Validate fields
      if (body.ga4PropertyId !== undefined && body.ga4PropertyId !== null) {
        if (typeof body.ga4PropertyId !== "string") {
          return c.json({ error: "ga4PropertyId must be a string.", code: "INVALID_FIELD" }, 400);
        }
        if (!isValidGa4PropertyId(body.ga4PropertyId)) {
          return c.json(
            { error: "invalid_ga4_property_id", code: "INVALID_FIELD" },
            400
          );
        }
      }

      if (body.gscSiteUrl !== undefined && body.gscSiteUrl !== null) {
        if (typeof body.gscSiteUrl !== "string") {
          return c.json({ error: "gscSiteUrl must be a string.", code: "INVALID_FIELD" }, 400);
        }
        if (!isValidGscSiteUrl(body.gscSiteUrl)) {
          return c.json(
            {
              error:
                "gscSiteUrl must be a valid GSC site URL (https://domain/path or sc-domain:hostname) with no private IPs, max 2000 chars.",
              code: "INVALID_FIELD",
            },
            400
          );
        }
      }

      await db.setTenantId(tenantId);

      // Verify connection belongs to this tenant + brand (tenant isolation)
      const connCheck = await db.query<GoogleConnectionRow>(
        `SELECT id, tenant_id, brand_id, kind, ga4_property_id, gsc_site_url,
                scope, expires_at, created_at, revoked_at
           FROM google_connection
          WHERE id        = $1
            AND tenant_id = $2
            AND brand_id IS NOT DISTINCT FROM $3`,
        [connectionId, tenantId, brandId]
      );

      if (!connCheck.rows[0]) {
        return c.json({ error: "Connection not found.", code: "NOT_FOUND" }, 404);
      }

      const ga4PropertyId =
        body.ga4PropertyId !== undefined
          ? (body.ga4PropertyId as string | null)
          : connCheck.rows[0].ga4_property_id;
      const gscSiteUrl =
        body.gscSiteUrl !== undefined
          ? (body.gscSiteUrl as string | null)
          : connCheck.rows[0].gsc_site_url;

      const updated = await db.query<GoogleConnectionRow>(
        `UPDATE google_connection
            SET ga4_property_id = $1,
                gsc_site_url    = $2
          WHERE id        = $3
            AND tenant_id = $4
          RETURNING id, tenant_id, brand_id, kind,
                    ga4_property_id, gsc_site_url, scope, expires_at,
                    created_at, revoked_at`,
        [ga4PropertyId, gscSiteUrl, connectionId, tenantId]
      );

      logger.info("google_connection_property_updated", {
        connection_id: connectionId,
        kind: updated.rows[0]?.kind,
        tenant_id: tenantId,
        brand_id: brandId,
      });

      return c.json(toPublic(updated.rows[0]!), 200);
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/brands/:id/google/connections/:connectionId
  // requireAuth + requireRole(['owner', 'editor'])
  // Sets revoked_at = now(), nulls out token fields (token scrub)
  // Returns { revoked: true }
  // -------------------------------------------------------------------------
  app.delete(
    "/api/brands/:id/google/connections/:connectionId",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");
      const connectionId = c.req.param("connectionId");

      await db.setTenantId(tenantId);

      // Tenant isolation: verify the connection belongs to this tenant + brand
      const res = await db.query<{ id: string }>(
        `UPDATE google_connection
            SET revoked_at        = NOW(),
                access_token_enc  = NULL,
                refresh_token_enc = NULL
          WHERE id        = $1
            AND tenant_id = $2
            AND brand_id IS NOT DISTINCT FROM $3
          RETURNING id`,
        [connectionId, tenantId, brandId]
      );

      if (!res.rows[0]) {
        return c.json({ error: "Connection not found.", code: "NOT_FOUND" }, 404);
      }

      logger.info("google_connection_revoked", {
        connection_id: connectionId,
        tenant_id: tenantId,
        brand_id: brandId,
      });

      return c.json({ revoked: true }, 200);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/google/metrics
  // requireAuth (any role)
  // Returns { ga4: MetricSeries | null, gsc: MetricSeries | null }
  // or { configured: false, ga4: null, gsc: null }
  // Cache: 24-hour TTL; inline refresh on stale/miss.
  // -------------------------------------------------------------------------
  app.get(
    "/api/brands/:id/google/metrics",
    requireAuth,
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      if (!googleOAuthConfigured()) {
        return c.json({ configured: false, ga4: null, gsc: null }, 200);
      }

      await db.setTenantId(tenantId);

      // Fetch connections for this brand
      const connRes = await db.query<GoogleConnectionRow>(
        `SELECT id, tenant_id, brand_id, kind,
                access_token_enc, refresh_token_enc,
                ga4_property_id, gsc_site_url, scope, expires_at,
                created_at, revoked_at
           FROM google_connection
          WHERE tenant_id = $1
            AND brand_id IS NOT DISTINCT FROM $2
            AND revoked_at IS NULL`,
        [tenantId, brandId]
      );

      if (connRes.rows.length === 0) {
        return c.json({ ga4: null, gsc: null }, 200);
      }

      const result: {
        ga4: null | object;
        gsc: null | object;
      } = { ga4: null, gsc: null };

      for (const conn of connRes.rows) {
        const kind = conn.kind;

        // Get latest cache row for this connection
        const cacheRes = await db.query<MetricCacheRow>(
          `SELECT id, connection_id, kind, fetched_at, period_start, period_end, series
             FROM google_metric_cache
            WHERE connection_id = $1
            ORDER BY fetched_at DESC
            LIMIT 1`,
          [conn.id]
        );

        const cacheRow = cacheRes.rows[0];
        const cacheAge = cacheRow
          ? Date.now() - new Date(cacheRow.fetched_at).getTime()
          : Infinity;
        const isCacheValid = cacheAge < CACHE_TTL_MS;

        if (cacheRow && isCacheValid) {
          // Return from cache
          result[kind] = {
            cachedAt: cacheRow.fetched_at,
            periodStart: cacheRow.period_start,
            periodEnd: cacheRow.period_end,
            series: cacheRow.series,
          };
          continue;
        }

        // Cache miss or stale — fetch fresh data
        try {
          const accessToken = await ensureValidAccessToken(db, conn, tenantId);

          let series: unknown[] = [];
          let periodStart: string;
          let periodEnd: string;

          if (kind === "ga4") {
            if (!conn.ga4_property_id) {
              // No property configured yet — skip
              continue;
            }
            const rows = await fetchGA4OrganicSessions(accessToken, conn.ga4_property_id);
            series = rows;
            periodStart =
              rows[0]?.date ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            periodEnd = rows[rows.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
          } else {
            // gsc
            if (!conn.gsc_site_url) {
              continue;
            }
            const rows = await fetchGSCSearchAnalytics(accessToken, conn.gsc_site_url);
            series = rows;
            periodStart =
              rows[0]?.date ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            periodEnd = rows[rows.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
          }

          const now = new Date().toISOString();

          // Store/update cache — raw_response is always null (no token/PII storage)
          await db.query(
            `INSERT INTO google_metric_cache
               (connection_id, tenant_id, brand_id, kind, fetched_at, period_start, period_end, series, raw_response)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
            [
              conn.id,
              tenantId,
              brandId,
              kind,
              now,
              periodStart,
              periodEnd,
              jsonbParam(series),
            ]
          );

          result[kind] = {
            cachedAt: now,
            periodStart,
            periodEnd,
            series,
          };

          logger.info("google_metric_cache_refreshed", {
            kind,
            tenant_id: tenantId,
            brand_id: brandId,
            rows: series.length,
          });
        } catch (err) {
          // Non-fatal: log and skip this connection
          logger.warn("google_metric_fetch_failed", {
            kind,
            tenant_id: tenantId,
            message: (err as Error).message,
          });
          // Return null for this kind (no crash)
        }
      }

      return c.json(result, 200);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/attribution/summary
  // requireAuth (any role)
  // Returns correlation summary between AI Visibility Score and organic metrics.
  // -------------------------------------------------------------------------
  app.get(
    "/api/brands/:id/attribution/summary",
    requireAuth,
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      if (!googleOAuthConfigured()) {
        return c.json(
          {
            summary: null,
            ga4Available: false,
            gscAvailable: false,
            scoreAvailable: false,
            configured: false,
          },
          200
        );
      }

      await db.setTenantId(tenantId);

      // Fetch score trend (last 90 days)
      const scoreRes = await db.query<{
        recorded_at: string;
        score_overall: number | null;
      }>(
        `SELECT gs.created_at  AS recorded_at,
                CASE
                  WHEN gs.provider_breakdown IS NOT NULL AND (gs.provider_breakdown->>'overall') IS NOT NULL
                    THEN (gs.provider_breakdown->>'overall')::numeric
                  ELSE ROUND(
                    COALESCE(gs.score_brand, 0) * 0.3 +
                    COALESCE(gs.score_performance, 0) * 0.35 +
                    COALESCE(gs.score_ai, 0) * 0.35
                  )
                END AS score_overall
           FROM geo_score gs
           JOIN geo_audit ga ON ga.id = gs.audit_id
          WHERE ga.brand_id  = $1
            AND ga.tenant_id = $2
            AND ga.status    = 'complete'
          ORDER BY gs.created_at ASC
          LIMIT 90`,
        [brandId, tenantId]
      );

      const scoreTrend = scoreRes.rows;
      const scoreAvailable = scoreTrend.length > 0;

      // Fetch latest GA4 + GSC metric cache rows
      const cacheRes = await db.query<MetricCacheRow>(
        `SELECT DISTINCT ON (kind) kind, series, fetched_at, period_start, period_end
           FROM google_metric_cache
          WHERE tenant_id = $1
            AND brand_id IS NOT DISTINCT FROM $2
          ORDER BY kind, fetched_at DESC`,
        [tenantId, brandId]
      );

      let ga4Series: Array<{ date: string; sessions: number; users: number }> | null = null;
      let gscSeries: Array<{ date: string; clicks: number; impressions: number }> | null = null;

      for (const row of cacheRes.rows) {
        if (row.kind === "ga4") {
          ga4Series = row.series as Array<{ date: string; sessions: number; users: number }>;
        } else if (row.kind === "gsc") {
          gscSeries = row.series as Array<{ date: string; clicks: number; impressions: number }>;
        }
      }

      const ga4Available = ga4Series !== null && ga4Series.length > 0;
      const gscAvailable = gscSeries !== null && gscSeries.length > 0;

      const summary = computeAttributionSummary(scoreTrend, ga4Series, gscSeries);

      return c.json(
        {
          summary,
          ga4Available,
          gscAvailable,
          scoreAvailable,
        },
        200
      );
    }
  );
}
