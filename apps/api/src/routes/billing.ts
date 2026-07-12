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
 *   - Idempotency: each SUCCESSFULLY processed Stripe event ID is stored in Redis (TTL 7 days) for
 *     fast-path deduplication, written only after its handler completes without throwing (a failed
 *     handler leaves no marker, so Stripe's retry re-runs it), plus the DB UPDATE uses
 *     `WHERE stripe_event_id_last IS DISTINCT FROM $eventId` for durability.
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
 *   - Redis idempotency key: billing:event:<eventId> with 7-day TTL, set only post-success
 *   - Grace period for cancelled/past_due: 7 days from current_period_end
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth, requireRole, requireNotProcessingRestricted } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
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
import { sendPagesPurchaseEmail } from "../../../../packages/shared/src/emails/pages-purchase";
import { enrollNurture, suppressOnConversion } from "./nurture";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Redis client (lazy singleton — same pattern as other route modules)
// ---------------------------------------------------------------------------

// Rate-limit + webhook idempotency run on Railway Redis (REDIS_URL) via the
// shared ioredis client. Throws if REDIS_URL is unset — callers fail open.
function getRedis(): SharedRedis {
  return getSharedRedis();
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
// Idempotency check for webhook events (Redis, 7-day TTL)
//
// Split into a read-only check + a separate "mark done" write so a handler
// that throws never leaves a false "processed" marker behind. The marker is
// only written AFTER the event's handler completes successfully (see the
// route below) — a failed handler (500 → Stripe retry) must find no marker,
// so the retry re-runs the handler. This is a fast-path optimization only;
// the durable guard is the `stripe_event_id_last IS DISTINCT FROM $eventId`
// UPDATE in each handler, which stays safe to re-run even if two requests
// for the same event race past the (non-atomic) check here.
// ---------------------------------------------------------------------------

/** Returns true if this event ID was already marked processed (duplicate → skip). */
async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `billing:event:${eventId}`;
  const existing = await redis.get(key);
  return existing !== null;
}

/** Marks an event ID as processed. Call ONLY after its handler succeeds. */
async function markWebhookEventProcessed(eventId: string): Promise<void> {
  const redis = getRedis();
  const key = `billing:event:${eventId}`;
  await redis.set(key, "1", { ex: 7 * 24 * 3600 });
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
        jsonbParam({
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
  ): Promise<Response | void> {
    const auth = ctx.get("auth");
    if (!auth) {
      return ctx.json({ error: "Unauthorized", code: "MISSING_AUTH_CONTEXT" }, 401);
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
        return ctx.json({
          error: "subscription_inactive",
          code: "SUBSCRIPTION_INACTIVE",
          status,
          portal_url: "/account/billing",
          message:
            "Your subscription is no longer active. Please update your billing information to continue.",
        }, 402);
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
      //
      // EFFECTIVE plan: a Stripe subscription when one exists; otherwise the
      // tenant's denormalized plan_tier (covers manually granted plans — e.g.
      // the founder account — which the app enforces but Stripe knows nothing
      // about). Previously this endpoint read ONLY billing_subscriptions, so a
      // manually granted tier still displayed as "Free 1/1" even though the
      // limits were already lifted.
      const tenantTierRes = await db.query<{ plan_tier: string | null }>(
        `SELECT plan_tier FROM tenants WHERE id = $1`,
        [auth.tenantId]
      );
      const tenantTier = (tenantTierRes.rows[0]?.plan_tier ?? "free") as PlanTier;

      const sub = subRows[0] ?? null;
      const planTier = ((sub?.plan_tier as PlanTier | undefined) ?? tenantTier) ?? "free";
      const base = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;

      // super_admin (platform operator) is never plan-limited: unlimited brands
      // and competitors (null → UI renders "unlimited") + top-tier audit depth.
      const unlimited = auth.isSuperAdmin === true;
      const agency = PLAN_LIMITS.agency ?? base;

      return ctx.json({
        plan: unlimited && planTier === "free" ? "agency" : planTier,
        status: sub?.status ?? "active",
        renewal_date: sub?.current_period_end ?? null,
        cancel_at_period_end: sub?.cancel_at_period_end ?? false,
        unlimited,
        // False for manually granted plans (tenants.plan_tier with no Stripe
        // subscription — e.g. the founder account): there is no Stripe customer,
        // so the billing-portal button must not be offered.
        managed_by_stripe: sub !== null,
        usage: {
          connected_accounts: connectedAccounts,
          max_brands: unlimited ? null : base.max_brands,
          max_competitors: unlimited ? null : base.max_competitors,
          prompts_per_audit: unlimited ? agency.prompts_per_audit : base.prompts_per_audit,
          weekly_monitoring: unlimited ? true : base.weekly_monitoring,
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

      // Billing interval — ANNUAL is the default (founder rule + better retention);
      // monthly is opt-in only. Annual also unlocks the founder discount.
      const interval: "month" | "year" = body.interval === "month" ? "month" : "year";
      // Founder discount is applied by the Stripe layer ONLY when interval==='year'
      // (createCheckoutSession enforces it); a monthly request silently gets no
      // founder discount.
      const founder = body.founder === true;

      // Fetch user email for Stripe checkout pre-fill (best-effort)
      let userEmail = "";
      try {
        await db.setTenantId(auth.tenantId);
        // auth.userId is the Supabase Auth UID (JWT sub), which maps to
        // public.users.supabase_auth_uid — NOT public.users.id (a separate UUID).
        // Querying by id always returned no row → empty email → Stripe rejected
        // the session ("Invalid email address") → "Unable to start checkout".
        const { rows: userRows } = await db.query<{ email: string }>(
          `SELECT email FROM users WHERE supabase_auth_uid = $1 LIMIT 1`,
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
          {
            error: "checkout_failed",
            code: "CHECKOUT_ERROR",
            message: "We couldn't start checkout. Please try again — if it keeps happening, contact support.",
          },
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
  //   1. Redis key billing:event:<eventId> (7-day TTL) — fast path. Written
  //      ONLY after the handler below completes successfully, so a failed
  //      handler (500 → Stripe retry) leaves no marker and the redelivery
  //      re-runs the handler instead of being silently skipped.
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
      // Return 500 so Stripe retries the event. Do NOT mark the event as
      // processed here — a redelivery must find no marker and re-run the
      // handler (see markWebhookEventProcessed above).
      return ctx.json(
        { error: "handler_failed", code: "WEBHOOK_HANDLER_ERROR" },
        500
      );
    }

    // -----------------------------------------------------------------------
    // STEP 4: Mark processed — ONLY after the handler above succeeded.
    // Best-effort: a Redis failure here must not fail the response (the
    // event WAS processed); the durable per-row DB guard still protects
    // against double-processing on the next redelivery.
    // -----------------------------------------------------------------------
    try {
      await markWebhookEventProcessed(event.id);
    } catch (err) {
      logger.warn("billing_webhook_redis_mark_processed_failed", {
        event_id: event.id,
        message: (err as Error).message,
      });
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

    // Claim immediately when the buyer ALREADY has an account (#218): the
    // bootstrap claim (#166) only runs at first login, so a purchase made
    // after signup would otherwise stay orphaned forever. Same event-driven
    // pattern as the pages_order credit path below. Best-effort + idempotent.
    try {
      const buyerEmail = (
        kitRow?.email ??
        session.customer_details?.email ??
        session.customer_email ??
        ""
      ).toLowerCase().trim();
      if (buyerEmail) {
        const { rows: ownerRows } = await db.query<{ tenant_id: string }>(
          `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
          [buyerEmail]
        );
        const buyerTenantId = ownerRows[0]?.tenant_id ?? null;
        if (buyerTenantId) {
          const { rows: claimed } = await db.query<{ id: string }>(
            `UPDATE kit_order SET claimed_at = NOW(), claimed_by_tenant_id = $2
             WHERE id = $1 AND claimed_at IS NULL
             RETURNING id`,
            [kit_order_id, buyerTenantId]
          );
          if (claimed[0]) {
            logger.info("kit_order_claimed_at_webhook", {
              kit_order_id,
              tenant_id: buyerTenantId,
              event_id: eventId,
              // NOTE: email intentionally NOT logged — hard rule (PII)
            });
          }
        }
      }
    } catch (claimErr) {
      logger.warn("kit_order_webhook_claim_failed", {
        kit_order_id,
        event_id: eventId,
        message: (claimErr as Error).message,
      });
    }

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

    // Best-effort: suppress free_to_kit nurture (they've converted) + enroll in kit_to_dfy.
    // Must not throw — kit delivery is already complete at this point.
    try {
      const kitEmail = session.customer_details?.email ?? session.customer_email ?? "";
      if (kitEmail) {
        await suppressOnConversion(db, kitEmail);
        const kitBrand = brand; // already resolved from kit_order above
        if (kitBrand) {
          await enrollNurture(db, {
            email: kitEmail,
            sequence: "kit_to_dfy",
            brand: kitBrand,
            metadata: { orderId: kit_order_id },
            sourceKitId: kit_order_id,
            delayMs: 2 * 24 * 60 * 60 * 1000, // 2-day delay before first step
          });
        }
      }
    } catch (err) {
      logger.warn("nurture_kit_enroll_failed", {
        kit_order_id,
        event_id: eventId,
        message: (err as Error).message,
      });
      // best-effort: do not block the webhook 200
    }

    logger.info("stripe_kit_checkout_completed_processed", {
      kit_order_id,
      event_id: eventId,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Ozvor Pages branch (mode='payment', product='ozvor_pages_site') — #208 PR-2
  // $99 one-time website purchase. Mark the pages_order paid, then credit
  // tenants.extra_landing_sites for the tenant matching the buyer email; if no
  // account exists yet, leave status='paid' — the bootstrap claim on first
  // login grants the credit (onboarding.ts claimPagesOrders, #166 pattern).
  // ---------------------------------------------------------------------------
  if (
    session.mode === "payment" &&
    session.metadata?.product === "ozvor_pages_site"
  ) {
    const pages_order_id = session.metadata?.pages_order_id;
    if (!pages_order_id) {
      logger.warn("stripe_pages_checkout_completed_missing_metadata", {
        session_id: session.id,
        event_id: eventId,
      });
      return;
    }

    // Mark paid (idempotent: only transitions out of 'pending'; the Redis
    // event-id guard upstream already dedupes webhook replays).
    const { rows: orderRows } = await db.query<{ email: string }>(
      `UPDATE pages_order
       SET status = 'paid', stripe_session_id = $2, paid_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING email`,
      [pages_order_id, session.id]
    );

    // Resolve the buyer email (order row is authoritative; Stripe as fallback
    // for replays where the row already left 'pending').
    let buyerEmail = orderRows[0]?.email ?? "";
    if (!buyerEmail) {
      const { rows: existing } = await db.query<{ email: string; status: string }>(
        `SELECT email, status FROM pages_order WHERE id = $1`,
        [pages_order_id]
      );
      if (!existing[0] || existing[0].status === "credited") {
        // Unknown order or already fully processed — nothing to do.
        logger.info("stripe_pages_checkout_completed_noop", {
          pages_order_id,
          event_id: eventId,
        });
        return;
      }
      buyerEmail = existing[0].email;
    }

    // Credit immediately when the email already maps to a user/tenant.
    const normalizedEmail = buyerEmail.toLowerCase().trim();
    const { rows: userRows } = await db.query<{ tenant_id: string }>(
      `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
      [normalizedEmail]
    );
    const buyerTenantId = userRows[0]?.tenant_id ?? null;

    if (buyerTenantId) {
      // ATOMIC credit (#262 related HIGH): the status transition AND the tenant
      // increment must commit together. Previously they were two separate
      // statements — a crash between them left the order 'credited' but the
      // tenant un-credited, and retry (which selects status='paid') could never
      // re-fire, permanently losing the paid credit. Now one transaction: a
      // crash before commit rolls back BOTH, so a webhook replay re-credits
      // correctly. The status guard still blocks double-credit on replay.
      const credited = await db.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `UPDATE pages_order
             SET status = 'credited', credited_tenant_id = $2, credited_at = NOW()
           WHERE id = $1 AND status = 'paid'
           RETURNING id`,
          [pages_order_id, buyerTenantId]
        );
        if (rows[0]) {
          await tx.query(
            `UPDATE tenants SET extra_landing_sites = extra_landing_sites + 1 WHERE id = $1`,
            [buyerTenantId]
          );
        }
        return rows[0] ?? null;
      });
      if (credited) {
        // Audit log is best-effort and stays OUTSIDE the tx — an audit INSERT
        // failure must never abort (and thus roll back) the money-critical credit.
        await writeBillingAuditLog(db, {
          tenantId: buyerTenantId,
          eventType: "pages_order_credited",
          planTier: null,
          stripeEventId: eventId,
        });
        logger.info("pages_order_credited", {
          pages_order_id,
          tenant_id: buyerTenantId,
          event_id: eventId,
        });
      }
    } else {
      logger.info("pages_order_paid_awaiting_claim", {
        pages_order_id,
        event_id: eventId,
        // NOTE: email intentionally NOT logged — hard rule (PII)
      });
    }

    // Best-effort purchase email (log-in-to-build instructions). Never blocks
    // the webhook 200.
    try {
      await sendPagesPurchaseEmail({ to: buyerEmail });
      logger.info("pages_purchase_email_sent", { pages_order_id, event_id: eventId });
    } catch (err) {
      logger.warn("pages_purchase_email_failed", {
        pages_order_id,
        event_id: eventId,
        message: (err as Error).message,
      });
    }

    return;
  }

  // ---------------------------------------------------------------------------
  // Checkout-first (direct) flow branch
  // Metadata.flow === 'direct' means the buyer paid before creating an account.
  // ---------------------------------------------------------------------------
  const flow = session.metadata?.flow;
  const tenantId = session.metadata?.tenant_id;

  if (flow === "direct") {
    // Only process subscription-mode sessions here (Kit payments exit above).
    if (session.mode !== "subscription") return;
    await handleDirectCheckoutCompleted(db, session, eventId);
    return;
  }

  // Authed flow: tenant_id must be present in metadata
  if (!tenantId) {
    logger.error("stripe_checkout_completed_missing_tenant_id", {
      session_id: session.id,
      event_id: eventId,
    });
    return;
  }

  const planTierFromMeta = session.metadata?.plan_tier as PlanTier | undefined;

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

// Resolve the tenant for a subscription webhook. Prefer the tenant_id stamped
// into subscription metadata (the subscribe-FIRST flow sets it), but FALL BACK
// to the durable stripe_subscription_id → billing_subscriptions lookup.
//
// The checkout-FIRST flow (marketing-CTA purchases via createDirectCheckoutSession)
// never stamps tenant_id into subscription metadata, so without this fallback
// `customer.subscription.updated/deleted` were permanent no-ops for that cohort:
// a customer who cancelled in the Stripe portal stayed `active` / paid FOREVER
// (access without payment). The lookup keys on the immutable, non-user-facing
// stripe_subscription_id — the exact pattern handleInvoicePaymentFailed uses.
async function resolveSubscriptionTenantId(
  db: PostgresClient,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.tenant_id;
  if (fromMetadata) return fromMetadata;

  const { rows } = await db.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM billing_subscriptions
     WHERE stripe_subscription_id = $1
     LIMIT 1`,
    [subscription.id]
  );
  return rows[0]?.tenant_id ?? null;
}

// customer.subscription.updated — plan change, renewal, cancellation scheduled
async function handleSubscriptionUpdated(
  db: PostgresClient,
  subscription: Stripe.Subscription,
  eventId: string
): Promise<void> {
  // Metadata first, then durable stripe_subscription_id lookup (checkout-first
  // subscriptions carry no tenant_id in metadata — see resolveSubscriptionTenantId).
  const tenantId = await resolveSubscriptionTenantId(db, subscription);

  if (!tenantId) {
    logger.warn("stripe_subscription_updated_tenant_unresolved", {
      event_id: eventId,
    });
    // Genuinely unknown subscription (not yet persisted) — do not retry forever.
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
  // Metadata first, then durable stripe_subscription_id lookup — otherwise a
  // checkout-first customer's cancellation never downgrades them (access
  // without payment). See resolveSubscriptionTenantId.
  const tenantId = await resolveSubscriptionTenantId(db, subscription);

  if (!tenantId) {
    logger.warn("stripe_subscription_deleted_tenant_unresolved", {
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

// ---------------------------------------------------------------------------
// handleDirectCheckoutCompleted — checkout-first flow (no pre-existing tenant)
// ---------------------------------------------------------------------------
// Called when checkout.session.completed fires for a session with
// metadata.flow === 'direct' OR when there is no tenant_id in metadata.
//
// Two sub-cases:
//   1. Email already belongs to an existing user → attach subscription directly.
//   2. New buyer → write to pending_subscription; onboarding bootstrap claims
//      it when they verify their email and create an account.
//
// This function intentionally does NOT use db.setTenantId() — it runs as the
// service user (app_user) and the pending_subscription table has a permissive
// RLS policy for that role (see migration 20260627000007).
// ---------------------------------------------------------------------------
async function handleDirectCheckoutCompleted(
  db: PostgresClient,
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  // Extract session fields
  const email = session.customer_details?.email ?? null;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  const planTier = (session.metadata?.plan_tier as PlanTier | undefined) ?? "growth";
  const interval = (session.metadata?.billing_interval ?? "year") as "month" | "year";

  // All three are required to proceed; email is the lookup key for matching
  if (!email || !stripeCustomerId || !stripeSubscriptionId) {
    logger.warn("direct_checkout_completed_missing_fields", {
      session_id: session.id,
      event_id: eventId,
      has_email: !!email,
      has_customer: !!stripeCustomerId,
      has_subscription: !!stripeSubscriptionId,
      // NOTE: email not logged — PII
    });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Look up whether this email already belongs to an existing tenant.
  // No db.setTenantId() needed — webhook runs as service, pending_subscription
  // is pre-tenant and has a permissive RLS policy.
  const { rows: existingRows } = await db.query<{ tenant_id: string }>(
    `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
    [normalizedEmail]
  );

  const existingTenantId = existingRows[0]?.tenant_id ?? null;

  if (existingTenantId) {
    // -----------------------------------------------------------------------
    // Case 1: Known user — attach subscription directly to their tenant.
    // Same INSERT ON CONFLICT as the authed checkout path.
    // -----------------------------------------------------------------------
    const resolvedPlanTier: PlanTier = planTier;
    const internalStatus = "active";

    // Use the interval from metadata to set the correct current_period_end.
    // Stripe fires customer.subscription.updated soon after, which will correct
    // this to the exact Stripe billing anchor date. This initial value ensures the
    // grace-period check has a reasonable value immediately after checkout.
    const periodEndInterval = interval === "month" ? "1 month" : "1 year";

    await db.query(
      `INSERT INTO billing_subscriptions
         (id, tenant_id, stripe_customer_id, stripe_subscription_id,
          plan_tier, status, current_period_start, current_period_end,
          stripe_event_id_last, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5,
          NOW(), NOW() + $7::INTERVAL, $6, NOW(), NOW())
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
        existingTenantId,
        stripeCustomerId,
        stripeSubscriptionId,
        resolvedPlanTier,
        internalStatus,
        eventId,
        periodEndInterval,
      ]
    );

    // Sync tenants.plan_tier (denormalized fast-lookup column)
    await db.query(
      `UPDATE tenants SET plan_tier = $1 WHERE id = $2`,
      [resolvedPlanTier, existingTenantId]
    );

    await writeBillingAuditLog(db, {
      tenantId: existingTenantId,
      eventType: "billing_checkout_completed",
      planTier: resolvedPlanTier,
      stripeEventId: eventId,
      status: internalStatus,
    });

    logger.info("direct_checkout_attached_to_existing_tenant", {
      tenant_id: existingTenantId,
      plan_tier: resolvedPlanTier,
      event_id: eventId,
      // NOTE: email, customer_id, subscription_id intentionally NOT logged — hard rule
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Case 2: New buyer — upsert into pending_subscription.
  // The onboarding bootstrap route claims this on first login when the
  // Supabase-verified email matches pending_subscription.email.
  // -------------------------------------------------------------------------
  await db.query(
    `INSERT INTO pending_subscription
       (email, stripe_customer_id, stripe_subscription_id, plan_tier,
        billing_interval, status, stripe_event_id, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status          = EXCLUDED.status,
           stripe_event_id = EXCLUDED.stripe_event_id,
           updated_at      = NOW()`,
    [
      normalizedEmail,
      stripeCustomerId,
      stripeSubscriptionId,
      planTier,
      interval,
      "active",
      eventId,
    ]
  );

  logger.info("direct_checkout_pending_subscription_created", {
    plan_tier: planTier,
    billing_interval: interval,
    event_id: eventId,
    // NOTE: email, customer_id, subscription_id intentionally NOT logged — hard rule
  });
}
