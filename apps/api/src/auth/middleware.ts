/**
 * Auth middleware for Organic Posts API
 * Validates Supabase Auth JWTs (RS256) and enforces RBAC roles.
 *
 * Architecture refs:
 *  - §6 Auth and AuthZ Model (FD-2 — Supabase Auth)
 *  - §6.3 Admin panel authZ (super_admin claim)
 *  - RBAC matrix: Owner / Editor / Viewer
 *
 * Hard rules (auth-agent):
 *  - JWT verified on EVERY request using Supabase RS256 public key
 *  - tenant_id resolved from JWT custom claim ONLY (never from request body)
 *  - Viewer routes block POST/PUT/PATCH/DELETE at middleware level
 *  - Per-route guards declared explicitly, not by middleware ordering
 */

import { createClient } from "@supabase/supabase-js";
import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { logger } from "../../../../packages/shared/src/logger";
import { runWithTenant } from "../db/tenant-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppRole = "owner" | "editor" | "viewer";

// tenant_id must be a UUID — it is interpolated into the RLS `::uuid` cast.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: AppRole;
  supabaseUid: string;
  isSuperAdmin: boolean;
}

// Extend Hono's context variable map
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// ---------------------------------------------------------------------------
// JWKS (Supabase RS256 public key — fetched once, cached by jose)
// ---------------------------------------------------------------------------
// The JWKS URI is the Supabase project URL + /auth/v1/jwks
// Env var: SUPABASE_URL (e.g. https://abcdef.supabase.co)
//
// We use a remote JWKS set so key rotation is handled automatically.
// jose caches the JWKS response and re-fetches on unknown kid.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (_jwks) return _jwks;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is not set");
  }
  _jwks = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/jwks`)
  );
  return _jwks;
}

// ---------------------------------------------------------------------------
// JWT payload shape from Supabase Auth
// ---------------------------------------------------------------------------
interface SupabaseJWTPayload {
  sub: string;                    // Supabase Auth user UUID
  email?: string;
  role?: string;                  // Supabase built-in role ('authenticated' | 'anon')
  app_metadata?: {
    tenant_id?: string;
    app_role?: AppRole;           // Custom claim: 'owner' | 'editor' | 'viewer'
    super_admin?: boolean;        // Custom claim for platform admin — set manually only
  };
  exp: number;
  iat: number;
}

// ---------------------------------------------------------------------------
// verifySupabaseToken — verify a Supabase JWT WITHOUT requiring a tenant claim.
// Used by the first-login provisioning endpoint (a brand-new user has a valid
// session but no tenant_id yet). Reuses the same JWKS/RS256 verification as
// requireAuth. Throws on an invalid/expired token.
// ---------------------------------------------------------------------------
export async function verifySupabaseToken(
  token: string
): Promise<{ uid: string; email?: string; tenantId?: string; role: AppRole; isSuperAdmin: boolean }> {
  const jwks = getJWKS();
  const { payload: raw } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    issuer: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/auth/v1` : undefined,
  });
  const payload = raw as unknown as SupabaseJWTPayload;
  return {
    uid: payload.sub,
    email: payload.email,
    tenantId: payload.app_metadata?.tenant_id,
    role: payload.app_metadata?.app_role ?? "viewer",
    isSuperAdmin: payload.app_metadata?.super_admin === true,
  };
}

// ---------------------------------------------------------------------------
// Core: requireAuth middleware
// ---------------------------------------------------------------------------
// Validates JWT, sets ctx.var.auth. Must be the first middleware on all
// protected routes. Does NOT enforce roles — use requireRole() for that.
//
// Security: tenant_id is read from JWT app_metadata.tenant_id ONLY.
// It is NEVER accepted from the request body, query string, or headers.
// ---------------------------------------------------------------------------
export async function requireAuth(ctx: Context, next: Next): Promise<void> {
  // ---------------------------------------------------------------------------
  // DEV-ONLY auth bypass — local end-to-end testing without Supabase.
  // HARD-GATED: active ONLY when DEV_AUTH_BYPASS=1 AND NODE_ENV !== production.
  // In production (NODE_ENV=production) this block is unreachable, so it can
  // never weaken the real JWT path. Resolves a fixed dev tenant/user (owner).
  // ---------------------------------------------------------------------------
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    const devTenantId =
      process.env.DEV_TENANT_ID ?? "11111111-1111-1111-1111-111111111111";
    const devUserId =
      process.env.DEV_USER_ID ?? "99999999-9999-9999-9999-999999999999";
    ctx.set("auth", {
      userId: devUserId,
      tenantId: devTenantId,
      role: "owner",
      supabaseUid: devUserId,
      isSuperAdmin: false,
    });
    logger.warn("dev_auth_bypass_active", { tenantId: devTenantId });
    // Establish the tenant scope so queries run under RLS even in dev bypass.
    await runWithTenant(devTenantId, () => next());
    return;
  }

  const authHeader = ctx.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.status(401);
    ctx.json({ error: "Unauthorized", code: "MISSING_TOKEN" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  let payload: SupabaseJWTPayload;
  try {
    const jwks = getJWKS();
    const { payload: raw } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      // Supabase uses the project URL as issuer
      issuer: process.env.SUPABASE_URL
        ? `${process.env.SUPABASE_URL}/auth/v1`
        : undefined,
    });
    payload = raw as unknown as SupabaseJWTPayload;
  } catch (err) {
    // Log without token value — only log structured error code
    logger.warn("jwt_verification_failed", {
      code: (err as Error).message?.includes("expired")
        ? "TOKEN_EXPIRED"
        : "TOKEN_INVALID",
    });
    ctx.status(401);
    ctx.json({ error: "Unauthorized", code: "INVALID_TOKEN" });
    return;
  }

  // Resolve tenant_id from JWT custom claim ONLY
  const tenantId = payload.app_metadata?.tenant_id;
  if (!tenantId) {
    logger.warn("jwt_missing_tenant_id", { supabaseUid: payload.sub });
    ctx.status(401);
    ctx.json({ error: "Unauthorized", code: "MISSING_TENANT_CLAIM" });
    return;
  }

  // The tenant_id flows into an RLS `::uuid` cast (app.current_tenant_id). Reject
  // a malformed claim here (401) rather than letting it surface as a 22P02 cast
  // error deep in a query — and to keep only well-formed values in the GUC.
  if (!UUID_RE.test(tenantId)) {
    logger.warn("jwt_invalid_tenant_id", { supabaseUid: payload.sub });
    ctx.status(401);
    ctx.json({ error: "Unauthorized", code: "INVALID_TENANT_CLAIM" });
    return;
  }

  // Resolve app role from JWT custom claim
  const role: AppRole = payload.app_metadata?.app_role ?? "viewer";
  const isSuperAdmin = payload.app_metadata?.super_admin === true;

  const authCtx: AuthContext = {
    userId: payload.sub,          // Supabase Auth UID (used as actor in audit logs)
    tenantId,
    role,
    supabaseUid: payload.sub,
    isSuperAdmin,
  };

  ctx.set("auth", authCtx);

  // Super-admins (platform-level / organicposts_admin design) operate
  // cross-tenant — e.g. POST /api/dsr/:id/fulfill, GET /metrics — so they run
  // UNSCOPED (as the privileged login role). All other authenticated requests
  // run inside a tenant scope so every query is enforced by RLS as app_user.
  if (isSuperAdmin) {
    await next();
    return;
  }
  await runWithTenant(tenantId, () => next());
}

// ---------------------------------------------------------------------------
// requireRole: per-route role guard
// ---------------------------------------------------------------------------
// Usage on a route:
//   app.post('/api/social-accounts/connect/linkedin',
//     requireAuth,
//     requireRole(['owner', 'editor']),
//     connectLinkedInHandler
//   )
//
// Design decision: roles are declared per-route explicitly — NOT inferred from
// middleware ordering. This matches architecture §6.3 requirement:
// "Every protected route must have a named middleware guard matching §5 API
// contracts scope — not implied by route ordering."
// ---------------------------------------------------------------------------
export function requireRole(allowedRoles: AppRole[]) {
  return async function roleGuard(ctx: Context, next: Next): Promise<void> {
    const auth = ctx.get("auth");
    if (!auth) {
      // requireAuth must run first
      ctx.status(401);
      ctx.json({ error: "Unauthorized", code: "MISSING_AUTH_CONTEXT" });
      return;
    }

    if (!allowedRoles.includes(auth.role)) {
      logger.warn("role_access_denied", {
        userId: auth.userId,
        tenantId: auth.tenantId,
        requiredRoles: allowedRoles,
        actualRole: auth.role,
      });
      ctx.status(403);
      ctx.json({
        error: "Forbidden",
        code: "INSUFFICIENT_ROLE",
        required: allowedRoles,
      });
      return;
    }

    // Viewer guard: block all state-changing methods at middleware level (arch §6)
    if (auth.role === "viewer") {
      const method = ctx.req.method.toUpperCase();
      const stateMutating = ["POST", "PUT", "PATCH", "DELETE"];
      if (stateMutating.includes(method)) {
        logger.warn("viewer_mutating_method_blocked", {
          userId: auth.userId,
          method,
          path: ctx.req.path,
        });
        ctx.status(403);
        ctx.json({
          error: "Forbidden",
          code: "VIEWER_READONLY",
          message: "Viewer accounts cannot perform write operations.",
        });
        return;
      }
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// requireNotProcessingRestricted: GDPR Art. 18 enforcement
// ---------------------------------------------------------------------------
// When users.restricted = TRUE, the user's data processing is restricted
// under GDPR Art. 18 (restriction of processing). All write operations that
// generate, process, or publish personal data must be blocked.
//
// Returns 403 with { error: 'processing_restricted', message: '...' } and
// writes an audit log event 'restricted_action_blocked' with target_endpoint
// only — no other PII is included in the log entry.
//
// Apply AFTER requireAuth, BEFORE requireRole and requireNotRestricted.
//
// Routes exempt (NOT applied to):
//   - All GET routes
//   - DSR routes (POST /api/dsr/*)
//   - Account settings, signout
//   - POST /api/billing/portal (manage existing subscription)
//   - POST /api/drafts/:id/report
//
// Routes where this IS applied:
//   - POST /api/drafts/generate
//   - POST /api/drafts/:id/regenerate
//   - POST /api/drafts/:id/approve
//   - POST /api/drafts/:id/schedule (registered in schedules.ts)
//   - POST /api/social-accounts/connect/{linkedin,instagram,facebook}
//   - POST /api/billing/checkout
// ---------------------------------------------------------------------------

// Minimal interface for the DB client — avoids circular import from routes/social-accounts.ts
interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  setTenantId(tenantId: string): Promise<void>;
}

export function requireNotProcessingRestricted(db: DbClient) {
  return async function notProcessingRestrictedGuard(
    ctx: Context,
    next: Next
  ): Promise<void> {
    const auth = ctx.get("auth");
    if (!auth) {
      ctx.status(401);
      ctx.json({ error: "Unauthorized", code: "MISSING_AUTH_CONTEXT" });
      return;
    }

    try {
      await db.setTenantId(auth.tenantId);

      const { rows } = await db.query<{ restricted: boolean }>(
        `SELECT restricted FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [auth.userId, auth.tenantId]
      );

      const isRestricted = rows[0]?.restricted === true;

      if (isRestricted) {
        // Audit log: target_endpoint only — no PII (GDPR Art. 18 compliance)
        await db
          .query(
            `INSERT INTO audit_log
               (id, tenant_id, actor_user_id, event_type, target_entity, metadata, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'restricted_action_blocked', 'users', $3, NOW())`,
            [
              auth.tenantId,
              auth.userId,
              JSON.stringify({ target_endpoint: ctx.req.path }),
            ]
          )
          .catch((auditErr: Error) => {
            logger.error("audit_log_write_failed", {
              event: "restricted_action_blocked",
              message: auditErr.message,
            });
          });

        logger.warn("gdpr_art18_processing_restricted_blocked", {
          tenant_id: auth.tenantId,
          path: ctx.req.path,
          // user_id deliberately NOT logged — PII minimisation
        });

        ctx.status(403);
        ctx.json({
          error: "processing_restricted",
          message:
            "Processing restricted under GDPR Art. 18. Contact privacy@trustindexai.com to lift the restriction.",
        });
        return;
      }
    } catch (err) {
      // On DB error, fail open to avoid blocking all users on infra issues.
      // Log without PII.
      logger.error("gdpr_art18_restriction_check_failed", {
        tenant_id: auth.tenantId,
        message: (err as Error).message,
      });
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// requireSuperAdmin: guard for /admin routes
// ---------------------------------------------------------------------------
// Separate from requireRole — super_admin is a platform-level claim, not a
// tenant-level role. Never assignable through self-service flows.
// Architecture §6.3: "absence of the claim results in an immediate 403".
// ---------------------------------------------------------------------------
export async function requireSuperAdmin(
  ctx: Context,
  next: Next
): Promise<void> {
  const auth = ctx.get("auth");
  if (!auth || !auth.isSuperAdmin) {
    ctx.status(403);
    ctx.json({ error: "Forbidden", code: "SUPER_ADMIN_REQUIRED" });
    return;
  }
  await next();
}

// ---------------------------------------------------------------------------
// Route manifest (for backend-reviewer and code-reviewer reference)
// ---------------------------------------------------------------------------
// This constant is the canonical per-route auth guard map for C4.
// backend-coder MUST apply these guards exactly as declared.
//
// Format: "METHOD /path" → { auth: requireAuth, role: requireRole([...]) }
//
// C4 OAuth Connect routes:
//   GET    /api/social-accounts                  — requireAuth (any role)
//   POST   /api/social-accounts/connect/linkedin  — requireAuth + requireRole(['owner','editor'])
//   GET    /api/social-accounts/callback/linkedin  — internal (validates state param instead)
//   POST   /api/social-accounts/connect/instagram  — requireAuth + requireRole(['owner','editor'])
//   GET    /api/social-accounts/callback/instagram  — internal (validates state param instead)
//   DELETE /api/social-accounts/:id               — requireAuth + requireRole(['owner'])
//
// Note: OAuth callback routes validate the `state` CSRF token instead of Bearer JWT,
// because the redirect comes from the OAuth provider browser redirect (no auth header).
// The state token is generated and verified server-side per the PKCE flow.
export const C4_ROUTE_AUTH_MANIFEST = {
  "GET /api/social-accounts": { middleware: ["requireAuth"] },
  "POST /api/social-accounts/connect/linkedin": {
    middleware: ["requireAuth", "requireRole(['owner','editor'])"],
  },
  "GET /api/social-accounts/callback/linkedin": {
    middleware: ["validateOAuthState"],
  },
  "POST /api/social-accounts/connect/instagram": {
    middleware: ["requireAuth", "requireRole(['owner','editor'])"],
  },
  "GET /api/social-accounts/callback/instagram": {
    middleware: ["validateOAuthState"],
  },
  "DELETE /api/social-accounts/:id": {
    middleware: ["requireAuth", "requireRole(['owner'])"],
  },
} as const;
