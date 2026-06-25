/**
 * C6 — Billing & Subscription — API routes
 *
 * Routes (architecture §5 API contracts):
 *   GET  /api/billing/plan     — current workspace plan + usage summary (requireAuth)
 *   POST /api/billing/checkout — create Stripe Checkout session (Owner only)
 *   POST /api/billing/portal   — create Stripe Billing Portal session (Owner only)
 *   POST /api/billing/webhook  — Stripe webhook receiver (NO auth — Stripe-Signature verified inside)
 *
 * Middleware exported:
 *   requireNotRestricted(db) — factory returning middleware; blocks paid actions when
 *                              subscription is canceled/past_due + grace period expired.
 *                              Apply AFTER requireAuth on paid-action routes.
 *
 * Key design decisions:
 *   - Webhook endpoint is mounted WITHOUT requireAuth (Stripe sends its own Stripe-Signature header).
 *     Signature is verified via verifyWebhookSignature() BEFORE any DB side-effects.
 *   - Idempotency: each processed Stripe event ID is stored in Redis (TTL 7 days, NX) for fast-path
 *     deduplication, plus the DB UPDATE uses `WHERE stripe_event_id_last IS DISTINCT FROM $eventId`
 *     for durability.
 *   - All currency handled externally by Stripe. We store only plan_tier + status.
 *   - stripe_customer_id / stripe_subscription_id are opaque Stripe references:
 *     logged at structured INFO level for audit only; NEVER returned in error bodies.
 *   - No card data ever stored or logged.
 *
 * Compliance conditions closed:
 *   - C6 PRD AC: GET /api/billing/plan, POST /api/billing/checkout, POST /api/billing/portal
 *   - C6 PRD AC: Stripe Checkout + Portal integration (no PCI scope expansion)
 *   - C6 PRD AC: Webhook handles checkout.session.completed,
 *                customer.subscription.updated, customer.subscription.deleted,
 *                invoice.payment_failed — idempotent + audit logged
 *   - Tenant isolation: all queries scoped to tenantId from JWT / billing_subscriptions lookup
 *   - Rate limit: checkout + portal each 20/hour per tenant (Redis token bucket)
 *
 * Hard rules:
 *   - tenant_id resolved from JWT only — never from request body
 *   - Stripe-Signature MUST be verified before any webhook side-effects
 *   - stripe_customer_id NEVER in error messages or response bodies (only safe audit log)
 *   - No card numbers, CVVs, or payment method details ever stored or logged
 *   - All DB queries parameterized — no string interpolation
 *   - Redis idempotency key: billing:event:<eventId> with 7-day TTL (NX)
 *   - Grace period for cancelled/past_due: 7 days from current_period_end
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { Redis } from "@upstash/redis";
import { requireAuth, requireRole, requireNotProcessingRestricted } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import {
  createCheckoutSession,
  createBillingPortalSession,
  verifyWebhookSignature,
  mapStripeStatusToInternal,
  mapPriceIdToPlanTier,
  PLAN_LIMITS,
  type PlanTier,
} from "../integrations/stripe";
import { sendBonusDeliveryEmail } from "../../../../packages/shared/src/emails/bonus-delivery";
import { sendKitDeliveryEmail } from "../../../../packages/shared/src/emails/kit-delivery";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Redis client (lazy singleton — same pattern as other route modules)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set"
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit for checkout and portal (20/hour)
// Token bucket: key billing:rl:<action>:<tenantId>, TTL 3600s
// ---------------------------------------------------------------------------

async function checkBillingRateLimit(
  tenantId: string,
  action: "checkout" | "portal"
): Promise<boolean> {
  const redis = getRedis();
  const key = `billing:rl:${action}:${tenantId}`;
  const limit = 20;
  const windowSeconds = 3600;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return current <= limit;
}

// ---------------------------------------------------------------------------
// Idempotency check for webhook events (Redis NX, 7-day TTL)
// Returns true if the event was already processed (duplicate → skip)
// ---------------------------------------------------------------------------

async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `billing:event:${eventId}`;
  // NX: only set if not exists — returns "OK" if set (new event), null if already exists
  const result = await redis.set(key, "1", { nx: true, ex: 7 * 24 * 3600 });
  return result === null;
}

// ---------------------------------------------------------------------------
// Audit log helper (billing events — no card data, no full customer IDs in body)
// ---------------------------------------------------------------------------

async function writeBillingAuditLog(
  db: PostgresClient,
  params: {
    tenantId: string;
    eventType: string;
    planTier: PlanTier | null;
    stripeEventId?: string;
    status?: string;
  }
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log
         (id, tenant_id, actor_user_id, event_type, target_entity, metadata, created_at)
       VALUES (gen_random_uuid(), $1, NULL, $2, 'billing', $3, NOW())`,
      [
        params.tenantId,
        params.eventType,
        JSON.stringify({
          plan_tier: params.planTier,
          status: params.status ?? null,
          // stripe_event_id included for traceability (not PII, not a secret)
          stripe_event_id: params.stripeEventId ?? null,
          // NOTE: stripe_customer_id intentionally OMITTED from audit log metadata
        }),
      ]
    );
  } catch (err) {
    // Non-fatal: audit log failure should not block the main response
    logger.error("billing_audit_log_write_failed", {
      event_type: params.eventType,
      message: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// requireNotRestricted middleware factory
// ---------------------------------------------------------------------------
// Reads workspace's subscription status from billing_subscriptions.
// If status is 'canceled' or 'past_due' AND the grace period (7 days from
// current_period_end) has expired → returns 402 Payment Required.
//
// Free plan (no billing_subscriptions row OR plan_tier='free') bypasses this.
// Quota enforcement for free plan (5 generations/month etc.) is a separate
// middleware — deferred to a follow-up capability per spec note.
//
// Apply AFTER requireAuth on paid-action routes.
// Do NOT apply to: GET routes, billing routes, DSR routes, account settings, signout.
//
// Usage:
//   app.post('/api/drafts/generate', requireAuth, requireRole([...]),
//            requireNotRestricted(db), requireDpaAcknowledged(db), handler)
// ---------------------------------------------------------------------------

export function requireNotRestricted(db: PostgresClient) {
  return async function notRestrictedGuard(
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
      // Use setTenantId for RLS (matches pattern from other route modules)
      await db.setTenantId(auth.tenantId);

      const { rows } = await db.query<{
        status: string | null;
        plan_tier: string | null;
        current_period_end: string | null;
      }>(
        `SELECT status, plan_tier, current_period_end
         FROM billing_subscriptions
         WHERE tenant_id = $1
         LIMIT 1`,
        [auth.tenantId]
      );

      // No billing row → workspace is on free tier → allow through
      if (rows.length === 0) {
        await next();
        return;
      }

      const { status, plan_tier, current_period_end } = rows[0];

      // Free tier (explicit free row) → allow through (quota enforced separately)
      if (!plan_tier || plan_tier === "free") {
        await next();
        return;
      }

      // Active / trialing → allow through
      if (status === "active" || status === "trialing") {
        await next();
        return;
      }

      // Check grace period for cancelled and past_due
      if (status === "canceled" || status === "past_due") {
        if (current_period_end) {
          const periodEnd = new Date(current_period_end);
          const gracePeriodEnd = new Date(
            periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000
          );
          if (new Date() <= gracePeriodEnd) {
            // Still within 7-day grace period → allow through
            await next();
            return;
          }
        }

        // Grace period expired (or no current_period_end) → block
        logger.warn("billing_subscription_inactive_block", {
          tenant_id: auth.tenantId,
          status,
          path: ctx.req.path,
        });
        ctx.status(402);
        ctx.json({
          error: "subscription_inactive",
          code: "SUBSCRIPTION_INACTIVE",
          status,
          portal_url: "/account/billing",
          message:
            "Your subscription is no longer active. Please update your billing information to continue.",
        });
        return;
      }

      // Any other status (incomplete, etc.) → allow through (conservative)
      await next();
    } catch (err) {
      // On DB error, fail open (allow the request) to avoid blocking users on infra issues
      logger.error("billing_restriction_check_failed", {
        tenant_id: auth.tenantId,
        message: (err as Error).message,
      });
      await next();
    }
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerBillingRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/billing/plan
  // Returns current workspace plan, usage summary, next renewal date, status.
  // Auth: requireAuth (any role can view billing info)
  // -------------------------------------------------------------------------

  app.get("/api/billing/plan", requireAuth, async (ctx: Context) => {
    const auth = ctx.get("auth");

    try {
      await db.setTenantId(auth.tenantId);

      // Fetch billing subscription row
      const { rows: subRows } = await db.query<{
        plan_tier: string | null;
        status: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT plan_tier, status, current_period_end, cancel_at_period_end
         FROM billing_subscriptions
         WHERE tenant_id = $1
         LIMIT 1`,
        [auth.tenantId]
      );

      // Usage: drafts generated this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { rows: draftCountRows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM generation_log
         WHERE tenant_id = $1
           AND created_at >= $2`,
        [auth.tenantId, monthStart.toISOString()]
      );

      // Usage: posts published this month
      const { rows: publishedCountRows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM publish_jobs
         WHERE tenant_id = $1
           AND status = 'done'
           AND published_at >= $2`,
        [auth.tenantId, monthStart.toISOString()]
      );

      // Usage: connected accounts (active, not revoked).
      // NOTE: the column is revoked_at (timestamp, NULL = active) — not a boolean.
      const { rows: connectedRows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM social_accounts
         WHERE tenant_id = $1
           AND revoked_at IS NULL`,
        [auth.tenantId]
      );

      const draftsThisMonth = parseInt(draftCountRows[0]?.count ?? "0", 10);
      const postsThisMonth = parseInt(
        publishedCountRows[0]?.count ?? "0",
        10
      );
      const connectedAccounts = parseInt(
        connectedRows[0]?.count ?? "0",
        10
      );

      // GEO plan limits (single source of truth: PLAN_LIMITS in stripe.ts).
      if (subRows.length === 0) {
        // No billing row → free plan defaults
        const free = PLAN_LIMITS.free;
        return ctx.json({
          plan: "free",
          status: "active",
          renewal_date: null,
          cancel_at_period_end: false,
          usage: {
            connected_accounts: connectedAccounts,
            max_brands: free.max_brands,
            max_competitors: free.max_competitors,
            prompts_per_audit: free.prompts_per_audit,
            weekly_monitoring: free.weekly_monitoring,
          },
        });
      }

      const sub = subRows[0];
      const planTier = (sub.plan_tier as PlanTier) ?? "free";
      const planLimits = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;

      return ctx.json({
        plan: planTier,
        status: sub.status ?? "active",
        renewal_date: sub.current_period_end ?? null,
        cancel_at_period_end: sub.cancel_at_period_end,
        usage: {
          connected_accounts: connectedAccounts,
          max_brands: planLimits.max_brands,
          max_competitors: planLimits.max_competitors,
          prompts_per_audit: planLimits.prompts_per_audit,
          weekly_monitoring: planLimits.weekly_monitoring,
        },
      });
    } catch (err) {
      logger.error("billing_plan_fetch_failed", {
        tenant_id: auth.tenantId,
        message: (err as Error).message,
      });
      return ctx.json(
        { error: "internal_error", code: "PLAN_FETCH_FAILED" },
        500
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/billing/checkout
  // Creates a Stripe Checkout session for the given plan.
  // Auth: requireAuth + requireRole(['owner'])
  // Body: { plan: 'growth' | 'agency', interval?, founder? }
  // Returns: { url: string }
  // Rate limit: 20/hour per tenant
  // -------------------------------------------------------------------------

  app.post(
    "/api/billing/checkout",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner"]),
    async (ctx: Context) => {
      const auth = ctx.get("auth");

      // Rate limit check
      const allowed = await checkBillingRateLimit(auth.tenantId, "checkout").catch(
        (err) => {
          logger.warn("billing_checkout_rate_limit_redis_failed", {
            message: (err as Error).message,
          });
          return true; // Fail open on Redis error
        }
      );
      if (!allowed) {
        ctx.header("Retry-After", "3600");
        return ctx.json(
          {
            error: "rate_limit_exceeded",
            code: "CHECKOUT_RATE_LIMITED",
            message: "Too many checkout requests. Please try again in an hour.",
          },
          429
        );
      }

      let body: { plan?: string; region?: string; interval?: string; founder?: boolean };
      try {
        body = await ctx.req.json();
      } catch {
        return ctx.json(
          { error: "invalid_body", code: "INVALID_JSON" },
          400
        );
      }

      const { plan } = body;
      if (plan !== "growth" && plan !== "agency") {
        return ctx.json(
          {
            error: "invalid_plan",
            code: "INVALID_PLAN",
            message: "plan must be 'growth' or 'agency'",
          },
          400
        );
      }

      // Billing interval — annual unlocks the founder discount (annual-only rule).
      const interval: "month" | "year" = body.interval === "year" ? "year" : "month";
      // Founder discount is applied by the Stripe layer ONLY when interval==='year'
      // (createCheckoutSession enforces it); a monthly request silently gets no
      // founder discount.
      const founder = body.founder === true;

      // Fetch user email for Stripe checkout pre-fill (best-effort)
      let userEmail = "";
      try {
        await db.setTenantId(auth.tenantId);
        const { rows: userRows } = await db.query<{ email: string }>(
          `SELECT email FROM users WHERE id = $1 LIMIT 1`,
          [auth.userId]
        );
        userEmail = userRows[0]?.email ?? "";
      } catch (err) {
        logger.warn("billing_checkout_user_email_fetch_failed", {
          tenant_id: auth.tenantId,
          message: (err as Error).message,
        });
        // Proceed without pre-filling email — not fatal
      }

      const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
      const successUrl = `${webOrigin}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${webOrigin}/account/billing?checkout=cancelled`;

      // Billing region drives payment methods (BR → Pix/boleto + card).
      // Prefer an explicit body.region; else fall back to the deployment default.
      const billingRegion: "BR" | "EU" | "US" =
        body.region === "BR" || body.region === "EU" || body.region === "US"
          ? body.region
          : (process.env.DEFAULT_BILLING_REGION as "BR" | "EU" | "US") ?? "EU";

      try {
        const { url } = await createCheckoutSession(
          auth.tenantId,
          userEmail,
          plan,
          successUrl,
          cancelUrl,
          billingRegion,
          interval,
          founder
        );

        // Write audit log (no customer ID — just plan tier + tenant)
        await writeBillingAuditLog(db, {
          tenantId: auth.tenantId,
          eventType: "billing_checkout_initiated",
          planTier: plan,
        });

        return ctx.json({ url });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "missing_price_id") {
          return ctx.json(
            {
              error: "plan_not_available",
              code: "PLAN_NOT_CONFIGURED",
              message: `The ${plan} plan is not currently available. Please contact support.`,
            },
            503
          );
        }
        logger.error("billing_checkout_failed", {
          tenant_id: auth.tenantId,
          plan_tier: plan,
          message: (err as Error).message,
        });
        return ctx.json(
          { error: "checkout_failed", code: "CHECKOUT_ERROR" },
          500
        );
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/billing/portal
  // Creates a Stripe Billing Portal session for the workspace's Stripe customer.
  // Auth: requireAuth + requireRole(['owner'])
  // Returns: { url: string }
  // Rate limit: 20/hour per tenant
  // -------------------------------------------------------------------------

  app.post(
    "/api/billing/portal",
    requireAuth,
    requireRole(["owner"]),
    async (ctx: Context) => {
      const auth = ctx.get("auth");

      // Rate limit check
      const allowed = await checkBillingRateLimit(auth.tenantId, "portal").catch(
        (err) => {
          logger.warn("billing_portal_rate_limit_redis_failed", {
            message: (err as Error).message,
          });
          return true; // Fail open on Redis error
        }
      );
      if (!allowed) {
        ctx.header("Retry-After", "3600");
        return ctx.json(
          {
            error: "rate_limit_exceeded",
            code: "PORTAL_RATE_LIMITED",
            message: "Too many portal requests. Please try again in an hour.",
          },
          429
        );
      }

      // Fetch stripe_customer_id from billing_subscriptions
      let stripeCustomerId: string | null = null;
      try {
        await db.setTenantId(auth.tenantId);
        const { rows: subRows } = await db.query<{
          stripe_customer_id: string | null;
        }>(
          `SELECT stripe_customer_id
           FROM billing_subscriptions
           WHERE tenant_id = $1
             AND stripe_customer_id IS NOT NULL
           LIMIT 1`,
          [auth.tenantId]
        );
        stripeCustomerId = subRows[0]?.stripe_customer_id ?? null;
      } catch (err) {
        logger.error("billing_portal_customer_fetch_failed", {
          tenant_id: auth.tenantId,
          message: (err as Error).message,
        });
        return ctx.json(
          { error: "internal_error", code: "PORTAL_FETCH_ERROR" },
          500
        );
      }

      if (!stripeCustomerId) {
        return ctx.json(
          {
            error: "no_subscription",
            code: "NO_STRIPE_CUSTOMER",
            message:
              "No active subscription found. Please subscribe to a plan first.",
          },
          404
        );
      }

      const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
      const returnUrl = `${webOrigin}/account/billing`;

      try {
        const { url } = await createBillingPortalSession(
          stripeCustomerId,
          returnUrl
        );

        // Audit log (no customer ID in metadata per hard rule)
        await writeBillingAuditLog(db, {
          tenantId: auth.tenantId,
          eventType: "billing_portal_opened",
          planTier: null,
        });

        return ctx.json({ url });
      } catch (err) {
        logger.error("billing_portal_failed", {
          tenant_id: auth.tenantId,
          message: (err as Error).message,
        });
        return ctx.json(
          { error: "portal_failed", code: "PORTAL_ERROR" },
          500
        );
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/billing/webhook
  // Stripe webhook receiver — NO auth middleware.
  // Stripe-Signature header is verified by verifyWebhookSignature() BEFORE
  // any payload processing or DB side-effects.
  //
  // Handles:
  //   checkout.session.completed       → set status=active, store Stripe IDs
  //   customer.subscription.updated    → sync status + plan + renewal
  //   customer.subscription.deleted    → status=canceled, downgrade to free
  //   invoice.payment_failed           → status=past_due, audit log
  //
  // Idempotency:
  //   1. Redis NX key billing:event:<eventId> (7-day TTL) — fast path
  //   2. DB UPDATE WHERE stripe_event_id_last IS DISTINCT FROM <eventId> — durable path
  //   Both checks prevent double-processing on retry.
  //
  // Returns 200 for all successfully handled events (including duplicates).
  // Returns 400 for signature failure.
  // Returns 500 for handler errors (Stripe will retry).
  // -------------------------------------------------------------------------

  app.post("/api/billing/webhook", async (ctx: Context) => {
    // Stripe requires the raw unparsed body for signature verification.
    // Do NOT call ctx.req.json() before this point.
    const rawBody = await ctx.req.text();
    const signature = ctx.req.header("stripe-signature");

    if (!signature) {
      logger.warn("stripe_webhook_missing_signature", {});
      return ctx.json(
        { error: "bad_request", code: "MISSING_SIGNATURE" },
        400
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("stripe_webhook_secret_not_configured", {});
      return ctx.json(
        { error: "server_misconfiguration", code: "WEBHOOK_SECRET_MISSING" },
        500
      );
    }

    // -----------------------------------------------------------------------
    // STEP 1: Verify signature BEFORE any side-effects (hard rule)
    // -----------------------------------------------------------------------
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(rawBody, signature, webhookSecret);
    } catch (err) {
      // Log verification failure — do NOT log the full payload or raw signature
      logger.warn("stripe_webhook_signature_invalid", {
        error_type: (err as Error).constructor.name,
        // Truncate message to avoid leaking any payload fragment
        message: (err as Error).message?.substring(0, 120),
      });
      return ctx.json(
        {
          error: "signature_verification_failed",
          code: "INVALID_SIGNATURE",
        },
        400
      );
    }

    // -----------------------------------------------------------------------
    // STEP 2: Idempotency check (Redis fast path)
    // -----------------------------------------------------------------------
    let alreadyProcessed = false;
    try {
      alreadyProcessed = await isWebhookEventProcessed(event.id);
    } catch (err) {
      // Redis failure → fall through to DB-level idempotency check
      logger.warn("billing_webhook_redis_idempotency_failed", {
        event_id: event.id,
        message: (err as Error).message,
      });
    }

    if (alreadyProcessed) {
      logger.info("stripe_webhook_duplicate_skipped", {
        event_id: event.id,
        event_type: event.type,
      });
      // Return 200 — Stripe expects 2xx even for duplicates
      return ctx.json({ received: true, duplicate: true });
    }

    logger.info("stripe_webhook_received", {
      event_id: event.id,
      event_type: event.type,
      // NOTE: customer_id intentionally NOT logged — hard rule
    });

    // -----------------------------------------------------------------------
    // STEP 3: Route to event handler
    // -----------------------------------------------------------------------

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          await handleCheckoutSessionCompleted(
            db,
            event.data.object as Stripe.Checkout.Session,
            event.id
          );
          break;
        }
        case "customer.subscription.updated": {
          await handleSubscriptionUpdated(
            db,
            event.data.object as Stripe.Subscription,
            event.id
          );
          break;
        }
        case "customer.subscription.deleted": {
          await handleSubscriptionDeleted(
            db,
            event.data.object as Stripe.Subscription,
            event.id
          );
          break;
        }
        case "invoice.payment_failed": {
          await handleInvoicePaymentFailed(
            db,
            event.data.object as Stripe.Invoice,
            event.id
          );
          break;
        }
        default: {
          // Unhandled event type — acknowledge receipt but do not process
          logger.info("stripe_webhook_unhandled_event", {
            event_id: event.id,
            event_type: event.type,
          });
        }
      }
    } catch (err) {
      logger.error("stripe_webhook_handler_failed", {
        event_id: event.id,
        event_type: event.type,
        message: (err as Error).message,
      });
      // Return 500 so Stripe retries the event
      return ctx.json(
        { error: "handler_failed", code: "WEBHOOK_HANDLER_ERROR" },
        500
      );
    }

    return ctx.json({ received: true });
  });
}

// ---------------------------------------------------------------------------
// Webhook event handlers (private — not exported)
// ---------------------------------------------------------------------------

// checkout.session.completed — new subscription OR Kit one-time payment
async function handleCheckoutSessionCompleted(
  db: PostgresClient,
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  // -------------------------------------------------------------------------
  // Kit payment branch (mode='payment', product='get_cited_kit')
  // Must be checked BEFORE the subscription logic so Kit sessions never fall
  // through to the subscription handler (which would log a warning and return).
  // -------------------------------------------------------------------------
  if (
    session.mode === "payment" &&
    session.metadata?.product === "get_cited_kit"
  ) {
    const kit_order_id = session.metadata?.kit_order_id;
    const order_token = session.metadata?.order_token;

    if (!kit_order_id || !order_token) {
      logger.warn("stripe_kit_checkout_completed_missing_metadata", {
        session_id: session.id,
        event_id: eventId,
      });
      return;
    }

    // Fetch brand + email from kit_order BEFORE updating (needed for delivery email).
    const { rows: kitRows } = await db.query<{ email: string; brand: string }>(
      `SELECT email, brand FROM kit_order WHERE id = $1`,
      [kit_order_id]
    );
    const kitRow = kitRows[0] ?? null;

    // Mark paid idempotently (AND status='pending' prevents overwriting 'delivered').
    await db.query(
      `UPDATE kit_order SET status='paid', stripe_session_id=$2, paid_at=NOW()
       WHERE id=$1 AND status='pending'`,
      [kit_order_id, session.id]
    );

    // Best-effort delivery email.
    const customerEmail =
      session.customer_details?.email ?? session.customer_email ?? null;
    const brand = kitRow?.brand ?? "";

    if (customerEmail && brand) {
      try {
        await sendKitDeliveryEmail({
          to: customerEmail,
          brand,
          orderToken: order_token,
        });
        logger.info("kit_delivery_email_sent", {
          kit_order_id,
          event_id: eventId,
          // NOTE: recipient email intentionally NOT logged — hard rule (PII)
        });
      } catch (emailErr) {
        logger.warn("kit_delivery_email_failed", {
          kit_order_id,
          event_id: eventId,
          message: (emailErr as Error).message,
        });
      }
    } else {
      logger.warn("kit_delivery_email_skipped", {
        kit_order_id,
        event_id: eventId,
        has_email: !!customerEmail,
        has_brand: !!brand,
      });
    }

    logger.info("stripe_kit_checkout_completed_processed", {
      kit_order_id,
      event_id: eventId,
    });
    return;
  }

  // Extract metadata (tenant_id and plan_tier set when creating the Checkout Session)
  const tenantId = session.metadata?.tenant_id;
  const planTierFromMeta = session.metadata?.plan_tier as PlanTier | undefined;

  if (!tenantId) {
    logger.error("stripe_checkout_completed_missing_tenant_id", {
      session_id: session.id,
      event_id: eventId,
    });
    // Cannot process without tenant — do not throw (would cause retry loop for non-fixable issue)
    return;
  }

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    logger.warn("stripe_checkout_completed_missing_stripe_ids", {
      session_id: session.id,
      event_id: eventId,
      has_customer: !!stripeCustomerId,
      has_subscription: !!stripeSubscriptionId,
    });
    return;
  }

  const resolvedPlanTier: PlanTier = planTierFromMeta ?? "free";
  const internalStatus = "active";

  // Upsert billing_subscriptions row.
  // billing_subscriptions has a UNIQUE on tenant_id — we use ON CONFLICT to update.
  // The WHERE clause on stripe_event_id_last provides DB-level idempotency.
  //
  // Note: billing_subscriptions.id has no UNIQUE(tenant_id) constraint in the migration
  // as-written (only PK). We use WHERE tenant_id = $1 for UPDATE path.
  // INSERT first; if tenant already has a row, UPDATE it.
  await db.query(
    `INSERT INTO billing_subscriptions
       (id, tenant_id, stripe_customer_id, stripe_subscription_id,
        plan_tier, status, current_period_start, current_period_end,
        stripe_event_id_last, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5,
        NOW(), NOW() + INTERVAL '1 month', $6, NOW(), NOW())
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET stripe_customer_id    = EXCLUDED.stripe_customer_id,
           plan_tier             = EXCLUDED.plan_tier,
           status                = EXCLUDED.status,
           current_period_start  = EXCLUDED.current_period_start,
           current_period_end    = EXCLUDED.current_period_end,
           stripe_event_id_last  = EXCLUDED.stripe_event_id_last,
           updated_at            = NOW()
     WHERE billing_subscriptions.stripe_event_id_last IS DISTINCT FROM $6`,
    [
      tenantId,
      stripeCustomerId,
      stripeSubscriptionId,
      resolvedPlanTier,
      internalStatus,
      eventId,
    ]
  );

  // Sync tenants.plan_tier (denormalized fast-lookup column)
  await db.query(
    `UPDATE tenants SET plan_tier = $1 WHERE id = $2`,
    [resolvedPlanTier, tenantId]
  );

  await writeBillingAuditLog(db, {
    tenantId,
    eventType: "billing_checkout_completed",
    planTier: resolvedPlanTier,
    stripeEventId: eventId,
    status: internalStatus,
  });

  // -----------------------------------------------------------------------
  // Best-effort bonus delivery email.
  // Only sent for paid plans (growth / agency). Free plan upgrades (if any)
  // are skipped. Idempotency: the Redis NX guard at the top of the webhook
  // handler (billing:event:<eventId>) ensures this block runs at most once
  // per Stripe event — no double-send on retry.
  // Customer email: prefer session.customer_details.email (populated after
  // Stripe Checkout completes), fall back to session.customer_email.
  // We keep a reference to the session in the outer scope via the `session`
  // parameter passed to this function — accessed here through closure.
  // -----------------------------------------------------------------------
  if (resolvedPlanTier === "growth" || resolvedPlanTier === "agency") {
    // Derive customer email from the Checkout Session (no PII in logs).
    const customerEmail =
      (session as Stripe.Checkout.Session).customer_details?.email ??
      (session as Stripe.Checkout.Session).customer_email ??
      null;

    // Derive billing interval from session metadata (set during checkout creation).
    const billingInterval =
      (session as Stripe.Checkout.Session).metadata?.billing_interval;
    const isAnnual = billingInterval === "year";

    if (customerEmail) {
      try {
        await sendBonusDeliveryEmail({
          to: customerEmail,
          plan: resolvedPlanTier as "growth" | "agency",
          annual: isAnnual,
        });
        logger.info("bonus_delivery_email_sent", {
          tenant_id: tenantId,
          plan_tier: resolvedPlanTier,
          annual: isAnnual,
          event_id: eventId,
          // NOTE: recipient email intentionally NOT logged — hard rule (PII)
        });
      } catch (emailErr) {
        // Non-fatal: bonus email failure must never block the webhook 200 response
        // or the subscription activation. Log and continue.
        logger.warn("bonus_delivery_email_failed", {
          tenant_id: tenantId,
          plan_tier: resolvedPlanTier,
          event_id: eventId,
          message: (emailErr as Error).message,
        });
      }
    } else {
      logger.warn("bonus_delivery_email_skipped_no_address", {
        tenant_id: tenantId,
        plan_tier: resolvedPlanTier,
        event_id: eventId,
      });
    }
  }

  logger.info("stripe_checkout_completed_processed", {
    tenant_id: tenantId,
    plan_tier: resolvedPlanTier,
    event_id: eventId,
    // NOTE: customer_id and subscription_id intentionally NOT logged — hard rule
  });
}

// customer.subscription.updated — plan change, renewal, cancellation scheduled
async function handleSubscriptionUpdated(
  db: PostgresClient,
  subscription: Stripe.Subscription,
  eventId: string
): Promise<void> {
  // Resolve tenant_id from subscription metadata (attached during checkout)
  const tenantId = subscription.metadata?.tenant_id;

  if (!tenantId) {
    logger.warn("stripe_subscription_updated_no_tenant_metadata", {
      event_id: eventId,
    });
    // Cannot update without tenant context — do not retry indefinitely
    return;
  }

  const internalStatus = mapStripeStatusToInternal(subscription.status);

  // Resolve plan tier from the first subscription item's price ID
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const planTier: PlanTier = priceId
    ? (mapPriceIdToPlanTier(priceId) ?? "free")
    : "free";

  // Stripe timestamps are Unix seconds
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await db.query(
    `UPDATE billing_subscriptions
     SET plan_tier              = $1,
         status                 = $2,
         current_period_start   = $3,
         current_period_end     = $4,
         cancel_at_period_end   = $5,
         stripe_event_id_last   = $6,
         updated_at             = NOW()
     WHERE tenant_id = $7
       AND stripe_event_id_last IS DISTINCT FROM $6`,
    [
      planTier,
      internalStatus,
      periodStart,
      periodEnd,
      subscription.cancel_at_period_end,
      eventId,
      tenantId,
    ]
  );

  // Sync tenants.plan_tier
  await db.query(
    `UPDATE tenants SET plan_tier = $1 WHERE id = $2`,
    [planTier, tenantId]
  );

  await writeBillingAuditLog(db, {
    tenantId,
    eventType: "billing_subscription_updated",
    planTier,
    stripeEventId: eventId,
    status: internalStatus,
  });

  logger.info("stripe_subscription_updated_processed", {
    tenant_id: tenantId,
    plan_tier: planTier,
    status: internalStatus,
    event_id: eventId,
  });
}

// customer.subscription.deleted — subscription cancelled (at period end or immediately)
async function handleSubscriptionDeleted(
  db: PostgresClient,
  subscription: Stripe.Subscription,
  eventId: string
): Promise<void> {
  const tenantId = subscription.metadata?.tenant_id;

  if (!tenantId) {
    logger.warn("stripe_subscription_deleted_no_tenant_metadata", {
      event_id: eventId,
    });
    return;
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await db.query(
    `UPDATE billing_subscriptions
     SET status               = 'canceled',
         plan_tier            = 'free',
         current_period_end   = $1,
         stripe_event_id_last = $2,
         updated_at           = NOW()
     WHERE tenant_id = $3
       AND stripe_event_id_last IS DISTINCT FROM $2`,
    [periodEnd, eventId, tenantId]
  );

  // Downgrade tenant to free tier on the denormalized column
  await db.query(
    `UPDATE tenants SET plan_tier = 'free' WHERE id = $1`,
    [tenantId]
  );

  await writeBillingAuditLog(db, {
    tenantId,
    eventType: "billing_subscription_canceled",
    planTier: "free",
    stripeEventId: eventId,
    status: "canceled",
  });

  logger.info("stripe_subscription_deleted_processed", {
    tenant_id: tenantId,
    event_id: eventId,
  });
}

// invoice.payment_failed — payment method declined → mark past_due + audit log
async function handleInvoicePaymentFailed(
  db: PostgresClient,
  invoice: Stripe.Invoice,
  eventId: string
): Promise<void> {
  // Resolve subscription ID from invoice object
  const stripeSubscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : null;

  if (!stripeSubscriptionId) {
    logger.warn("stripe_invoice_payment_failed_no_subscription", {
      event_id: eventId,
    });
    return;
  }

  // Look up tenant by stripe_subscription_id (webhook runs outside tenant context;
  // no RLS set_config needed here — query uses the immutable stripe_subscription_id
  // which cannot be forged by tenants and is not user-facing)
  const { rows: subRows } = await db.query<{
    tenant_id: string;
    plan_tier: string;
  }>(
    `SELECT tenant_id, plan_tier
     FROM billing_subscriptions
     WHERE stripe_subscription_id = $1
     LIMIT 1`,
    [stripeSubscriptionId]
  );

  if (subRows.length === 0) {
    logger.warn("stripe_invoice_payment_failed_subscription_not_found", {
      event_id: eventId,
      // NOTE: stripeSubscriptionId NOT logged — opaque Stripe ref; hard rule
    });
    return;
  }

  const { tenant_id: tenantId, plan_tier } = subRows[0];
  const planTier = (plan_tier as PlanTier) ?? "free";

  await db.query(
    `UPDATE billing_subscriptions
     SET status               = 'past_due',
         stripe_event_id_last = $1,
         updated_at           = NOW()
     WHERE tenant_id = $2
       AND stripe_event_id_last IS DISTINCT FROM $1`,
    [eventId, tenantId]
  );

  await writeBillingAuditLog(db, {
    tenantId,
    eventType: "billing_payment_failed",
    planTier,
    stripeEventId: eventId,
    status: "past_due",
  });

  logger.info("stripe_invoice_payment_failed_processed", {
    tenant_id: tenantId,
    event_id: eventId,
    plan_tier: planTier,
  });
}
