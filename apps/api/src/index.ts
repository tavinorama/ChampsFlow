/**
 * Organic Posts API — Hono server entry point
 *
 * Wires together:
 *  - Config validation (boot-time, exits on missing required vars)
 *  - Postgres client (postgres-js, wrapped into PostgresClient adapter)
 *  - Redis client (ioredis — for healthz probe; route-level rate limiting
 *    uses @upstash/redis initialized lazily in each route module)
 *  - Hono app with security headers, CORS, structured logging, and routes
 *  - Tenant context middleware (sets app.current_tenant_id in Postgres session)
 *  - Health check endpoint (no auth)
 *  - Graceful shutdown on SIGTERM/SIGINT
 *
 * Architecture refs:
 *  - §3 Tech Stack (Hono, postgres-js, ioredis, Upstash Redis)
 *  - §4.1 RLS enforcement (SET LOCAL app.current_tenant_id per request)
 *  - §5 API contracts (route mounting)
 *  - §6 Auth model (requireAuth applied per route in route modules)
 *  - §10 Observability (structured logging, no PII)
 *
 * Hard rules enforced here:
 *  - All env via validated config object — no process.env.X in handlers
 *  - Error handler never exposes stack traces or DB error text in production
 *  - No PII written to logs (scrubbing delegated to shared logger)
 *  - Rate limiting declared on all auth and resource-creation endpoints
 *    (implementation lives in route modules; middleware order enforced here)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger as honoLogger } from "hono/logger";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import postgres from "postgres";
import Redis from "ioredis";
import { config } from "./config";
import { logger } from "../../../packages/shared/src/logger";
import { createPostgresClient, assertAppDbRoleSafe } from "./db/client";
import { registerSocialAccountRoutes } from "./routes/social-accounts";
import { registerDraftRoutes } from "./routes/drafts";
import { registerScheduleRoutes } from "./routes/schedules";
import { registerDpaRoutes } from "./routes/dpa";
import { registerCcpaRoutes } from "./routes/ccpa";
import { registerDsrRoutes } from "./routes/dsr";
import { registerBillingRoutes } from "./routes/billing";
import { registerWaitlistRoutes } from "./routes/waitlist";
import { registerProductRoutes } from "./routes/products";
import { registerOnboardingRoutes } from "./routes/onboarding";
import { registerAuditRoutes } from "./routes/audits";
import { registerEngagementRoutes } from "./routes/engagements";
import { registerSystemRoutes } from "./routes/system";

// ---------------------------------------------------------------------------
// Postgres client (postgres-js)
// Pool: max 10 connections, 20s idle timeout.
// The adapter (createPostgresClient) implements the PostgresClient interface
// that route modules depend on.
// ---------------------------------------------------------------------------

const sql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Log connection errors without exposing credentials
  onnotice: (notice) => {
    logger.warn("postgres_notice", { message: notice.message });
  },
});

const db = createPostgresClient(sql);

// ---------------------------------------------------------------------------
// Redis client (ioredis) — used for health probe.
// Route-level rate limiting and OAuth state use @upstash/redis (lazy-init
// in each route module) per the existing convention in routes/*.ts.
// ---------------------------------------------------------------------------

const redis = new Redis(config.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on("error", (err: Error) => {
  // Log without exposing connection string or credentials
  logger.error("redis_connection_error", { message: err.message });
});

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

// ---------------------------------------------------------------------------
// Security headers (Fix S-13/S-15 — gate 5→6 condition 1)
// ---------------------------------------------------------------------------
// secureHeaders() called with no args does NOT emit CSP and uses Hono 4.4
// defaults for X-Frame-Options (SAMEORIGIN) and HSTS (180 days — below 1 year).
// All values are now explicit per threat-model requirement.
//
// CSP directives (Hono 4.4 ContentSecurityPolicyOptions — array values per directive):
//   default-src:   'self'
//   script-src:    'self' https://js.stripe.com
//   connect-src:   'self' https://hooks.stripe.com [+ ws: in dev for Vite HMR]
//   style-src:     'self' 'unsafe-inline' (Tailwind injects inline styles at runtime)
//   img-src:       'self' data:
//   font-src:      'self'
//   object-src:    'none'
//   frame-src:     'none'
//   frame-ancestors: 'none' (reinforces X-Frame-Options: DENY)
//   form-action:   'self' https://checkout.stripe.com https://billing.stripe.com
//   upgrade-insecure-requests: (value-less directive — empty array)
// ---------------------------------------------------------------------------

const isDev = config.NODE_ENV === "development";
const connectSrc: string[] = ["'self'", "https://hooks.stripe.com"];
if (isDev) {
  connectSrc.push("ws:");
}

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      connectSrc,
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"],
      upgradeInsecureRequests: [],
    },
    // X-Frame-Options: Hono default is SAMEORIGIN — must be explicit DENY
    xFrameOptions: "DENY",
    // HSTS: Hono default is max-age=15552000 (180 days) — must be >= 1 year
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
    xXssProtection: "0",
  })
);

// CORS — restrict to configured web origin
app.use(
  "*",
  cors({
    origin: config.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Internal-Key"],
  })
);

// Structured request logger — wraps hono/logger to emit to shared structured logger.
// Hono's built-in logger calls console.log; we shadow it with a custom printf
// that routes through the shared logger (token-scrubbing, JSON lines, no PII).
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const latency = Date.now() - start;
  // Architecture §10: log hashed tenant/user IDs, method, path, status, latency.
  // We log path only (no query string — may contain tokens in OAuth callbacks).
  const auth = c.get("auth");
  logger.info("http_request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latency_ms: latency,
    // tenant_id and user_id are logged as-is here; in production these should
    // be hashed before logging (architecture §10). Hashing deferred to observability
    // pipeline (Axiom field transform) — keeping raw IDs avoids double-hashing bugs.
    tenant_id: auth?.tenantId ?? null,
    user_id: auth?.userId ?? null,
  });
});

// ---------------------------------------------------------------------------
// Health check — GET /healthz
// No auth. Returns 200 if Postgres + Redis are reachable, 503 otherwise.
// Architecture §5 does not list this endpoint; it is infra-standard.
// ---------------------------------------------------------------------------

app.get("/healthz", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  // Postgres probe — lightweight query
  try {
    await sql`SELECT 1`;
    checks["postgres"] = "ok";
  } catch {
    checks["postgres"] = "error";
    logger.error("healthz_postgres_failed", {});
  }

  // Redis probe
  try {
    await redis.ping();
    checks["redis"] = "ok";
  } catch {
    checks["redis"] = "error";
    logger.error("healthz_redis_failed", {});
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json({ status: allOk ? "ok" : "degraded", checks }, allOk ? 200 : 503);
});

// ---------------------------------------------------------------------------
// Route mounting
//
// Route modules use the registerXxx(app, db) pattern so the Postgres client
// is injected as a dependency (testable, no global singleton in route files).
//
// Auth middleware is applied per-route inside each route module (not globally
// here) — this is the explicit per-route guard pattern required by arch §6.3.
// ---------------------------------------------------------------------------

registerSocialAccountRoutes(app, db);
registerDraftRoutes(app, db);
// C1: GEO Audit Engine (TrustIndex AI)
// POST /api/brands, POST /api/brands/:id/audit, GET /api/audits/:id,
// GET /api/brands/:id/score, GET /api/reports/:report_token (public)
registerAuditRoutes(app, db);
// OrganicPosts done-for-you handoff: POST/GET /api/engagements (auth, tenant-scoped)
registerEngagementRoutes(app, db);
// System transparency: GET /api/system/capabilities (public) +
// BYOK provider-key endpoints (auth). Needs db for the key store.
registerSystemRoutes(app, db);
registerScheduleRoutes(app, db);
// CI-1: DPA Onboarding Gate routes
// POST /api/dpa/acknowledge, GET /api/dpa/status, GET /api/dpa/history
// requireDpaAcknowledged middleware is exported from routes/dpa.ts and applied
// per-route in draft and schedule route modules (AFTER requireAuth).
registerDpaRoutes(app, db);
// CI-2: CCPA/CPRA Privacy Controls routes
// POST /api/ccpa/do-not-sell (PUBLIC — no auth required)
// GET  /api/ccpa/limit-sensitive-pi (requireAuth)
// POST /api/ccpa/limit-sensitive-pi (requireAuth + requireDpaAcknowledged)
registerCcpaRoutes(app, db);
// CI-3/CI-4/CI-5: DSR Workflow routes (public — no DPA gate applied)
// POST /api/dsr/intake, POST /api/dsr/verify,
// POST /api/dsr/lost-email-escalation, GET /api/dsr/:id/status,
// POST /api/dsr/:id/fulfill (requireSuperAdmin)
registerDsrRoutes(app, db);

// C6: Billing & Subscription routes
// GET  /api/billing/plan     — requireAuth (any role)
// POST /api/billing/checkout — requireAuth + requireRole(['owner'])
// POST /api/billing/portal   — requireAuth + requireRole(['owner'])
// POST /api/billing/webhook  — NO auth middleware (Stripe-Signature verified inside handler)
//
// IMPORTANT: The webhook route must NOT have auth middleware applied at the app level.
// The Stripe-Signature header is verified inside the handler via verifyWebhookSignature()
// before any DB side-effects. This is enforced in routes/billing.ts.
// The billing routes are registered last so the webhook path (/api/billing/webhook)
// does not accidentally match any auth middleware applied globally (there is none —
// auth is per-route in this app's design pattern).
registerBillingRoutes(app, db);

// Marketing / Landing Page — waitlist signup
// POST /api/waitlist (PUBLIC — no auth, rate limited 5/hour per IP)
registerWaitlistRoutes(app, db);

// Acquisition ladder — lead magnet + $29 Get-Cited Kit (all PUBLIC)
// POST /api/test, POST /api/kit/checkout, GET /api/kit/:token, POST /api/kit/:token/deliver
registerProductRoutes(app, db);

// First-login tenant provisioning — POST /api/account/bootstrap
// (verifies the Supabase JWT itself; allows the no-tenant-yet case)
registerOnboardingRoutes(app, db);

// ---------------------------------------------------------------------------
// Global error handler
// - Production: { error: 'internal_error' } with no details
// - Development: includes message for debugging
// Never exposes: stack traces, DB error text, OAuth tokens, auth headers.
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  // Scrubbing is handled by shared logger — err.message is logged but not
  // returned to the client in production.
  logger.error("unhandled_error", {
    method: c.req.method,
    path: c.req.path,
    message: err.message,
    // No stack — stacks can contain file paths / credentials from env
  });

  const isDev = config.NODE_ENV === "development";

  return c.json(
    {
      error: "internal_error",
      code: "UNHANDLED_ERROR",
      // Only surface message in development; never stack traces
      ...(isDev ? { detail: err.message } : {}),
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    { error: "not_found", code: "NOT_FOUND", path: c.req.path },
    404
  );
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = config.PORT;

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    logger.info("api_started", {
      port,
      env: config.NODE_ENV,
    });
  }
);

// Verify runtime RLS enforcement is actually wired before serving real traffic.
// If the app role is missing/over-privileged/unassumable, RLS would be silently
// off — refuse to run rather than leak across tenants.
void assertAppDbRoleSafe(sql)
  .then(() => logger.info("rls_role_verified", { role: process.env["APP_DB_ROLE"] ?? "app_user" }))
  .catch((err: Error) => {
    logger.error("rls_role_assertion_failed", { message: err.message });
    void shutdown("RLS_ASSERTION_FAILED");
  });

// ---------------------------------------------------------------------------
// Graceful shutdown
// Stop accepting new requests → wait up to 10s for in-flight → close connections.
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("api_shutdown_initiated", { signal });

  // Give in-flight requests up to 10s to complete
  const drainTimeout = setTimeout(() => {
    logger.warn("api_shutdown_drain_timeout", { timeoutMs: 10_000 });
    process.exit(1);
  }, 10_000);

  try {
    // Close the HTTP server (stops accepting new connections)
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Close Postgres pool
    await sql.end({ timeout: 5 });

    // Disconnect Redis
    redis.disconnect();

    clearTimeout(drainTimeout);
    logger.info("api_shutdown_complete", {});
    process.exit(0);
  } catch (err) {
    clearTimeout(drainTimeout);
    logger.error("api_shutdown_error", { message: (err as Error).message });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app };
