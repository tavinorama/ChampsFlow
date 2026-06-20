/**
 * C4 OAuth Connect — Social Accounts API routes
 *
 * Routes implemented (architecture §5 API contracts):
 *   GET    /api/social-accounts                     — list connected accounts (requireAuth)
 *   POST   /api/social-accounts/connect/linkedin    — initiate LinkedIn OAuth (Owner/Editor)
 *   GET    /api/social-accounts/callback/linkedin   — LinkedIn OAuth callback (state-validated)
 *   POST   /api/social-accounts/connect/instagram   — initiate Instagram OAuth (Owner/Editor)
 *   GET    /api/social-accounts/callback/instagram  — Instagram OAuth callback (state-validated)
 *   POST   /api/social-accounts/connect/facebook    — initiate Facebook OAuth (Owner/Editor)
 *   GET    /api/social-accounts/callback/facebook   — Facebook OAuth callback (state-validated)
 *   POST   /api/social-accounts/:id/select-page     — Facebook multi-page selection (Owner/Editor)
 *   DELETE /api/social-accounts/:id                 — disconnect account (Owner only)
 *
 * Compliance:
 *  - S-2: all DB queries use tenant_id from JWT claim only
 *  - S-4: structured logger, no token values in logs
 *  - S-9: token expiry checked pre-publish (enforced in worker; noted here)
 *  - S-10: key_version stored alongside encrypted tokens
 *  - S-7: audit_log writes for connect/disconnect events
 *  - CC-1: append-only audit_log enforced at DB level (REVOKE UPDATE/DELETE)
 *
 * Per-tenant rate limit: 10 connect attempts/hour (Redis token bucket, shared
 * bucket across all platforms — facebook connect counts against the same limit).
 * Auth guards: per-route explicit (not by ordering).
 *
 * Facebook multi-page flow:
 *  When a Facebook user manages multiple Pages, the callback stores a temporary
 *  Redis entry (key: facebook:pages:<accountId>, TTL: 15 min) containing the
 *  Page list with their plaintext access_tokens. The frontend calls
 *  POST /api/social-accounts/:id/select-page with { pageId } to choose a Page.
 *  The backend retrieves the Redis entry, encrypts the chosen Page's token, and
 *  updates the social_accounts row. Single-page accounts are auto-selected
 *  during the callback and no select-page call is required.
 */

import { Hono } from "hono";
import { Redis } from "@upstash/redis";
import { requireAuth, requireRole, requireNotProcessingRestricted } from "../auth/middleware";
import { requireDpaAcknowledged } from "./dpa";
import { requireNotRestricted } from "./billing";
import {
  createOAuthState,
  consumeOAuthState,
  OAuthStateError,
} from "../auth/oauth-state";
import {
  buildLinkedInAuthUrl,
  exchangeLinkedInCode,
  fetchLinkedInProfile,
  revokeLinkedInToken,
  LinkedInOAuthError,
  generateCodeVerifier,
} from "../integrations/linkedin";
import {
  buildInstagramAuthUrl,
  exchangeInstagramCode,
  fetchInstagramProfile,
  revokeInstagramToken,
  InstagramOAuthError,
} from "../integrations/instagram";
import {
  buildFacebookAuthUrl,
  exchangeFacebookCode,
  selectFacebookPage,
  revokeFacebookToken,
  FacebookOAuthError,
  type FacebookPage,
} from "../integrations/facebook";
import { decryptToken, scrubTokens } from "../../../../packages/shared/src/crypto";
import { logger } from "../../../../packages/shared/src/logger";
import type { SocialAccountPublic } from "../../../../packages/shared/src/index";

// ---------------------------------------------------------------------------
// Postgres query helper — parameterized only (backend-coder hard rule #1)
// ---------------------------------------------------------------------------
// In production this would be a Postgres client instance (e.g., postgres.js).
// The query helper sets app.current_tenant_id in the session before every query,
// satisfying the RLS policy in the migration.
//
// We import the db client from a shared module (to be wired in the app entry point).
// For testability, the db is accepted as a dependency at registration time.

// ---------------------------------------------------------------------------
// Redis client for rate limiting
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit: 10 connect attempts/hour (Redis token bucket)
// Shared bucket across all platforms (linkedin, instagram, facebook).
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour
const RATE_LIMIT_KEY_PREFIX = "ratelimit:oauth_connect:";

// ---------------------------------------------------------------------------
// Facebook multi-page pending selection storage (Redis, 15-min TTL)
// Key: facebook:pages:<accountId>
// Value: JSON array of FacebookPage objects (includes plaintext access_tokens)
// These are stored only in Redis (never in DB) and deleted after page selection.
// ---------------------------------------------------------------------------
const FB_PAGES_KEY_PREFIX = "facebook:pages:";
const FB_PAGES_TTL_SECONDS = 900; // 15 minutes

async function checkConnectRateLimit(tenantId: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp seconds
}> {
  const redis = getRedis();
  const key = `${RATE_LIMIT_KEY_PREFIX}${tenantId}`;

  // Atomic increment + TTL set on first use
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.ttl(key);
  const [[, count], [, ttl]] = (await pipeline.exec()) as [
    [null, number],
    [null, number]
  ];

  // Set TTL only on first attempt (ttl === -1 means key exists without TTL after INCR race)
  if (ttl === -1 || ttl === -2) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }

  const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS);
  const remaining = Math.max(0, RATE_LIMIT_MAX - (count ?? 0));
  const allowed = (count ?? 0) <= RATE_LIMIT_MAX;

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Audit log writer — INSERT only (DB-level REVOKE on UPDATE/DELETE enforces CC-1/S-7)
// ---------------------------------------------------------------------------
type AuditEvent = "social_account_connected" | "social_account_disconnected";

async function writeAuditLog(
  db: PostgresClient,
  event: AuditEvent,
  actorUserId: string,
  tenantId: string,
  targetId: string,
  metadata: Record<string, string | number | boolean | null>
): Promise<void> {
  // Parameterized query — never string-interpolated (hard rule #1)
  await db.query(
    `INSERT INTO audit_log
       (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [event, actorUserId, tenantId, "social_accounts", targetId, JSON.stringify(metadata)]
  );
}

// ---------------------------------------------------------------------------
// Type stub for Postgres client (wired by app entry point)
// ---------------------------------------------------------------------------
/**
 * A transaction-scoped database handle. Exposes the same parameterized query
 * API as PostgresClient, but every query runs inside the enclosing transaction
 * opened by PostgresClient.transaction() — they commit together or roll back
 * together.
 */
export interface TxClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Sets app.current_tenant_id in the Postgres session (for RLS) */
  setTenantId(tenantId: string): Promise<void>;
  /**
   * Run `fn` inside a single explicit DB transaction. Every query issued via the
   * supplied TxClient commits together or rolls back together — if `fn` throws,
   * the transaction is rolled back and the error propagates. Use this for any
   * multi-statement mutation whose partial application would leave data in an
   * inconsistent state (e.g. the GDPR Art. 17 erasure cascade).
   *
   * Tenant context: if the current async context carries a tenant scope, the
   * transaction sets the RLS GUC + drops to app_user first (mirroring query());
   * unscoped contexts (e.g. super-admin) run as the privileged login role.
   *
   * `opts.mode` is appended to BEGIN (e.g. "read only isolation level
   * repeatable read") for read-only / snapshot-consistent read sequences.
   */
  transaction<T>(
    fn: (tx: TxClient) => Promise<T>,
    opts?: { mode?: string }
  ): Promise<T>;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerSocialAccountRoutes(
  app: Hono,
  db: PostgresClient
): void {

  // --------------------------------------------------------------------------
  // GET /api/social-accounts
  // Auth: requireAuth (any role)
  // Returns: list of connected accounts (no encrypted token values)
  // --------------------------------------------------------------------------
  app.get(
    "/api/social-accounts",
    requireAuth,
    async (ctx) => {
      const auth = ctx.get("auth");

      try {
        await db.setTenantId(auth.tenantId);

        // Parameterized — tenant_id from JWT claim only, not request (S-2)
        const result = await db.query<{
          id: string;
          platform: string;
          platform_user_id: string;
          scope: string | null;
          expires_at: string | null;
          connected_at: string;
          revoked_at: string | null;
        }>(
          `SELECT id, platform, platform_user_id, scope, expires_at, connected_at, revoked_at
           FROM social_accounts
           WHERE tenant_id = $1
           ORDER BY connected_at DESC`,
          [auth.tenantId]
        );

        const accounts: SocialAccountPublic[] = result.rows.map((row) => ({
          id: row.id,
          platform: row.platform as "linkedin" | "instagram" | "facebook",
          platformUserId: row.platform_user_id,
          scope: row.scope,
          expiresAt: row.expires_at,
          connectedAt: row.connected_at,
          revokedAt: row.revoked_at,
        }));

        return ctx.json({ ok: true, data: { accounts } });
      } catch (err) {
        logger.error("social_accounts_list_error", {
          tenantId: auth.tenantId,
          error: (err as Error).message,
        });
        return ctx.json(
          { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to list accounts" } },
          500
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /api/social-accounts/connect/linkedin
  // Auth: requireAuth + requireRole(['owner','editor'])
  // Returns: authorizationUrl to redirect user to
  // --------------------------------------------------------------------------
  app.post(
    "/api/social-accounts/connect/linkedin",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");

      // Rate limit check
      const rateLimit = await checkConnectRateLimit(auth.tenantId);
      if (!rateLimit.allowed) {
        logger.warn("oauth_connect_rate_limited", {
          tenantId: auth.tenantId,
          platform: "linkedin",
        });
        ctx.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
        ctx.header("X-RateLimit-Remaining", "0");
        ctx.header("X-RateLimit-Reset", String(rateLimit.resetAt));
        ctx.header("Retry-After", String(rateLimit.resetAt - Math.floor(Date.now() / 1000)));
        return ctx.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many connect attempts. Please try again later.",
              retryable: true,
              retryAfterSeconds: rateLimit.resetAt - Math.floor(Date.now() / 1000),
            },
          },
          429
        );
      }

      try {
        const codeVerifier = generateCodeVerifier();
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI!;

        const state = await createOAuthState({
          userId: auth.userId,
          tenantId: auth.tenantId,
          platform: "linkedin",
          redirectUri,
          codeVerifier,
        });

        const authorizationUrl = buildLinkedInAuthUrl({ state, codeVerifier });

        logger.info("oauth_connect_initiated", {
          platform: "linkedin",
          tenantId: auth.tenantId,
          userId: auth.userId,
        });

        return ctx.json({ ok: true, data: { authorizationUrl, state } });
      } catch (err) {
        logger.error("linkedin_connect_initiate_error", {
          tenantId: auth.tenantId,
          error: (err as Error).message,
        });
        return ctx.json(
          { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to initiate LinkedIn OAuth" } },
          500
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /api/social-accounts/callback/linkedin
  // Auth: state param validation (no Bearer — redirect from OAuth provider)
  // --------------------------------------------------------------------------
  app.get("/api/social-accounts/callback/linkedin", async (ctx) => {
    const code = ctx.req.query("code");
    const state = ctx.req.query("state");
    const error = ctx.req.query("error");

    // User denied or OAuth error
    if (error) {
      logger.info("linkedin_oauth_denied_by_user", { error });
      return ctx.redirect(`${process.env.FRONTEND_URL}/account/connections?error=oauth_denied`);
    }

    if (!code || !state) {
      return ctx.redirect(`${process.env.FRONTEND_URL}/account/connections?error=invalid_callback`);
    }

    let statePayload;
    try {
      statePayload = await consumeOAuthState(state);
    } catch (err) {
      const code = err instanceof OAuthStateError ? err.code : "UNKNOWN";
      logger.warn("linkedin_callback_invalid_state", { stateErrorCode: code });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=invalid_state`
      );
    }

    try {
      // Exchange code for encrypted tokens
      const tokens = await exchangeLinkedInCode(code, statePayload.codeVerifier);

      // Fetch profile for platform_user_id
      const plainAccessToken = decryptToken(tokens.accessTokenEnc);
      const profile = await fetchLinkedInProfile(plainAccessToken);
      // plainAccessToken not stored beyond this scope; GC'd after use

      // Upsert social_account — parameterized (hard rule #1)
      await db.setTenantId(statePayload.tenantId);

      const result = await db.query<{ id: string }>(
        `INSERT INTO social_accounts
           (tenant_id, user_id, platform, platform_user_id,
            access_token_enc, refresh_token_enc, key_version,
            scope, expires_at, connected_at, revoked_at, updated_at)
         VALUES ($1, $2, 'linkedin', $3, $4, $5, $6, $7, $8, NOW(), NULL, NOW())
         ON CONFLICT (tenant_id, platform, platform_user_id)
         DO UPDATE SET
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           key_version = EXCLUDED.key_version,
           scope = EXCLUDED.scope,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL,
           updated_at = NOW()
         RETURNING id`,
        [
          statePayload.tenantId,
          statePayload.userId,
          profile.platformUserId,
          tokens.accessTokenEnc,
          tokens.refreshTokenEnc,
          tokens.keyVersion,
          tokens.scope,
          tokens.expiresAt.toISOString(),
        ]
      );

      const accountId = result.rows[0]?.id;

      // Audit log: social_account_connected (S-7 / CI-5)
      if (accountId) {
        await writeAuditLog(db, "social_account_connected", statePayload.userId, statePayload.tenantId, accountId, {
          platform: "linkedin",
          platformUserId: profile.platformUserId,
        });
      }

      logger.info("linkedin_account_connected", {
        tenantId: statePayload.tenantId,
        userId: statePayload.userId,
        accountId,
        platform: "linkedin",
      });

      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?success=linkedin`
      );
    } catch (err) {
      logger.error("linkedin_callback_error", {
        tenantId: statePayload.tenantId,
        error: (err as Error).message,
        retryable: err instanceof LinkedInOAuthError ? err.kind === "RETRYABLE" : false,
      });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=connect_failed`
      );
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/social-accounts/connect/instagram
  // Auth: requireAuth + requireRole(['owner','editor'])
  // --------------------------------------------------------------------------
  app.post(
    "/api/social-accounts/connect/instagram",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");

      const rateLimit = await checkConnectRateLimit(auth.tenantId);
      if (!rateLimit.allowed) {
        logger.warn("oauth_connect_rate_limited", {
          tenantId: auth.tenantId,
          platform: "instagram",
        });
        ctx.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
        ctx.header("X-RateLimit-Remaining", "0");
        ctx.header("X-RateLimit-Reset", String(rateLimit.resetAt));
        ctx.header("Retry-After", String(rateLimit.resetAt - Math.floor(Date.now() / 1000)));
        return ctx.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many connect attempts. Please try again later.",
              retryable: true,
              retryAfterSeconds: rateLimit.resetAt - Math.floor(Date.now() / 1000),
            },
          },
          429
        );
      }

      try {
        const codeVerifier = generateCodeVerifier(); // stored in state for PKCE client-server leg
        const redirectUri = process.env.INSTAGRAM_REDIRECT_URI!;

        const state = await createOAuthState({
          userId: auth.userId,
          tenantId: auth.tenantId,
          platform: "instagram",
          redirectUri,
          codeVerifier,
        });

        const authorizationUrl = buildInstagramAuthUrl(state);

        logger.info("oauth_connect_initiated", {
          platform: "instagram",
          tenantId: auth.tenantId,
          userId: auth.userId,
        });

        return ctx.json({ ok: true, data: { authorizationUrl, state } });
      } catch (err) {
        logger.error("instagram_connect_initiate_error", {
          tenantId: auth.tenantId,
          error: (err as Error).message,
        });
        return ctx.json(
          { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to initiate Instagram OAuth" } },
          500
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /api/social-accounts/callback/instagram
  // Auth: state param validation
  // --------------------------------------------------------------------------
  app.get("/api/social-accounts/callback/instagram", async (ctx) => {
    const code = ctx.req.query("code");
    const state = ctx.req.query("state");
    const error = ctx.req.query("error");

    if (error) {
      logger.info("instagram_oauth_denied_by_user", { error });
      return ctx.redirect(`${process.env.FRONTEND_URL}/account/connections?error=oauth_denied`);
    }

    if (!code || !state) {
      return ctx.redirect(`${process.env.FRONTEND_URL}/account/connections?error=invalid_callback`);
    }

    let statePayload;
    try {
      statePayload = await consumeOAuthState(state);
    } catch (err) {
      const errCode = err instanceof OAuthStateError ? err.code : "UNKNOWN";
      logger.warn("instagram_callback_invalid_state", { stateErrorCode: errCode });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=invalid_state`
      );
    }

    try {
      const tokens = await exchangeInstagramCode(code);

      // Fetch profile
      const plainAccessToken = decryptToken(tokens.accessTokenEnc);
      const profile = await fetchInstagramProfile(plainAccessToken, tokens.platformUserId);

      await db.setTenantId(statePayload.tenantId);

      const result = await db.query<{ id: string }>(
        `INSERT INTO social_accounts
           (tenant_id, user_id, platform, platform_user_id,
            access_token_enc, refresh_token_enc, key_version,
            scope, expires_at, connected_at, revoked_at, updated_at)
         VALUES ($1, $2, 'instagram', $3, $4, $5, $6, $7, $8, NOW(), NULL, NOW())
         ON CONFLICT (tenant_id, platform, platform_user_id)
         DO UPDATE SET
           access_token_enc = EXCLUDED.access_token_enc,
           key_version = EXCLUDED.key_version,
           scope = EXCLUDED.scope,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL,
           updated_at = NOW()
         RETURNING id`,
        [
          statePayload.tenantId,
          statePayload.userId,
          profile.platformUserId,
          tokens.accessTokenEnc,
          tokens.refreshTokenEnc,
          tokens.keyVersion,
          tokens.scope,
          tokens.expiresAt.toISOString(),
        ]
      );

      const accountId = result.rows[0]?.id;

      if (accountId) {
        await writeAuditLog(db, "social_account_connected", statePayload.userId, statePayload.tenantId, accountId, {
          platform: "instagram",
          platformUserId: profile.platformUserId,
          username: profile.username,
        });
      }

      logger.info("instagram_account_connected", {
        tenantId: statePayload.tenantId,
        userId: statePayload.userId,
        accountId,
        platform: "instagram",
      });

      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?success=instagram`
      );
    } catch (err) {
      logger.error("instagram_callback_error", {
        tenantId: statePayload.tenantId,
        error: (err as Error).message,
        retryable: err instanceof InstagramOAuthError ? err.kind === "RETRYABLE" : false,
      });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=connect_failed`
      );
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/social-accounts/connect/facebook
  // Auth: requireAuth + requireRole(['owner','editor'])
  // Returns: authorizationUrl for redirect to Facebook dialog
  // --------------------------------------------------------------------------
  app.post(
    "/api/social-accounts/connect/facebook",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");

      const rateLimit = await checkConnectRateLimit(auth.tenantId);
      if (!rateLimit.allowed) {
        logger.warn("oauth_connect_rate_limited", {
          tenantId: auth.tenantId,
          platform: "facebook",
        });
        ctx.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
        ctx.header("X-RateLimit-Remaining", "0");
        ctx.header("X-RateLimit-Reset", String(rateLimit.resetAt));
        ctx.header(
          "Retry-After",
          String(rateLimit.resetAt - Math.floor(Date.now() / 1000))
        );
        return ctx.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many connect attempts. Please try again later.",
              retryable: true,
              retryAfterSeconds:
                rateLimit.resetAt - Math.floor(Date.now() / 1000),
            },
          },
          429
        );
      }

      try {
        // Facebook does not support PKCE natively; we use a state nonce for CSRF
        // protection (same pattern as Instagram — see integrations/instagram.ts note).
        // codeVerifier is stored in state but not sent to Meta.
        const codeVerifier = generateCodeVerifier();
        const redirectUri = process.env.FACEBOOK_REDIRECT_URI!;

        const state = await createOAuthState({
          userId: auth.userId,
          tenantId: auth.tenantId,
          platform: "facebook",
          redirectUri,
          codeVerifier,
        });

        const authorizationUrl = buildFacebookAuthUrl(state);

        logger.info("oauth_connect_initiated", {
          platform: "facebook",
          tenantId: auth.tenantId,
          userId: auth.userId,
        });

        return ctx.json({ ok: true, data: { authorizationUrl, state } });
      } catch (err) {
        logger.error("facebook_connect_initiate_error", {
          tenantId: auth.tenantId,
          error: (err as Error).message,
        });
        return ctx.json(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to initiate Facebook OAuth",
            },
          },
          500
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /api/social-accounts/callback/facebook
  // Auth: state param validation (no Bearer — redirect from OAuth provider)
  //
  // Multi-page flow:
  //  - If user manages 1 Page: auto-select, store encrypted token, redirect
  //    to connections page with success=facebook.
  //  - If user manages >1 Pages: store pages (with tokens) in Redis under
  //    key facebook:pages:<accountId> (TTL 15 min), redirect to
  //    connections page with facebook_select_page=<accountId> so the
  //    frontend knows to show the page-picker modal.
  // --------------------------------------------------------------------------
  app.get("/api/social-accounts/callback/facebook", async (ctx) => {
    const code = ctx.req.query("code");
    const state = ctx.req.query("state");
    const error = ctx.req.query("error");

    if (error) {
      logger.info("facebook_oauth_denied_by_user", { error });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=oauth_denied`
      );
    }

    if (!code || !state) {
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=invalid_callback`
      );
    }

    let statePayload;
    try {
      statePayload = await consumeOAuthState(state);
    } catch (err) {
      const errCode = err instanceof OAuthStateError ? err.code : "UNKNOWN";
      logger.warn("facebook_callback_invalid_state", {
        stateErrorCode: errCode,
      });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=invalid_state`
      );
    }

    try {
      // Exchange code → short-lived → long-lived user token → Pages list
      // First page is auto-selected; its token is already encrypted in the result.
      const tokens = await exchangeFacebookCode(code);

      await db.setTenantId(statePayload.tenantId);

      // Upsert social_account row using the first/auto-selected Page's details.
      // For multi-page accounts this row will be updated by select-page endpoint.
      const result = await db.query<{ id: string }>(
        `INSERT INTO social_accounts
           (tenant_id, user_id, platform, platform_user_id,
            access_token_enc, refresh_token_enc, key_version,
            scope, expires_at, connected_at, revoked_at, updated_at)
         VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, $8, NOW(), NULL, NOW())
         ON CONFLICT (tenant_id, platform, platform_user_id)
         DO UPDATE SET
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           key_version = EXCLUDED.key_version,
           scope = EXCLUDED.scope,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL,
           updated_at = NOW()
         RETURNING id`,
        [
          statePayload.tenantId,
          statePayload.userId,
          tokens.platformUserId,
          tokens.accessTokenEnc,
          tokens.refreshTokenEnc,
          tokens.keyVersion,
          tokens.scope,
          tokens.expiresAt.toISOString(),
        ]
      );

      const accountId = result.rows[0]?.id;

      if (!accountId) {
        logger.error("facebook_callback_no_account_id", {
          tenantId: statePayload.tenantId,
        });
        return ctx.redirect(
          `${process.env.FRONTEND_URL}/account/connections?error=connect_failed`
        );
      }

      // Write audit log (S-7 / CI-5) — platform='facebook' in payload
      await writeAuditLog(
        db,
        "social_account_connected",
        statePayload.userId,
        statePayload.tenantId,
        accountId,
        {
          platform: "facebook",
          platformUserId: tokens.platformUserId,
          username: tokens.platformUsername,
          pageCount: tokens.pages.length,
        }
      );

      logger.info("facebook_account_connected", {
        tenantId: statePayload.tenantId,
        userId: statePayload.userId,
        accountId,
        platform: "facebook",
        pageCount: tokens.pages.length,
        autoSelected: tokens.pages.length === 1,
      });

      // Single-page: auto-selected — redirect to success
      if (tokens.pages.length === 1) {
        return ctx.redirect(
          `${process.env.FRONTEND_URL}/account/connections?success=facebook`
        );
      }

      // Multi-page: store pages (with plaintext tokens) in Redis for select-page endpoint.
      // Only page IDs and names are sent to the client; tokens stay server-side in Redis.
      const redis = getRedis();
      const pagesKey = `${FB_PAGES_KEY_PREFIX}${accountId}`;
      // Store full pages array including access_tokens — stays in Redis only
      await redis.set(pagesKey, JSON.stringify(tokens.pages), {
        ex: FB_PAGES_TTL_SECONDS,
      });

      logger.info("facebook_multi_page_pending_selection", {
        tenantId: statePayload.tenantId,
        accountId,
        pageCount: tokens.pages.length,
        // page tokens NOT logged; page IDs already logged above
      });

      // Redirect with select-page signal; frontend will show the page-picker modal.
      // pageOptions contains only id and name — NO tokens exposed to client.
      const pageOptions = tokens.pages.map((p) => ({
        id: p.id,
        name: p.name,
      }));

      // Encode page options as a URL-safe base64 JSON string for the redirect param.
      // Tokens are NOT included in pageOptions — only page IDs and names.
      const pageOptionsEncoded = Buffer.from(
        JSON.stringify(pageOptions)
      ).toString("base64url");

      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?facebook_select_page=${accountId}&pages=${pageOptionsEncoded}`
      );
    } catch (err) {
      logger.error("facebook_callback_error", {
        tenantId: statePayload.tenantId,
        error: (err as Error).message,
        retryable:
          err instanceof FacebookOAuthError ? err.kind === "RETRYABLE" : false,
      });
      return ctx.redirect(
        `${process.env.FRONTEND_URL}/account/connections?error=connect_failed`
      );
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/social-accounts/:id/select-page
  // Auth: requireAuth + requireRole(['owner','editor'])
  // Body: { pageId: string }
  //
  // For multi-page Facebook accounts: user selects which Page to manage.
  // Retrieves the stored pages list from Redis (with plaintext tokens),
  // encrypts the selected Page's token, updates the social_accounts row.
  //
  // Returns 200 with { autoSelected: true } for single-page accounts
  // (no Redis key exists — the token was already stored during callback).
  // --------------------------------------------------------------------------
  app.post(
    "/api/social-accounts/:id/select-page",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (ctx) => {
      const auth = ctx.get("auth");
      const accountId = ctx.req.param("id");
      if (!accountId) return ctx.json({ error: "missing_id", code: "MISSING_ID" }, 400);

      // Validate UUID format
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(accountId)) {
        return ctx.json(
          {
            ok: false,
            error: { code: "INVALID_ID", message: "Invalid account ID format" },
          },
          400
        );
      }

      // Check if this is a single-page account (no Redis key)
      const redis = getRedis();
      const pagesKey = `${FB_PAGES_KEY_PREFIX}${accountId}`;
      const rawPages = await redis.get<string>(pagesKey);

      if (!rawPages) {
        // No pending page selection — this is a single-page account (already stored)
        // or the TTL has expired. Return auto-selected indicator.
        logger.info("facebook_select_page_no_pending", {
          accountId,
          tenantId: auth.tenantId,
          reason: "no_redis_key",
        });
        return ctx.json({
          ok: true,
          data: { autoSelected: true, message: "Page was already auto-selected" },
        });
      }

      // Parse the stored pages
      let pages: FacebookPage[];
      try {
        pages = JSON.parse(rawPages) as FacebookPage[];
      } catch {
        logger.error("facebook_select_page_parse_error", {
          accountId,
          tenantId: auth.tenantId,
        });
        return ctx.json(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to load page selection data",
            },
          },
          500
        );
      }

      // Parse and validate request body
      let body: { pageId?: string };
      try {
        body = await ctx.req.json<{ pageId?: string }>();
      } catch {
        return ctx.json(
          {
            ok: false,
            error: { code: "INVALID_BODY", message: "Request body must be JSON with pageId" },
          },
          400
        );
      }

      const { pageId } = body;
      if (!pageId || typeof pageId !== "string") {
        return ctx.json(
          {
            ok: false,
            error: {
              code: "MISSING_PAGE_ID",
              message: "pageId is required",
            },
          },
          400
        );
      }

      // Find the selected page in the stored list
      const selectedPage = pages.find((p) => p.id === pageId);
      if (!selectedPage) {
        return ctx.json(
          {
            ok: false,
            error: {
              code: "INVALID_PAGE_ID",
              message: "The specified page was not found in your account",
            },
          },
          400
        );
      }

      try {
        await db.setTenantId(auth.tenantId);

        // Verify the account exists and belongs to this tenant (S-2: tenant isolation)
        const fetchResult = await db.query<{
          id: string;
          platform: string;
          revoked_at: string | null;
        }>(
          `SELECT id, platform, revoked_at
           FROM social_accounts
           WHERE id = $1 AND tenant_id = $2`,
          [accountId, auth.tenantId]
        );

        if (!fetchResult.rows.length) {
          return ctx.json(
            {
              ok: false,
              error: { code: "NOT_FOUND", message: "Social account not found" },
            },
            404
          );
        }

        const account = fetchResult.rows[0];

        if (account.platform !== "facebook") {
          return ctx.json(
            {
              ok: false,
              error: {
                code: "INVALID_PLATFORM",
                message: "Page selection is only valid for Facebook accounts",
              },
            },
            400
          );
        }

        if (account.revoked_at) {
          return ctx.json(
            {
              ok: false,
              error: {
                code: "ACCOUNT_REVOKED",
                message: "This account has been disconnected",
              },
            },
            409
          );
        }

        // Encrypt the selected Page's token
        // expiresAt: 60-day window from now (Page tokens from long-lived user tokens
        // are long-lived; we use 60 days as a conservative bound matching Instagram)
        const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        const selectionResult = selectFacebookPage(selectedPage, expiresAt);

        // Update the social_accounts row with the selected Page's token and ID
        await db.query(
          `UPDATE social_accounts
           SET platform_user_id = $1,
               access_token_enc = $2,
               refresh_token_enc = $3,
               key_version = $4,
               scope = $5,
               expires_at = $6,
               updated_at = NOW()
           WHERE id = $7 AND tenant_id = $8`,
          [
            selectionResult.platformUserId,
            selectionResult.accessTokenEnc,
            selectionResult.refreshTokenEnc,
            selectionResult.keyVersion,
            selectionResult.scope,
            selectionResult.expiresAt.toISOString(),
            accountId,
            auth.tenantId,
          ]
        );

        // Delete the Redis key — tokens are now stored encrypted in DB
        await redis.del(pagesKey);

        // Audit log: page selection is part of the connect flow (S-7)
        await writeAuditLog(
          db,
          "social_account_connected",
          auth.userId,
          auth.tenantId,
          accountId,
          {
            platform: "facebook",
            platformUserId: selectionResult.platformUserId,
            username: selectionResult.platformUsername,
            pageSelected: true,
          }
        );

        logger.info("facebook_page_selected_and_stored", {
          tenantId: auth.tenantId,
          userId: auth.userId,
          accountId,
          platformUserId: selectionResult.platformUserId,
          // token NOT logged
        });

        return ctx.json({
          ok: true,
          data: {
            autoSelected: false,
            platformUserId: selectionResult.platformUserId,
            platformUsername: selectionResult.platformUsername,
          },
        });
      } catch (err) {
        logger.error("facebook_select_page_error", {
          tenantId: auth.tenantId,
          accountId,
          error: (err as Error).message,
        });
        return ctx.json(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to select Facebook Page",
            },
          },
          500
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // DELETE /api/social-accounts/:id
  // Auth: requireAuth + requireRole(['owner'])
  // - Marks revoked_at, nulls encrypted columns
  // - Attempts platform-side token revocation (best-effort)
  // - Writes audit log
  // - Note: cancelling scheduled posts for this account is a separate job
  //   (worker-side cascade; not in scope for this route handler — deferred to C2)
  // --------------------------------------------------------------------------
  app.delete(
    "/api/social-accounts/:id",
    requireAuth,
    requireRole(["owner"]),
    async (ctx) => {
      const auth = ctx.get("auth");
      const accountId = ctx.req.param("id");
      if (!accountId) return ctx.json({ error: "missing_id", code: "MISSING_ID" }, 400);

      // Validate UUID format to avoid passing malformed input to DB
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(accountId)) {
        return ctx.json(
          { ok: false, error: { code: "INVALID_ID", message: "Invalid account ID format" } },
          400
        );
      }

      try {
        await db.setTenantId(auth.tenantId);

        // Fetch the account to get platform and encrypted token for revocation
        // tenant_id from JWT claim only — RLS double-enforces this (S-2)
        const fetchResult = await db.query<{
          id: string;
          platform: string;
          platform_user_id: string;
          access_token_enc: Buffer | null;
          revoked_at: string | null;
        }>(
          `SELECT id, platform, platform_user_id, access_token_enc, revoked_at
           FROM social_accounts
           WHERE id = $1 AND tenant_id = $2`,
          [accountId, auth.tenantId]
        );

        if (!fetchResult.rows.length) {
          return ctx.json(
            { ok: false, error: { code: "NOT_FOUND", message: "Social account not found" } },
            404
          );
        }

        const account = fetchResult.rows[0];

        if (account.revoked_at) {
          return ctx.json(
            { ok: false, error: { code: "ALREADY_REVOKED", message: "Account is already disconnected" } },
            409
          );
        }

        // Attempt platform-side token revocation (best-effort — errors are logged, not thrown)
        if (account.access_token_enc) {
          try {
            const plainToken = decryptToken(account.access_token_enc);
            if (account.platform === "linkedin") {
              await revokeLinkedInToken(plainToken);
            } else if (account.platform === "instagram") {
              await revokeInstagramToken(plainToken);
            } else if (account.platform === "facebook") {
              await revokeFacebookToken(plainToken);
            }
          } catch (revokeErr) {
            logger.warn("platform_token_revocation_failed", {
              platform: account.platform,
              accountId,
              tenantId: auth.tenantId,
              error: (revokeErr as Error).message,
              // token value NOT logged
            });
            // Continue with DB-side revocation even if platform revocation fails
          }
        }

        // Scrub encrypted columns and mark revoked_at (parameterized)
        const { accessTokenEnc, refreshTokenEnc } = scrubTokens();
        await db.query(
          `UPDATE social_accounts
           SET revoked_at = NOW(),
               access_token_enc = $1,
               refresh_token_enc = $2,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [accessTokenEnc, refreshTokenEnc, accountId, auth.tenantId]
        );

        // Audit log: social_account_disconnected (S-7 / CI-5)
        await writeAuditLog(
          db,
          "social_account_disconnected",
          auth.userId,
          auth.tenantId,
          accountId,
          {
            platform: account.platform,
            platformUserId: account.platform_user_id,
          }
        );

        logger.info("social_account_disconnected", {
          tenantId: auth.tenantId,
          userId: auth.userId,
          accountId,
          platform: account.platform,
          // platformUserId included for audit trace; not PII beyond what's in audit_log
          platformUserId: account.platform_user_id,
        });

        return ctx.json({ ok: true, data: { disconnected: true } });
      } catch (err) {
        logger.error("social_account_disconnect_error", {
          tenantId: auth.tenantId,
          accountId,
          error: (err as Error).message,
        });
        return ctx.json(
          {
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "Failed to disconnect account" },
          },
          500
        );
      }
    }
  );
}
