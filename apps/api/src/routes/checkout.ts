/**
 * checkout.ts — Public checkout-first route
 *
 * Allows marketing CTAs for Growth/Agency plans to go directly to Stripe
 * Checkout without requiring a login first. The account is created/linked
 * AFTER payment via the pending_subscription flow.
 *
 * Route:
 *   POST /api/checkout/direct — NO auth middleware; rate limited 10/hour/IP
 *
 * Architecture refs:
 *   docs/03-architecture.md §5 API contracts (checkout-first capability)
 *   docs/02-prd.md          checkout-first acceptance criteria
 *
 * Hard rules enforced here:
 *   - No auth middleware (public — pre-account buyers)
 *   - Input validated at boundary: plan, interval, email
 *   - Rate limited: 10 requests / hour / IP (sliding-window ZSET, Upstash Redis)
 *   - Stripe not configured → 503 (no crash)
 *   - No PII (email) in any log statement
 *   - All config from environment only
 */

import { Hono } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { createDirectCheckoutSession, getFounderOfferStatus } from "../integrations/stripe";
import type { BillingInterval } from "../integrations/stripe";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { clientIp } from "../lib/client-ip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? process.env["FRONTEND_URL"] ?? "http://localhost:3000";
}

// clientIp imported from ../lib/client-ip (cf-connecting-ip → LAST XFF hop) —
// never the client-forgeable first XFF entry.

// ---------------------------------------------------------------------------
// IP truncation for rate-limit key (GDPR data minimization)
// IPv4: zero last octet. IPv6: keep first 3 groups (first 48 bits).
// ---------------------------------------------------------------------------

function truncateIpForRateLimit(ip: string): string {
  if (!ip) return "unknown";
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.0`;
  const colons = ip.split(":");
  if (colons.length >= 4) return colons.slice(0, 3).join(":") + "::/48";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Lazy Redis singleton for checkout rate limiting
// ---------------------------------------------------------------------------

function getCheckoutRedis(): SharedRedis {
  // Railway Redis (REDIS_URL) via the shared ioredis client. Throws if unset —
  // the caller wraps this in try/catch and fails open.
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Rate limit: 10 direct checkout attempts / hour / IP — fixed window
// Key prefix: checkout_direct_rl:{truncatedIp}
// ---------------------------------------------------------------------------

const CHECKOUT_RATE_LIMIT = 10;
const CHECKOUT_RATE_WINDOW_S = 3600; // 1 hour in seconds (Redis EXPIRE)

async function checkCheckoutRateLimit(ipTruncated: string): Promise<boolean> {
  // Fixed-window limiter on Railway Redis: INCR the per-IP counter and set the
  // TTL on the first hit of the window. ioredis-native; no ZSET/pipeline needed.
  const redis = getCheckoutRedis();
  const key = `checkout_direct_rl:${ipTruncated}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, CHECKOUT_RATE_WINDOW_S);
  }
  return current <= CHECKOUT_RATE_LIMIT;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerCheckoutRoutes(app: Hono, _db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/checkout/direct
  // Public — no auth. Marketing CTAs go here to start Stripe Checkout before
  // account creation.
  //
  // Request body:
  //   { plan: 'growth' | 'agency', interval?: 'month' | 'year', email?: string, founder?: boolean }
  //
  // Response 200: { url: string }     — Stripe checkout URL
  // Response 400: validation error
  // Response 429: rate limited
  // Response 503: Stripe not configured
  // -------------------------------------------------------------------------
  app.post("/api/checkout/direct", async (c) => {
    // -----------------------------------------------------------------------
    // Rate limiting — before parsing body to fail fast on abuse
    // -----------------------------------------------------------------------
    const rawIp = clientIp(c);
    const ipTruncated = rawIp ? truncateIpForRateLimit(rawIp) : "unknown";
    try {
      const allowed = await checkCheckoutRateLimit(ipTruncated);
      if (!allowed) {
        return c.json(
          {
            error: "rate_limited",
            code: "RATE_LIMITED",
            message: "Too many checkout attempts. Try again later.",
          },
          429
        );
      }
    } catch (err) {
      // Fail-open on Redis unavailability — do not block genuine buyers
      logger.warn("checkout_direct_rate_limit_redis_unavailable", {
        error_code: (err as NodeJS.ErrnoException).code ?? 'unknown',
      });
    }

    // -----------------------------------------------------------------------
    // Parse body
    // -----------------------------------------------------------------------
    let body: { plan?: unknown; interval?: unknown; email?: unknown; founder?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "invalid_body", code: "INVALID_BODY", message: "Invalid JSON body." },
        400
      );
    }

    // -----------------------------------------------------------------------
    // Validate — plan
    // -----------------------------------------------------------------------
    const plan = body.plan;
    if (plan !== "growth" && plan !== "agency") {
      return c.json(
        {
          error: "invalid_plan",
          code: "INVALID_PLAN",
          message: "plan must be growth or agency",
        },
        400
      );
    }

    // -----------------------------------------------------------------------
    // Validate — interval (defaults to 'year' if omitted)
    // -----------------------------------------------------------------------
    const rawInterval = body.interval;
    const interval: BillingInterval =
      rawInterval === undefined ? "year" : (rawInterval as BillingInterval);

    if (interval !== "month" && interval !== "year") {
      return c.json(
        {
          error: "invalid_interval",
          code: "INVALID_INTERVAL",
          message: "interval must be month or year",
        },
        400
      );
    }

    // -----------------------------------------------------------------------
    // Validate — email (optional, but validated if provided)
    // -----------------------------------------------------------------------
    const rawEmail = body.email;
    let email: string | undefined;
    if (rawEmail !== undefined && rawEmail !== null && rawEmail !== "") {
      if (typeof rawEmail !== "string" || !EMAIL_RE.test(rawEmail.trim())) {
        return c.json(
          {
            error: "invalid_email",
            code: "INVALID_EMAIL",
            message: "email must be a valid email address",
          },
          400
        );
      }
      email = rawEmail.trim();
    }

    // -----------------------------------------------------------------------
    // Founder discount. Gate on the live offer status — once 100 slots are
    // redeemed, founderStatus.active is false and the coupon is not applied.
    // getFounderOfferStatus() is fail-safe (never throws; returns active=true
    // on any error, preserving the offer during transient outages).
    // Monthly never gets the discount regardless of offer status.
    // -----------------------------------------------------------------------
    const founderStatus = await getFounderOfferStatus();
    const founder = founderStatus.active && interval === "year";

    // -----------------------------------------------------------------------
    // Build URLs
    // -----------------------------------------------------------------------
    const origin = webOrigin();
    // {CHECKOUT_SESSION_ID} is a Stripe-provided template variable — it is
    // replaced by Stripe with the actual session ID on redirect.
    const successUrl = `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/pricing`;

    // -----------------------------------------------------------------------
    // Create Stripe checkout session
    // -----------------------------------------------------------------------
    try {
      const { url } = await createDirectCheckoutSession(
        plan,
        interval,
        founder,
        successUrl,
        cancelUrl,
        email
      );

      logger.info("checkout_direct_session_created", {
        plan_tier: plan,
        billing_interval: interval,
        // NOTE: email intentionally NOT logged — hard rule (PII)
      });

      return c.json({ url }, 200);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;

      if (code === "stripe_not_configured" || code === "missing_price_id") {
        logger.warn("checkout_direct_stripe_unavailable", {
          error_code: code,
          plan_tier: plan,
        });
        return c.json(
          {
            error: "checkout_unavailable",
            code: "CHECKOUT_UNAVAILABLE",
            message:
              "Checkout is temporarily unavailable. Please try again shortly or contact support.",
          },
          503
        );
      }

      // Unexpected error — log and return generic error
      logger.error("checkout_direct_unexpected_error", {
        message: (err as Error).message,
        plan_tier: plan,
      });
      return c.json(
        {
          error: "internal_error",
          code: "CHECKOUT_ERROR",
          message: "An error occurred creating the checkout session.",
        },
        500
      );
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/founder-status
  // Public — no auth. Returns the live founder-offer availability so the
  // marketing pages can display the correct price and urgency signal.
  //
  // Response 200:
  //   { active: boolean, remaining: number, limit: number }
  //
  // Notes:
  //   - `redeemed` is intentionally omitted (social-proof concern; remaining
  //     is sufficient for urgency copy without revealing exact take-up).
  //   - Always returns 200 — never 5xx. Fail-safe: { active: true, remaining: 100, limit: 100 }.
  //   - Stripe cost is absorbed by the 60s Redis cache inside getFounderOfferStatus().
  //   - No PII exposed. No auth required.
  // -------------------------------------------------------------------------
  app.get("/api/founder-status", async (c) => {
    try {
      const status = await getFounderOfferStatus();
      return c.json(
        {
          active: status.active,
          remaining: status.remaining,
          limit: status.limit,
        },
        200
      );
    } catch (err) {
      // getFounderOfferStatus() is documented as fail-safe (never throws),
      // but defensively catch here too so this public endpoint never returns 5xx.
      logger.warn("founder_status_route_unexpected_error", {
        error_code: (err as NodeJS.ErrnoException).code ?? "unknown",
      });
      return c.json({ active: true, remaining: 100, limit: 100 }, 200);
    }
  });
}
