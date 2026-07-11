/**
 * CI-2 — CCPA/CPRA Privacy Controls — API routes
 *
 * Routes:
 *   POST /api/ccpa/do-not-sell        — PUBLIC (no auth). Records opt-out request.
 *   GET  /api/ccpa/limit-sensitive-pi — requireAuth. Returns current toggle state.
 *   POST /api/ccpa/limit-sensitive-pi — requireAuth + requireDpaAcknowledged.
 *                                       Updates users.limit_sensitive_pi.
 *
 * Architecture refs:
 *   docs/03-architecture.md §4, §5
 *   docs/02-prd.md CI-2 acceptance criteria
 *   CI-2 capability spec
 *
 * IP handling (GDPR + CCPA data minimization):
 *   Full IP is NEVER stored. truncateIp() from dpa.ts is reused.
 *
 * Rate limits:
 *   POST /api/ccpa/do-not-sell        — per-IP: 3 submissions/hour (Redis bucket)
 *   POST /api/ccpa/limit-sensitive-pi — per-user: 10 toggles/hour (Redis bucket)
 *
 * Email confirmation:
 *   Resend is called after successful do-not-sell insert. If Resend env vars
 *   are absent, the submission is still recorded and a warning is logged
 *   (email delivery is best-effort; the legal record is primary).
 *
 * Audit log:
 *   event_type='ccpa_request_received' — do-not-sell submit
 *   event_type='ccpa_limit_sensitive_pi_toggled' — limit-pi toggle change
 *
 * Hard rules enforced here:
 *   - tenant_id resolved from JWT only (never from request body)
 *   - No full IP in DB or logs (truncateIp enforced on all write paths)
 *   - Public route: no requireAuth on POST /api/ccpa/do-not-sell
 *   - Toggle defaults FALSE in DB; GET reflects current DB state
 *   - All DB queries parameterized — no string interpolation
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth } from "../auth/middleware";
import { requireDpaAcknowledged, truncateIp } from "./dpa";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";

// ---------------------------------------------------------------------------
// Redis client (shared Railway Redis)
// ---------------------------------------------------------------------------

function getRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Rate limit: per-IP, 3 submissions/hour (sliding window)
// Key: ccpa_dns:<truncated-ip>
// ---------------------------------------------------------------------------

async function checkDoNotSellRateLimit(ipTruncated: string): Promise<boolean> {
  const redis = getRedis();
  const key = `ccpa_dns:${ipTruncated || "unknown"}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const limit = 3;

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
// Rate limit: per-user, 10 toggles/hour (sliding window)
// Key: ccpa_lpi:<userId>
// ---------------------------------------------------------------------------

async function checkLimitPiRateLimit(userId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `ccpa_lpi:${userId}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const limit = 10;

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
// Resend confirmation email (best-effort — failure does not block submission)
// ---------------------------------------------------------------------------

async function sendConfirmationEmail(
  toEmail: string,
  requestType: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS ?? "privacy@ozvor.com";

  if (!apiKey) {
    logger.warn("ccpa_resend_not_configured", {
      message: "RESEND_API_KEY not set — CCPA confirmation email skipped",
    });
    return;
  }

  const requestTypeLabel =
    requestType === "do_not_sell"
      ? "Do Not Sell or Share My Personal Information"
      : "Limit the Use of My Sensitive Personal Information";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject: "We received your privacy request — Organic Posts",
        html: `
          <p>Hello,</p>
          <p>We have received your CCPA/CPRA privacy request:</p>
          <p><strong>${requestTypeLabel}</strong></p>
          <p>We will process your request within 45 days as required by California law.
             You may receive a follow-up email if we need to verify your identity.</p>
          <p>If you did not submit this request, please contact us at privacy@ozvor.com.</p>
          <p>Thank you,<br/>The Organic Posts Privacy Team</p>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn("ccpa_resend_failed", {
        status: res.status,
        // Do not log response body in full — may contain PII in error details
        statusText: res.statusText,
      });
    } else {
      logger.info("ccpa_confirmation_email_sent", {
        // Log delivery without exposing email address (PII)
        requestType,
      });
    }
  } catch (err) {
    logger.warn("ccpa_resend_error", {
      message: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerCcpaRoutes(app: Hono, db: PostgresClient): void {

  // -------------------------------------------------------------------------
  // POST /api/ccpa/do-not-sell
  //
  // PUBLIC route — no requireAuth (CCPA requires no account).
  // Body: { email: string, name?: string, request_type?: string }
  // - request_type defaults to 'do_not_sell' if omitted or invalid
  // - Inserts ccpa_requests row with status='received', tenant_id=NULL
  //   (unauthenticated), or resolved tenant_id if user is authenticated.
  // - Sends Resend confirmation email (best-effort).
  // - Writes audit_log event 'ccpa_request_received' (no full IP).
  // - Per-IP rate limit: 3/hour.
  // -------------------------------------------------------------------------

  app.post("/api/ccpa/do-not-sell", async (ctx: Context) => {
    // Parse + validate body
    let body: { email?: unknown; name?: unknown; request_type?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      ctx.status(400);
      return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" });
    }

    const { email, name, request_type } = body;

    if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
      ctx.status(400);
      return ctx.json({
        error: "A valid email address is required",
        code: "MISSING_EMAIL",
      });
    }

    // Validate request_type — default to 'do_not_sell' if omitted or invalid
    const validRequestTypes = [
      "do_not_sell",
      "limit_sensitive_pi",
      "delete",
      "correct",
      "access",
      "portability",
    ];
    const resolvedRequestType =
      typeof request_type === "string" && validRequestTypes.includes(request_type)
        ? request_type
        : "do_not_sell";

    // Extract and truncate IP (never store full IP — GDPR + CCPA data minimization)
    const rawIp =
      ctx.req.header("cf-connecting-ip") ??
      ctx.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    const ipTruncated = truncateIp(rawIp);

    // Per-IP rate limit (3/hour)
    const allowed = await checkDoNotSellRateLimit(ipTruncated || "unknown");
    if (!allowed) {
      ctx.status(429);
      return ctx.json({
        error: "Too many requests. Please try again in an hour.",
        code: "RATE_LIMITED",
        retry_after: 3600,
      });
    }

    // Check if user is authenticated (optional — tenant_id from JWT if present)
    let tenantId: string | null = null;
    const authHeader = ctx.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      // Best-effort: if auth middleware populated ctx.get('auth'), use it.
      // If the user is not authenticated, auth context is absent — that is fine.
      const auth = ctx.get("auth") as { tenantId?: string } | undefined;
      tenantId = auth?.tenantId ?? null;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName =
      typeof name === "string" && name.trim() ? name.trim() : null;

    // Insert ccpa_requests row
    // tenant_id is NULL for unauthenticated submissions (CCPA requirement)
    await db.query(
      `INSERT INTO ccpa_requests
         (tenant_id, requester_email, requester_name, request_type,
          status, submitter_ip_truncated, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'received', $5, NOW(), NOW())`,
      [
        tenantId ?? null,
        cleanEmail,
        cleanName,
        resolvedRequestType,
        ipTruncated || null,
      ]
    );

    // Audit log (no full IP)
    if (tenantId) {
      await db.setTenantId(tenantId);
      await db.query(
        `INSERT INTO audit_log (tenant_id, event_type, metadata, created_at)
         VALUES ($1, $2, $3::jsonb, NOW())`,
        [
          tenantId,
          "ccpa_request_received",
          jsonbParam({
            request_type: resolvedRequestType,
            ip_truncated: ipTruncated || null,
            // No email in audit log — it's in ccpa_requests row
          }),
        ]
      );
    }

    logger.info("ccpa_request_received", {
      request_type: resolvedRequestType,
      tenant_id: tenantId ?? null,
      ip_truncated: ipTruncated || null,
      // No email in logs
    });

    // Send confirmation email (best-effort — does not block response)
    void sendConfirmationEmail(cleanEmail, resolvedRequestType);

    return ctx.json(
      {
        ok: true,
        message:
          "Your request has been received. You will receive a confirmation email shortly.",
        request_type: resolvedRequestType,
      },
      200
    );
  });

  // -------------------------------------------------------------------------
  // GET /api/ccpa/limit-sensitive-pi
  //
  // requireAuth. Returns the current value of users.limit_sensitive_pi.
  // -------------------------------------------------------------------------

  app.get("/api/ccpa/limit-sensitive-pi", requireAuth, async (ctx: Context) => {
    const auth = ctx.get("auth");

    await db.setTenantId(auth.tenantId);
    const result = await db.query<{
      limit_sensitive_pi: boolean;
      limit_sensitive_pi_set_at: string | null;
    }>(
      `SELECT limit_sensitive_pi, limit_sensitive_pi_set_at
       FROM users
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [auth.userId, auth.tenantId]
    );

    if (result.rows.length === 0) {
      ctx.status(401);
      return ctx.json({ error: "Unauthorized", code: "USER_NOT_FOUND" });
    }

    const { limit_sensitive_pi, limit_sensitive_pi_set_at } = result.rows[0];

    return ctx.json({
      limit_sensitive_pi: limit_sensitive_pi ?? false,
      limit_sensitive_pi_set_at: limit_sensitive_pi_set_at ?? null,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/ccpa/limit-sensitive-pi
  //
  // requireAuth + requireDpaAcknowledged.
  // Body: { enabled: boolean }
  // - Updates users.limit_sensitive_pi and limit_sensitive_pi_set_at.
  // - Writes audit_log 'ccpa_limit_sensitive_pi_toggled' with new value.
  // - Per-user rate limit: 10 toggles/hour.
  // -------------------------------------------------------------------------

  app.post(
    "/api/ccpa/limit-sensitive-pi",
    requireAuth,
    requireDpaAcknowledged(db),
    async (ctx: Context) => {
      const auth = ctx.get("auth");

      // Per-user rate limit
      const allowed = await checkLimitPiRateLimit(auth.userId);
      if (!allowed) {
        ctx.status(429);
        return ctx.json({
          error: "Too many toggle requests. Please try again in an hour.",
          code: "RATE_LIMITED",
          retry_after: 3600,
        });
      }

      // Parse + validate body
      let body: { enabled?: unknown };
      try {
        body = await ctx.req.json();
      } catch {
        ctx.status(400);
        return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" });
      }

      if (typeof body.enabled !== "boolean") {
        ctx.status(400);
        return ctx.json({
          error: "'enabled' must be a boolean",
          code: "INVALID_ENABLED",
        });
      }

      const enabled = body.enabled;

      await db.setTenantId(auth.tenantId);

      // Update users.limit_sensitive_pi + audit timestamp
      const updateResult = await db.query<{ limit_sensitive_pi: boolean }>(
        `UPDATE users
         SET limit_sensitive_pi        = $1,
             limit_sensitive_pi_set_at = NOW(),
             updated_at                = NOW()
         WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
         RETURNING limit_sensitive_pi`,
        [enabled, auth.userId, auth.tenantId]
      );

      if (updateResult.rows.length === 0) {
        ctx.status(401);
        return ctx.json({ error: "Unauthorized", code: "USER_NOT_FOUND" });
      }

      // Audit log
      await db.query(
        `INSERT INTO audit_log (tenant_id, user_id, event_type, metadata, created_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())`,
        [
          auth.tenantId,
          auth.userId,
          "ccpa_limit_sensitive_pi_toggled",
          jsonbParam({ limit_sensitive_pi: enabled }),
        ]
      );

      logger.info("ccpa_limit_sensitive_pi_toggled", {
        userId: auth.userId,
        tenantId: auth.tenantId,
        limit_sensitive_pi: enabled,
      });

      return ctx.json({
        ok: true,
        limit_sensitive_pi: updateResult.rows[0].limit_sensitive_pi,
      });
    }
  );
}
