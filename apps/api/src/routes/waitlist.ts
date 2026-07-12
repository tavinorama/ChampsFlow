/**
 * Waitlist API route
 *
 * Route: POST /api/waitlist
 * Auth:  Public (no auth required)
 *
 * Spec: frontend-coder task for Landing Page capability
 *
 * Request body:
 *   { email: string, opted_in: boolean, name?: string, team_size?: string }
 *
 * Behaviour:
 *  1. Rate limit: 5 attempts per IP per hour (Redis token bucket via sliding window)
 *  2. Validate email format
 *  3. Insert into `waitlist` table (INSERT ... ON CONFLICT DO NOTHING — no leak
 *     of whether email already exists)
 *  4. Send confirmation email via Resend (best-effort — does not block response)
 *  5. Write audit log event `waitlist_signup` (email NOT logged — PII minimization)
 *  6. Return 200 { message: 'Check your email to confirm.' } regardless of
 *     whether email was already in waitlist (no enumeration)
 *
 * Security:
 *  - IP truncated before storage (GDPR data minimization)
 *  - Email is NOT logged in structured logs
 *  - 5/hour rate limit per IP
 *
 * Architecture refs:
 *  - docs/03-architecture.md §5 API contracts (pattern for public endpoints)
 *  - docs/03-architecture.md §10 Observability (no PII in logs)
 *  - packages/db/migrations/20260511000001_waitlist.up.sql
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { truncateIp } from "./dpa";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { sendResendEmail } from "../../../../packages/shared/src/emails/resend-send";
import { clientIp } from "../lib/client-ip";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Redis (shared Railway Redis)
// ---------------------------------------------------------------------------

function getRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Rate limiting — sliding window (same pattern as DSR route)
// ---------------------------------------------------------------------------

async function checkRateLimit(ipTruncated: string): Promise<boolean> {
  const redis = getRedis();
  const key = `waitlist_signup:${ipTruncated || "unknown"}`;
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - RATE_LIMIT_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, 3600);

  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= RATE_LIMIT_REQUESTS;
}

// ---------------------------------------------------------------------------
// Email validation helper (exported for testability)
// ---------------------------------------------------------------------------

export function isValidWaitlistEmail(value: string): boolean {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    value.length <= 320 // RFC 5321 max
  );
}

// ---------------------------------------------------------------------------
// Confirmation email (best-effort via Resend)
// ---------------------------------------------------------------------------

async function sendConfirmationEmail(email: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const fromAddress =
    process.env.EMAIL_FROM ?? "hello@ozvor.com";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're on the Organic Posts waitlist</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">
    You're on the waitlist.
  </h1>
  <p style="font-size: 16px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
    Thank you for joining the Organic Posts waitlist. We are building an AI social
    media tool that drafts your posts and waits for your approval before anything goes live.
  </p>
  <p style="font-size: 16px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
    When early access opens, you will hear from us first — in the order you signed up.
  </p>
  <p style="font-size: 14px; line-height: 1.5; color: #6B7280; margin-bottom: 8px;">
    We email you about Organic Posts only. Unsubscribe at any time by replying "unsubscribe"
    to any email from us.
  </p>
  <p style="font-size: 14px; color: #6B7280;">
    &mdash; The Organic Posts team
  </p>
</body>
</html>`;

  const textBody = [
    "You're on the waitlist.",
    "",
    "Thank you for joining the Organic Posts waitlist. We are building an AI social media tool that drafts your posts and waits for your approval before anything goes live.",
    "",
    "When early access opens, you will hear from us first — in the order you signed up.",
    "",
    "We email you about Organic Posts only. Unsubscribe at any time by replying \"unsubscribe\" to any email from us.",
    "",
    "— The Organic Posts team",
  ].join("\n");

  try {
    await sendResendEmail({
      from: fromAddress,
      to: email,
      subject: "You're on the Organic Posts waitlist",
      text: textBody,
      html: htmlBody,
    });
  } catch (err) {
    // Best-effort: log structured error, do NOT include email (PII)
    logger.error("waitlist_confirmation_email_failed", {
      message: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerWaitlistRoutes(app: Hono, db: PostgresClient): void {
  /**
   * POST /api/waitlist
   *
   * Public endpoint. No auth required.
   * Rate limit: 5/hour per IP.
   *
   * Returns 200 with constant message regardless of duplicate email
   * (no enumeration of waitlist membership).
   */
  app.post("/api/waitlist", async (ctx: Context) => {
    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return ctx.json(
        { error: "Invalid JSON body", code: "INVALID_BODY" },
        400
      );
    }

    const { email, opted_in, name, team_size } = body;

    // Validate email
    if (!isValidWaitlistEmail(email as string)) {
      return ctx.json(
        { error: "Valid email address is required", code: "INVALID_EMAIL" },
        400
      );
    }

    // opted_in must be boolean
    if (typeof opted_in !== "boolean") {
      return ctx.json(
        {
          error: "opted_in must be a boolean value",
          code: "INVALID_OPTED_IN",
        },
        400
      );
    }

    // Sanitize optional fields
    const cleanName =
      typeof name === "string" ? name.slice(0, 200).trim() : null;
    const cleanTeamSize =
      typeof team_size === "string" ? team_size.slice(0, 50).trim() : null;

    // Truncate IP (GDPR data minimization). clientIp = cf-connecting-ip → LAST
    // XFF hop (never the client-forgeable first entry).
    const ipTruncated = truncateIp(clientIp(ctx) ?? "");

    // Rate limit
    let allowed = true;
    try {
      allowed = await checkRateLimit(ipTruncated || "unknown");
    } catch (err) {
      // If Redis is unavailable, fail open (do not block signups)
      logger.warn("waitlist_rate_limit_redis_unavailable", {
        message: (err as Error).message,
      });
    }

    if (!allowed) {
      return ctx.json(
        {
          error: "Too many requests",
          code: "RATE_LIMITED",
          retry_after: 3600,
        },
        429
      );
    }

    const normalizedEmail = (email as string).trim().toLowerCase();

    // Insert — ON CONFLICT DO NOTHING (no error if duplicate)
    // This ensures no enumeration of whether email was already registered.
    try {
      await db.query(
        `INSERT INTO waitlist (email, opted_in, source, ip_truncated)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [
          normalizedEmail,
          opted_in,
          "landing",
          ipTruncated || null,
        ]
      );
    } catch (err) {
      logger.error("waitlist_insert_failed", {
        message: (err as Error).message,
        // No email logged (PII)
      });
      return ctx.json(
        { error: "Something went wrong. Please try again.", code: "DB_ERROR" },
        500
      );
    }

    // Write audit event — email NOT logged (PII minimization per arch §10)
    try {
      await db.query(
        `INSERT INTO audit_log (event_type, actor_user_id, tenant_id, target_entity, metadata, ip_address, created_at)
         VALUES ('waitlist_signup', NULL, NULL, 'waitlist', $1::jsonb, $2, NOW())`,
        [
          jsonbParam({
            opted_in,
            source: "landing",
            name_provided: cleanName !== null,
            team_size: cleanTeamSize,
          }),
          ipTruncated || null,
        ]
      );
    } catch (err) {
      // Non-fatal — audit log failure should not block signup response
      logger.error("waitlist_audit_log_failed", {
        message: (err as Error).message,
      });
    }

    // Send confirmation email (best-effort — does not block response)
    void sendConfirmationEmail(normalizedEmail);

    // Log structured event — no email (PII)
    logger.info("waitlist_signup_received", {
      opted_in,
      source: "landing",
    });

    // Constant response — no indication of whether email was already registered
    return ctx.json(
      { message: "Check your email to confirm." },
      200
    );
  });
}
