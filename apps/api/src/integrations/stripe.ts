/**
 * Stripe integration — C6 Billing
 *
 * Provides:
 *   createCheckoutSession   — Stripe Checkout for subscription mode (no card data in our app)
 *   createBillingPortalSession — Stripe Customer Portal (Stripe-hosted management)
 *   verifyWebhookSignature  — HMAC-SHA256 signature verification for incoming webhooks
 *   mapStripeStatusToInternal — Stripe subscription status → our internal status
 *   mapPriceIdToPlanTier    — Stripe price ID → plan tier ('growth' | 'agency')
 *   getFounderOfferStatus   — live redemption count from Stripe coupon (cached 60s in Redis)
 *
 * Architecture refs:
 *   docs/03-architecture.md §11 (Stripe sub-processor, PCI DSS L1, DPA required before EU launch)
 *   docs/03-architecture.md §7 (Billing data flow: Stripe Checkout; only IDs stored in our DB)
 *   docs/02-prd.md C6 acceptance criteria
 *
 * Hard rules:
 *   - NEVER log Stripe customer IDs in error messages or structured log payloads.
 *     Customer IDs (cus_xxx) are opaque Stripe references that could be used for
 *     impersonation in Stripe's API if leaked.
 *   - NEVER log the full webhook payload — only event type + event ID + sig verification hash.
 *   - NEVER store or log card data — all card handling is Stripe-hosted.
 *   - All config from environment variables only (integration-coder hard rule #1).
 *   - Webhook signature MUST be verified before any payload processing (rule #2).
 *   - All Stripe SDK calls wrapped in try/catch with retryable/permanent error classification (rule #10).
 *
 * Plan tiers (USD; founder confirms price IDs via env vars):
 *   free:   $0/mo            — 1 brand, 1 competitor, 10-prompt snapshot audit, no monitoring
 *   growth: $99/mo or $831/yr — 1 brand, 10 competitors, 250 prompts, weekly monitoring
 *   agency: $549/mo or $4,611/yr — 15 brands, 10 competitors, 250 prompts, weekly monitoring
 *   Founder 30% discount is annual-only (STRIPE_FOUNDER_COUPON_ID). Capped at first 100.
 *
 * Sub-processor status:
 *   Stripe is an approved sub-processor in §11. DPA + SCCs required before EU launch (Gate 7 BLOCKER).
 *   Stripe handles all PCI scope. We store only stripe_customer_id + stripe_subscription_id
 *   (opaque Stripe references) in our DB.
 */

import Stripe from "stripe";
import { tryGetSharedRedis, type SharedRedis } from "../shared-redis";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Configuration — all values from env (integration-coder hard rule #1)
// ---------------------------------------------------------------------------

function getStripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Monthly price IDs (the default billing interval).
  const priceIdGrowth = process.env.STRIPE_PRICE_ID_GROWTH;
  const priceIdAgency = process.env.STRIPE_PRICE_ID_AGENCY;
  // Annual price IDs (one yearly charge). Required to offer the founder discount,
  // which is annual-only.
  const priceIdGrowthAnnual = process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
  const priceIdAgencyAnnual = process.env.STRIPE_PRICE_ID_AGENCY_ANNUAL;
  // Founder discount coupon (a 30%-off Stripe coupon the founder creates). Applied
  // ONLY to annual checkouts — see FOUNDER_DISCOUNT_PERCENT + createCheckoutSession.
  const founderCouponId = process.env.STRIPE_FOUNDER_COUPON_ID;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  return {
    secretKey,
    webhookSecret,
    priceIdGrowth,
    priceIdAgency,
    priceIdGrowthAnnual,
    priceIdAgencyAnnual,
    founderCouponId,
  };
}

// ---------------------------------------------------------------------------
// Founder discount (business rule)
// ---------------------------------------------------------------------------
// Founding members get a 30% discount — but it is applied ONLY when they pay
// annually. On monthly billing the founder discount is never applied. The actual
// percentage lives in the Stripe coupon (STRIPE_FOUNDER_COUPON_ID); this constant
// is the single source of truth the UI/copy and tests reference.
export const FOUNDER_DISCOUNT_PERCENT = 30 as const;

/**
 * Founder-offer kill switch. The 30% annual founder discount is applied while
 * this is active. To DISCONNECT the offer (e.g. once the first-100 cohort is
 * full), set env FOUNDER_DISCOUNT_ACTIVE="false" on the API service — annual
 * checkouts immediately revert to list price (no coupon), no deploy needed.
 * Default: active (so removing the var doesn't silently kill the offer).
 * (Belt-and-suspenders: you can also cap STRIPE_FOUNDER_COUPON_ID's
 * max_redemptions in Stripe — the checkout code falls back to list price if
 * Stripe rejects an exhausted coupon, so it never breaks checkout.)
 */
export function founderDiscountActive(): boolean {
  const v = (process.env.FOUNDER_DISCOUNT_ACTIVE ?? "true").trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "off" && v !== "no";
}

/** Billing interval for a subscription checkout. */
export type BillingInterval = "month" | "year";

// ---------------------------------------------------------------------------
// Lazy Redis singleton for founder-offer status caching (OPTIONAL).
// The cache is a 60s optimisation, NOT a hard dependency. When Upstash isn't
// configured (e.g. the deployment uses Railway Redis via REDIS_URL, not the
// Upstash REST API), this returns null and getFounderOfferStatus() still reads
// the live count from Stripe on every call — just without caching. Previously
// this THREW, which aborted the whole status read and pinned the offer to the
// fail-safe (always "active, 100 left"), silently disabling the auto-retire.
// ---------------------------------------------------------------------------

function tryGetFounderRedis(): SharedRedis | null {
  // Railway Redis (REDIS_URL) via the shared ioredis client. Returns null when
  // Redis isn't configured → the founder status runs cache-less but still live.
  return tryGetSharedRedis();
}

// ---------------------------------------------------------------------------
// FounderOfferStatus — live redemption counter from Stripe, cached 60s
// ---------------------------------------------------------------------------

/** Shape of the founder-offer liveness check. */
export interface FounderOfferStatus {
  /** Whether the offer is currently active and slots remain. */
  active: boolean;
  /** Slots still available (max(0, limit - redeemed)). */
  remaining: number;
  /** Total redemptions recorded by Stripe so far. */
  redeemed: number;
  /** Maximum allowed redemptions (FOUNDER_OFFER_LIMIT env var, default 100). */
  limit: number;
  /**
   * True ONLY when `remaining`/`redeemed` came from a real Stripe read (or its
   * 60s cache). False on every fail-safe path (Stripe unconfigured/unreachable):
   * in that case `remaining` is the full limit as a keep-open default, NOT a
   * verified count — public surfaces must NOT present it as a live number.
   */
  verified: boolean;
}

const FOUNDER_STATUS_CACHE_KEY = "founder_offer_status";
const FOUNDER_STATUS_CACHE_TTL_S = 60; // seconds

/**
 * Returns the live founder-offer status, sourced from the Stripe coupon's
 * `times_redeemed` counter. The result is cached in Upstash Redis for 60s so
 * this is safe to call on every page load.
 *
 * Fail-safe contract: NEVER throws. On any Stripe or Redis error, returns a
 * conservative object that keeps the offer open (consistent with founderDiscountActive()
 * and prevents checkout breakage). Logs a warn instead of re-throwing.
 *
 * Hard rules:
 *   - No PII in any log statement (no email, no customer ID).
 *   - Config from env only (FOUNDER_OFFER_LIMIT, STRIPE_FOUNDER_COUPON_ID).
 */
export async function getFounderOfferStatus(): Promise<FounderOfferStatus> {
  const rawLimit = process.env.FOUNDER_OFFER_LIMIT;
  const parsed = Number(rawLimit);
  const limit = Number.isNaN(parsed) ? 100 : parsed;

  // Fail-safe default — keeps offer open if anything goes wrong. `remaining` is
  // the full limit only as a keep-open default; `verified: false` marks it as an
  // UNVERIFIED count so public surfaces hide the number instead of showing it live.
  const failSafe: FounderOfferStatus = {
    active: founderDiscountActive(),
    remaining: limit,
    redeemed: 0,
    limit,
    verified: false,
  };

  // If Stripe env is not configured, we cannot reach the coupon — return fail-safe
  let founderCouponId: string | undefined;
  try {
    const cfg = getStripeConfig();
    founderCouponId = cfg.founderCouponId;
  } catch {
    // STRIPE_SECRET_KEY not set — no point querying Stripe
    logger.warn("founder_offer_status_stripe_not_configured");
    return failSafe;
  }

  if (!founderCouponId) {
    // Coupon not configured — treat as fail-safe (keeps checkout working)
    logger.warn("founder_offer_status_no_coupon_id");
    return failSafe;
  }

  // --- Cache read (OPTIONAL — only if Upstash is configured) ---
  const redis = tryGetFounderRedis();
  if (redis) {
    try {
      const cached = await redis.get<string>(FOUNDER_STATUS_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as FounderOfferStatus;
        } catch {
          logger.warn("founder_offer_status_cache_parse_error");
        }
      }
    } catch (cacheReadErr) {
      // Cache read failed — not fatal, fall through to the live Stripe read.
      logger.warn("founder_offer_status_cache_read_error", {
        error_code: (cacheReadErr as NodeJS.ErrnoException).code ?? "unknown",
      });
    }
  }

  // --- Live read from Stripe (ALWAYS runs — this is what drives auto-retire) ---
  let status: FounderOfferStatus;
  try {
    const stripe = getStripe();
    const coupon = await stripe.coupons.retrieve(founderCouponId);
    const redeemed = coupon.times_redeemed ?? 0;
    status = {
      active: founderDiscountActive() && coupon.valid !== false && redeemed < limit,
      remaining: Math.max(0, limit - redeemed),
      redeemed,
      limit,
      verified: true,
    };
  } catch (err) {
    // Only a Stripe failure lands here now (not a missing cache) → fail-safe.
    logger.warn("founder_offer_status_fetch_error", {
      error_type: err instanceof Stripe.errors.StripeError ? err.type : "unknown",
      error_code: (err as NodeJS.ErrnoException).code ?? "unknown",
    });
    return failSafe;
  }

  // --- Cache write (best-effort, only if Upstash is configured) ---
  if (redis) {
    try {
      await redis.set(FOUNDER_STATUS_CACHE_KEY, JSON.stringify(status), {
        ex: FOUNDER_STATUS_CACHE_TTL_S,
      });
    } catch (cacheWriteErr) {
      logger.warn("founder_offer_status_cache_write_error", {
        error_code: (cacheWriteErr as NodeJS.ErrnoException).code ?? "unknown",
      });
    }
  }

  return status;
}

// ---------------------------------------------------------------------------
// Stripe SDK client — lazy singleton
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const { secretKey } = getStripeConfig();
  _stripe = new Stripe(secretKey, {
    apiVersion: "2024-06-20",
    // Telemetry off: reduces data sent to Stripe beyond what's needed
    telemetry: false,
  });
  return _stripe;
}

// ---------------------------------------------------------------------------
// Plan tier definitions (v1)
// These limits are enforced by requirePlanLimit middleware in billing.ts.
// ---------------------------------------------------------------------------

// Ozvor plan tiers (brand-package pricing architecture):
//   free     — 1 brand, 3 competitors, 50 prompts, monthly audit
//   growth   — 1 brand, 10 competitors, 250 prompts, weekly monitoring
//   agency   — 15 brands, 10 competitors, 250 prompts, weekly monitoring (multi-client)
export type PlanTier = "free" | "growth" | "agency";

/** Paid tiers that can be purchased via checkout. */
export type PaidPlanTier = "growth" | "agency";

export const PLAN_LIMITS: Record<
  PlanTier,
  {
    max_brands: number;
    max_competitors: number;
    prompts_per_audit: number;
    weekly_monitoring: boolean;
    /** Ozvor Pages (#208): base site allowance per tier. One-time $99 credits
     * (tenants.extra_landing_sites) ADD to this — a free tenant with a
     * purchased credit gets exactly the sites they paid for. */
    max_landing_sites: number;
    /** 5-page deliverable (home + 4) plus one spare slot for a campaign page. */
    max_pages_per_site: number;
    /** Cost-control (#217): how often a MANUAL (non-cron) audit may be
     * re-triggered per brand. 'week' = once every 7 days, 'day' = once every
     * 24h. Scheduled monitoring (triggered_by='cron') is NEVER subject to
     * this — it has its own weekly/daily cadence, unchanged. */
    manual_audit_interval: "week" | "day";
    /** Cost-control (#217): tenant-wide backstop on manual audits in a
     * rolling 24h window (across ALL brands) — bounds brand-delete-and-recreate
     * abuse of the per-brand window above. super_admin bypasses this. */
    audit_backstop_24h: number;
    /** Margin guard: max SCHEDULED (cron/monitor) audits per tenant per calendar
     * month. Each full 250-prompt audit costs ~$5 of platform API (see
     * api_spend). This caps the automatic monitor so a high-brand-count Agency
     * can't run the plan negative. Math: Agency $549/mo, ~$5/audit → 70 audits
     * ≈ $350 API, stays positive (~$180 buffer) AND covers all 15 brands
     * weekly (15 × 4.3 ≈ 65). Growth (1 brand weekly ≈ 4.3) gets 8 for
     * headroom. MANUAL
     * audits the user explicitly triggers are NOT counted here — they have the
     * manual_audit_interval + audit_backstop_24h guards above. Enforced in
     * apps/worker/src/jobs/audit-run.ts (scheduled branch only). */
    monthly_audit_cap: number;
    /** Cost-control (#217): Ozvor Pages REgenerations per site per calendar
     * month (UTC). Free is 0 here — free tenants regenerate against a
     * LIFETIME quota (2 per $99-credit site) enforced separately in
     * routes/landing.ts, not this monthly figure. */
    pages_regens_per_site_month: number;
  }
> = {
  // Free is a deliberate TASTE, not a usable tier: 1 brand, 1 competitor, a
  // shallow 10-prompt audit, no monitoring. Enough to see your standing once —
  // upgrade to Growth for real depth + weekly tracking.
  free: {
    max_brands: 1, max_competitors: 1, prompts_per_audit: 10, weekly_monitoring: false,
    max_landing_sites: 0, max_pages_per_site: 6,
    manual_audit_interval: "week", audit_backstop_24h: 3, monthly_audit_cap: 4, pages_regens_per_site_month: 0,
  },
  growth: {
    max_brands: 1, max_competitors: 10, prompts_per_audit: 250, weekly_monitoring: true,
    max_landing_sites: 1, max_pages_per_site: 6,
    manual_audit_interval: "week", audit_backstop_24h: 5, monthly_audit_cap: 8, pages_regens_per_site_month: 5,
  },
  agency: {
    max_brands: 15, max_competitors: 10, prompts_per_audit: 250, weekly_monitoring: true,
    max_landing_sites: 15, max_pages_per_site: 6,
    manual_audit_interval: "day", audit_backstop_24h: 30, monthly_audit_cap: 70, pages_regens_per_site_month: 5,
  },
};

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session in subscription mode.
// We do NOT collect card data ourselves — Stripe hosts the checkout page.
//
// Parameters:
//   tenantId       — our internal tenant UUID (passed as metadata; opaque to Stripe)
//   userEmail      — pre-fills the checkout form (Stripe uses for receipt email)
//   targetPlanTier — 'growth' | 'agency' (must have corresponding price ID in env)
//   successUrl     — URL to redirect to on successful payment (includes {CHECKOUT_SESSION_ID})
//   cancelUrl      — URL to redirect to if user abandons checkout
//
// Returns:
//   { url: string } — Stripe-hosted checkout URL to redirect the user to
//
// Throws:
//   Error with code 'missing_price_id'   if env var for the plan is not set
//   Error with code 'stripe_api_error'   for Stripe SDK errors (retryable or permanent per HTTP status)
// ---------------------------------------------------------------------------
export async function createCheckoutSession(
  tenantId: string,
  userEmail: string,
  targetPlanTier: PaidPlanTier,
  successUrl: string,
  cancelUrl: string,
  // Region drives payment methods: Brazilian customers get Pix + boleto + card;
  // EU/US get card. Stripe handles currency per the configured Price.
  region: "BR" | "EU" | "US" = "EU",
  // Billing interval. "year" uses the annual price IDs and is the ONLY interval
  // eligible for the founder discount. Annual is the DEFAULT (monthly is opt-in).
  interval: BillingInterval = "year",
  // Whether the buyer is a founding member. The 30% founder discount is applied
  // ONLY when this is true AND interval === "year" (annual-only business rule).
  founder = false
): Promise<{ url: string }> {
  const {
    priceIdGrowth,
    priceIdAgency,
    priceIdGrowthAnnual,
    priceIdAgencyAnnual,
    founderCouponId,
  } = getStripeConfig();

  const priceId =
    interval === "year"
      ? targetPlanTier === "growth"
        ? priceIdGrowthAnnual
        : priceIdAgencyAnnual
      : targetPlanTier === "growth"
        ? priceIdGrowth
        : priceIdAgency;

  // The founder discount is ANNUAL-ONLY. It is applied only when the buyer is a
  // founder, the interval is yearly, AND a coupon is configured, AND the live
  // redemption count is under the cap. getFounderOfferStatus() is fail-safe —
  // it never throws; on any error it returns active=true (keeps offer open).
  const founderStatus = await getFounderOfferStatus();
  const applyFounderDiscount = founder && interval === "year" && Boolean(founderCouponId) && founderStatus.active;

  // Brazilian checkout offers Pix + boleto alongside card; elsewhere card only.
  // (Pix/boleto require the Stripe account to have them enabled + BRL pricing.)
  // Low-friction checkout: let Stripe surface every eligible fast method
  // (card + Apple Pay + Google Pay + Link 1-click, plus Pix/boleto when a BRL
  // price is used) via automatic_payment_methods, instead of a card-only list.
  void region;

  if (!priceId) {
    // Env var missing: this is a configuration error, not a Stripe error.
    // Log without plan tier to avoid leaking pricing config details in prod.
    logger.error("stripe_checkout_missing_price_id", {
      // Note: do NOT log tenantId here — integration rule against customer ID leakage
      plan_tier: targetPlanTier,
    });
    const err = new Error(
      `Stripe price ID for plan '${targetPlanTier}' is not configured`
    );
    (err as NodeJS.ErrnoException).code = "missing_price_id";
    throw err;
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Low-friction: omit payment_method_types so Stripe Checkout shows every
      // method enabled in the Dashboard — card + Apple Pay + Google Pay + Link
      // (1-click). (Checkout has no automatic_payment_methods param; omission IS
      // the dynamic-payment-methods behaviour.)
      // Pre-fill email to reduce checkout friction — ONLY when we actually have
      // one. An empty string makes Stripe reject the session ("Invalid email
      // address"), which surfaced as "Unable to start checkout" for any user
      // whose email couldn't be resolved (e.g. missing public.users row).
      // Omitted → Stripe collects the email on the checkout page.
      ...(userEmail ? { customer_email: userEmail } : {}),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Metadata: opaque tenant reference for webhook reconciliation.
      // We store tenant_id (UUID) — no PII, no card data.
      metadata: {
        tenant_id: tenantId,
        plan_tier: targetPlanTier,
        billing_interval: interval,
        founder_discount: String(applyFounderDiscount),
      },
      // Founder discount (annual-only) is applied as a Stripe coupon. Stripe does
      // NOT allow `discounts` and `allow_promotion_codes` together, so we apply
      // the founder coupon when eligible, otherwise leave promotion codes open.
      ...(applyFounderDiscount
        ? { discounts: [{ coupon: founderCouponId as string }] }
        : { allow_promotion_codes: true }),
      // Subscription data: attach metadata for reconciliation
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          plan_tier: targetPlanTier,
          billing_interval: interval,
        },
      },
    });

    if (!session.url) {
      // Stripe returned a session without a URL — unexpected
      logger.error("stripe_checkout_no_url", {
        session_id: session.id,
        // NOTE: no customer ID logged — hard rule
      });
      throw new Error("Stripe checkout session created but URL is null");
    }

    logger.info("stripe_checkout_session_created", {
      session_id: session.id,
      plan_tier: targetPlanTier,
      // NOTE: tenant_id logged only at INFO level for audit traceability; no customer ID
      tenant_id: tenantId,
    });

    return { url: session.url };
  } catch (err) {
    // Defense-in-depth: if Stripe rejects the coupon (exhausted / invalid) while
    // we tried to apply the founder discount, retry once without it so checkout
    // still completes at list price. The Redis cache will be stale for up to 60s;
    // this handles the edge-case window.
    if (
      err instanceof Stripe.errors.StripeInvalidRequestError &&
      applyFounderDiscount
    ) {
      logger.warn("stripe_checkout_coupon_fallback", {
        plan_tier: targetPlanTier,
      });
      try {
        const stripe = getStripe();
        const sessionRetry = await stripe.checkout.sessions.create({
          mode: "subscription",
          ...(userEmail ? { customer_email: userEmail } : {}),
          line_items: [{ price: priceId!, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            tenant_id: tenantId,
            plan_tier: targetPlanTier,
            billing_interval: interval,
            founder_discount: "false",
          },
          discounts: undefined,
          allow_promotion_codes: true,
          subscription_data: {
            metadata: {
              tenant_id: tenantId,
              plan_tier: targetPlanTier,
              billing_interval: interval,
            },
          },
        });
        if (!sessionRetry.url) {
          throw new Error("Stripe checkout session (retry) has no URL");
        }
        return { url: sessionRetry.url };
      } catch (retryErr) {
        // Retry also failed — fall through to normal error handling below
        logger.error("stripe_checkout_coupon_fallback_failed", {
          error_type:
            retryErr instanceof Stripe.errors.StripeError
              ? retryErr.type
              : "unknown",
          plan_tier: targetPlanTier,
        });
      }
    }

    if (err instanceof Stripe.errors.StripeError) {
      const isRetryable =
        err.statusCode === undefined ||
        err.statusCode >= 500 ||
        err.statusCode === 429;

      logger.error("stripe_checkout_api_error", {
        // Safe fields only — stripe error type + message; no customer ID
        error_type: err.type,
        error_code: err.code ?? "unknown",
        retryable: isRetryable,
        plan_tier: targetPlanTier,
      });

      const wrappedErr = new Error(
        `Stripe checkout error: ${err.type} — ${err.code ?? "unknown"}`
      );
      (wrappedErr as NodeJS.ErrnoException).code = "stripe_api_error";
      throw wrappedErr;
    }
    throw err; // re-throw non-Stripe errors
  }
}

// ---------------------------------------------------------------------------
// createKitCheckoutSession — one-time payment for "The Get-Cited Kit" ($29)
// ---------------------------------------------------------------------------
// Mode "payment" (not subscription). Uses STRIPE_PRICE_ID_KIT (a one-time Price
// the founder creates in Stripe). Metadata carries the kit_order_id + token so
// the webhook / success page can reconcile and unlock the deliverable.
// No account/tenant required — the buyer is a pre-account lead.
export async function createKitCheckoutSession(
  kitOrderId: string,
  orderToken: string,
  buyerEmail: string,
  successUrl: string,
  cancelUrl: string,
  region: "BR" | "EU" | "US" = "US"
): Promise<{ url: string }> {
  const priceId = process.env["STRIPE_PRICE_ID_KIT"];
  if (!priceId) {
    const err = new Error("STRIPE_PRICE_ID_KIT is not configured");
    (err as NodeJS.ErrnoException).code = "missing_price_id";
    throw err;
  }
  // Low-friction checkout: let Stripe surface every eligible fast method
  // (card + Apple Pay + Google Pay + Link 1-click, plus Pix/boleto when a BRL
  // price is used) via automatic_payment_methods, instead of a card-only list.
  void region;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Low-friction: omit payment_method_types → Stripe Checkout shows all
    // Dashboard-enabled methods (card + Apple Pay + Google Pay + Link 1-click).
    customer_email: buyerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    // Opaque references for reconciliation — no PII, no card data.
    metadata: { kit_order_id: kitOrderId, order_token: orderToken, product: "get_cited_kit" },
    payment_intent_data: {
      metadata: { kit_order_id: kitOrderId, order_token: orderToken, product: "get_cited_kit" },
    },
  });
  if (!session.url) {
    logger.error("stripe_kit_checkout_no_url", { session_id: session.id });
    throw new Error("Stripe kit checkout session created but URL is null");
  }
  logger.info("stripe_kit_checkout_created", { session_id: session.id, kit_order_id: kitOrderId });
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// createPagesCheckoutSession — one-time payment for "Ozvor Pages — 5-page
// website" ($99). Issue #208 PR-2.
//
// Mode "payment" (not subscription). Uses STRIPE_PRICE_ID_PAGES (live price
// price_1TrRnOJd5OWcDDzU35opwEAP, product prod_UrA7pxoSdiegPy — created
// 2026-07-09 with founder approval). Metadata carries the pages_order_id so
// the webhook can mark the order paid and credit tenants.extra_landing_sites.
// ---------------------------------------------------------------------------
export async function createPagesCheckoutSession(
  pagesOrderId: string,
  buyerEmail: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  const priceId = process.env["STRIPE_PRICE_ID_PAGES"];
  if (!priceId) {
    const err = new Error("STRIPE_PRICE_ID_PAGES is not configured");
    (err as NodeJS.ErrnoException).code = "missing_price_id";
    throw err;
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Low-friction: omit payment_method_types → Stripe Checkout shows all
    // Dashboard-enabled methods (card + Apple Pay + Google Pay + Link 1-click).
    customer_email: buyerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    // Opaque references for reconciliation — no PII, no card data.
    metadata: { pages_order_id: pagesOrderId, product: "ozvor_pages_site" },
    payment_intent_data: {
      metadata: { pages_order_id: pagesOrderId, product: "ozvor_pages_site" },
    },
  });
  if (!session.url) {
    logger.error("stripe_pages_checkout_no_url", { session_id: session.id });
    throw new Error("Stripe pages checkout session created but URL is null");
  }
  logger.info("stripe_pages_checkout_created", {
    session_id: session.id,
    pages_order_id: pagesOrderId,
  });
  return { url: session.url };
}

export type KitSessionRejectReason =
  | "not_paid"
  | "wrong_mode"
  | "wrong_product"
  | "order_mismatch"
  | "token_mismatch"
  | "price_mismatch"
  | "price_unconfigured"
  | "retrieve_error";

export interface KitSessionVerification {
  ok: boolean;
  reason?: KitSessionRejectReason;
}

/** Minimal shape of the fields we validate — keeps evaluateKitSession pure. */
export interface KitSessionShape {
  payment_status?: string | null;
  mode?: string | null;
  metadata?: Record<string, string> | null;
  line_items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
}

/**
 * PURE binding check (no network) — a paid Checkout Session only unlocks the
 * order it was created for. The synchronous /kit/:token/deliver path lets the
 * CALLER supply session_id, so `payment_status === "paid"` alone is exploitable:
 * a buyer could replay one paid session against another Kit order and get it
 * free. We require the session's own metadata (set at creation in
 * createKitCheckoutSession) to name THIS order + token + product, and the line
 * item to be the configured Kit price. Exported for unit testing.
 */
export function evaluateKitSession(
  session: KitSessionShape,
  bind: { orderId: string; orderToken: string },
  expectedPriceId?: string | null
): KitSessionVerification {
  if (session.payment_status !== "paid") return { ok: false, reason: "not_paid" };
  if (session.mode !== "payment") return { ok: false, reason: "wrong_mode" };
  const md = session.metadata ?? {};
  if (md["product"] !== "get_cited_kit") return { ok: false, reason: "wrong_product" };
  if (md["kit_order_id"] !== bind.orderId) return { ok: false, reason: "order_mismatch" };
  if (md["order_token"] !== bind.orderToken) return { ok: false, reason: "token_mismatch" };
  // Price binding is MANDATORY (Hermes #263): validating only `if (expectedPriceId)`
  // was fail-OPEN — an unset STRIPE_PRICE_ID_KIT would skip the price check and let
  // a cheap unrelated paid session unlock a Kit. A missing configured price is a
  // misconfiguration → reject (fail-closed), never accept blindly.
  if (!expectedPriceId) return { ok: false, reason: "price_unconfigured" };
  const ids = (session.line_items?.data ?? [])
    .map((li) => li?.price?.id)
    .filter((x): x is string => Boolean(x));
  if (ids.length !== 1 || ids[0] !== expectedPriceId) return { ok: false, reason: "price_mismatch" };
  return { ok: true };
}

/**
 * Retrieve a Checkout Session and verify it is a PAID Get-Cited Kit purchase
 * BOUND to this order + token. Replaces the old payment_status-only check used
 * by the Kit delivery page (which allowed cross-order session replay).
 */
export async function verifyKitCheckoutSession(
  sessionId: string,
  bind: { orderId: string; orderToken: string }
): Promise<KitSessionVerification> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    return evaluateKitSession(
      session as unknown as KitSessionShape,
      bind,
      process.env["STRIPE_PRICE_ID_KIT"] ?? null
    );
  } catch (err) {
    logger.error("stripe_kit_session_verify_error", {
      error_type: err instanceof Stripe.errors.StripeError ? err.type : "unknown",
    });
    return { ok: false, reason: "retrieve_error" };
  }
}

// ---------------------------------------------------------------------------
// retrieveDisputeCharge
// ---------------------------------------------------------------------------
// Fetches the Charge behind a charge.dispute.created event. The Dispute object
// carries neither product metadata nor the customer, so the webhook needs the
// charge to know WHAT to revoke (Kit / Pages order via metadata, subscription
// via customer). Throws on Stripe failure — the webhook returns 500 and Stripe
// redelivers; a revocation must never be silently skipped.
// ---------------------------------------------------------------------------
export async function retrieveDisputeCharge(chargeId: string): Promise<Stripe.Charge> {
  try {
    const stripe = getStripe();
    return await stripe.charges.retrieve(chargeId);
  } catch (err) {
    logger.error("stripe_dispute_charge_retrieve_error", {
      error_type: err instanceof Stripe.errors.StripeError ? err.type : "unknown",
      error_code: (err as NodeJS.ErrnoException).code ?? "unknown",
      // NOTE: charge id / customer id intentionally NOT logged — hard rule
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// createBillingPortalSession
// ---------------------------------------------------------------------------
// Opens a Stripe Customer Portal session for an existing subscriber.
// The portal is Stripe-hosted — it handles upgrades, downgrades, cancellation,
// invoice history, and payment method updates. We never touch card data.
//
// Parameters:
//   stripeCustomerId — cus_xxxxx from billing_subscriptions (never logged in errors)
//   returnUrl        — URL to redirect to when the user exits the portal
//
// Returns:
//   { url: string } — Stripe-hosted portal URL to redirect the user to
//
// Throws:
//   Error with code 'stripe_api_error' on SDK errors
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Retention discount — the save-offer in the cancellation flow
// ---------------------------------------------------------------------------

// Founder decision 2026-07-17: 30% off the next 3 MONTHLY invoices, then back
// to list price. Offered once per subscription (already-discounted subs are
// refused) and ONLY to monthly billing — a "3 months" coupon on an annual
// subscription would expire before the next invoice and deliver nothing.
// STRIPE_RETENTION_COUPON_ID overrides the coupon id if ever needed.
const RETENTION_COUPON_ID = process.env.STRIPE_RETENTION_COUPON_ID ?? "RETENTION30";

/**
 * Provision the retention coupon (30% / repeating / 3 months) if it doesn't
 * exist. Idempotent (fixed id; a concurrent create loses harmlessly with
 * resource_already_exists). Called from the API BOOT path — the controlled
 * provisioning route (Hermes review #357 blocker 3) — with the request-time
 * call in applyRetentionDiscount kept only as a self-healing fallback.
 */
export async function ensureRetentionCoupon(): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.coupons.retrieve(RETENTION_COUPON_ID);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === "resource_missing") {
      try {
        await stripe.coupons.create({
          id: RETENTION_COUPON_ID,
          percent_off: 30,
          duration: "repeating",
          duration_in_months: 3,
          name: "Retention 30% — 3 months",
        });
        logger.info("stripe_retention_coupon_provisioned", { coupon: RETENTION_COUPON_ID });
      } catch (createErr) {
        if (
          !(createErr instanceof Stripe.errors.StripeError) ||
          createErr.code !== "resource_already_exists"
        ) {
          throw createErr;
        }
      }
    } else {
      throw err;
    }
  }
}

export async function applyRetentionDiscount(
  stripeSubscriptionId: string
): Promise<{ applied: boolean; reason?: "already_discounted" | "not_monthly" }> {
  const stripe = getStripe();

  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  // Monthly-only (Hermes review #357 blocker 2): the coupon lasts 3 months, so
  // on annual billing it would expire before the next invoice — a hollow
  // offer. Refuse; the UI falls back to the book-a-call save-offer.
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
  if (interval !== "month") return { applied: false, reason: "not_monthly" };

  // One offer per subscription: refuse when ANY discount is already attached
  // (retention already used, founder coupon, promo code…). Prevents
  // cancel→discount farming. Concurrency is handled by the caller's Redis
  // claim + the idempotency key below.
  const hasDiscount =
    (Array.isArray(sub.discounts) && sub.discounts.length > 0) ||
    // older API shape
    (sub as unknown as { discount?: unknown }).discount != null;
  if (hasDiscount) return { applied: false, reason: "already_discounted" };

  // Self-healing fallback only — primary provisioning happens at API boot.
  await ensureRetentionCoupon();

  // Fixed idempotency key per subscription: a concurrent duplicate replays the
  // same Stripe response instead of producing a second mutation (Hermes review
  // #357 blocker 1; outcome is a single RETENTION30 discount either way).
  await stripe.subscriptions.update(
    stripeSubscriptionId,
    { discounts: [{ coupon: RETENTION_COUPON_ID }] },
    { idempotencyKey: `retention30-apply-${stripeSubscriptionId}` }
  );
  logger.info("stripe_retention_discount_applied", {
    // subscription id only — no customer id (hard rule)
    subscription_id: stripeSubscriptionId,
  });
  return { applied: true };
}

export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
  // Optional portal deep-link. "payment_method_update" lands the customer
  // directly on the update-card screen (the "atualizar dados de pagamento"
  // path) instead of the generic portal home. Card data itself is only ever
  // entered on Stripe's page — never touches our surfaces.
  flowType?: "payment_method_update"
): Promise<{ url: string }> {
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
      ...(flowType ? { flow_data: { type: flowType } } : {}),
    });

    logger.info("stripe_portal_session_created", {
      session_id: session.id,
      // NOTE: stripeCustomerId intentionally NOT logged — hard rule
    });

    return { url: session.url };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      const isRetryable =
        err.statusCode === undefined ||
        err.statusCode >= 500 ||
        err.statusCode === 429;

      logger.error("stripe_portal_api_error", {
        // Safe fields only — no customer ID in error log
        error_type: err.type,
        error_code: err.code ?? "unknown",
        retryable: isRetryable,
      });

      const wrappedErr = new Error(
        `Stripe portal error: ${err.type} — ${err.code ?? "unknown"}`
      );
      (wrappedErr as NodeJS.ErrnoException).code = "stripe_api_error";
      throw wrappedErr;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// cancelSubscriptionAtPeriodEnd — schedule a subscription to end at period end
// ---------------------------------------------------------------------------
// Consumer-friendly cancellation: the customer keeps the access they already
// paid for until the current period ends, then it does not renew. This is the
// behavior our billing-portal config also uses (mode: at_period_end).
//
// `feedback` maps to Stripe's cancellation_details.feedback enum (survey
// reason); `comment` is the optional free-text. Both are stored on the Stripe
// subscription so the reason is queryable without a local table.
//
// NEVER adds artificial delay or blocks the cancel — the in-app retention flow
// (survey + save-offer) is entirely skippable; this call always cancels when
// reached (FTC click-to-cancel / EU dark-pattern / BR CDC compliant).
// ---------------------------------------------------------------------------

export type StripeCancellationFeedback =
  | "customer_service"
  | "low_quality"
  | "missing_features"
  | "other"
  | "switched_service"
  | "too_complex"
  | "too_expensive"
  | "unused";

export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string,
  feedback?: StripeCancellationFeedback,
  comment?: string
): Promise<{ cancel_at_period_end: boolean; current_period_end: number | null }> {
  try {
    const stripe = getStripe();
    const details: Stripe.SubscriptionUpdateParams.CancellationDetails = {};
    if (feedback) details.feedback = feedback;
    if (comment && comment.trim()) details.comment = comment.trim().slice(0, 500);

    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      ...(Object.keys(details).length > 0 ? { cancellation_details: details } : {}),
    });

    // Stripe moved current_period_end onto the subscription item in newer API
    // versions; fall back across both shapes so the return is stable. Both are
    // read through an unknown cast since the SDK types expose only one shape.
    const subAny = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const periodEnd =
      subAny.current_period_end ?? subAny.items?.data?.[0]?.current_period_end ?? null;

    logger.info("stripe_subscription_cancel_scheduled", {
      // No customer/sub id in logs beyond the opaque sub id already scoped here.
      cancel_at_period_end: sub.cancel_at_period_end,
    });

    return {
      cancel_at_period_end: sub.cancel_at_period_end ?? true,
      current_period_end: periodEnd,
    };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      logger.error("stripe_subscription_cancel_api_error", {
        error_type: err.type,
        error_code: err.code ?? "unknown",
      });
      const wrapped = new Error(
        `Stripe cancel error: ${err.type} — ${err.code ?? "unknown"}`
      );
      (wrapped as NodeJS.ErrnoException).code = "stripe_api_error";
      throw wrapped;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// retrieveCustomerEmail — resolve a Stripe customer's email (deliverables fix)
// ---------------------------------------------------------------------------
// The bonus/deliverables email used only session.customer_details.email ??
// session.customer_email. In some completed-checkout shapes (observed with a
// 100%-off subscription), BOTH are null on the webhook's session object, so the
// email was silently SKIPPED and no paying customer got their deliverables.
// The customer object still carries the email — this is the fallback.
// Best-effort: returns null (never throws) so it can't break the webhook.
// ---------------------------------------------------------------------------
export async function retrieveCustomerEmail(
  customer: string | { id?: string } | null | undefined
): Promise<string | null> {
  const customerId = typeof customer === "string" ? customer : customer?.id;
  if (!customerId) return null;
  try {
    const stripe = getStripe();
    const c = await stripe.customers.retrieve(customerId);
    if ((c as Stripe.DeletedCustomer).deleted) return null;
    return (c as Stripe.Customer).email ?? null;
  } catch (err) {
    logger.warn("stripe_customer_email_lookup_failed", {
      error_code: (err as NodeJS.ErrnoException).code ?? "unknown",
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// verifyWebhookSignature
// ---------------------------------------------------------------------------
// Verifies the Stripe-Signature header using HMAC-SHA256.
// MUST be called before processing any webhook payload.
//
// Uses stripe.webhooks.constructEvent which:
//   1. Verifies the signature using the webhook signing secret
//   2. Checks the timestamp is within the default tolerance (300s)
//   3. Returns a fully typed Stripe.Event object
//
// Parameters:
//   rawBody   — raw request body as Buffer or string (must be unparsed)
//   signature — value of the 'stripe-signature' header
//   secret    — STRIPE_WEBHOOK_SECRET env var (passed in to allow testing)
//
// Returns:
//   Stripe.Event — verified event object
//
// Throws:
//   Stripe.errors.StripeSignatureVerificationError if signature invalid
//   (caller should return 400 and NOT process the event)
//
// Logging:
//   NEVER log the full payload. Log only: event type + event ID + sig verification result.
//   Never log stripeCustomerId from the event object.
// ---------------------------------------------------------------------------
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  const stripe = getStripe();
  // constructEvent throws StripeSignatureVerificationError on failure
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ---------------------------------------------------------------------------
// mapStripeStatusToInternal
// ---------------------------------------------------------------------------
// Maps Stripe subscription statuses to our internal status CHECK constraint.
// Stripe statuses not in our set default to 'incomplete' (safe conservative value).
//
// Stripe subscription statuses:
//   active, past_due, unpaid, canceled, incomplete, incomplete_expired, trialing, paused
//
// Our internal set: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing'
// ---------------------------------------------------------------------------
export function mapStripeStatusToInternal(
  stripeStatus: Stripe.Subscription.Status
): "active" | "past_due" | "canceled" | "incomplete" | "trialing" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "trialing":
      return "trialing";
    case "incomplete":
      // Genuinely pending its FIRST payment — no paid plan_tier granted yet, so
      // the restriction gate's permissive branch is harmless here.
      return "incomplete";
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      // TERMINAL non-paying states (first payment never completed / expired, or
      // dunning exhausted, or paused). These must LOSE paid access. Map to
      // "canceled" so requireNotRestricted blocks them after the 7-day grace —
      // previously they collapsed to "incomplete" and kept full paid access for
      // $0 (access-without-payment leak).
      return "canceled";
    default:
      return "incomplete";
  }
}

// ---------------------------------------------------------------------------
// createDirectCheckoutSession
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session in subscription mode for the checkout-first
// flow — the buyer pays BEFORE creating an account. No tenant_id in metadata;
// the webhook handler writes to `pending_subscription` and the onboarding
// bootstrap claims it on first login.
//
// Parameters:
//   plan          — 'growth' | 'agency' (must have corresponding price ID in env)
//   interval      — billing interval ('month' | 'year'). Annual is the default.
//   founder       — apply the 30% founder coupon (annual-only, same rule as authed path)
//   successUrl    — URL to redirect to on successful payment (include {CHECKOUT_SESSION_ID})
//   cancelUrl     — URL to redirect to if user abandons checkout
//   email         — optional; pre-fills the Stripe checkout form if provided
//
// Returns:
//   { url: string } — Stripe-hosted checkout URL to redirect the user to
//
// Throws:
//   Error with code 'stripe_not_configured' if STRIPE_SECRET_KEY is missing
//   Error with code 'missing_price_id'      if env var for the plan is not set
//   Error with code 'stripe_api_error'      for Stripe SDK errors
// ---------------------------------------------------------------------------
export async function createDirectCheckoutSession(
  plan: "growth" | "agency",
  interval: BillingInterval,
  founder: boolean,
  successUrl: string,
  cancelUrl: string,
  email?: string
): Promise<{ url: string }> {
  try {
    const {
      priceIdGrowth,
      priceIdAgency,
      priceIdGrowthAnnual,
      priceIdAgencyAnnual,
      founderCouponId,
    } = getStripeConfig();

    const priceId =
      interval === "year"
        ? plan === "growth"
          ? priceIdGrowthAnnual
          : priceIdAgencyAnnual
        : plan === "growth"
          ? priceIdGrowth
          : priceIdAgency;

    // Founder discount is ANNUAL-ONLY — identical rule to the authed path.
    // Use live offer status (cached 60s) so the coupon stops applying once the
    // first-100 cap is hit. getFounderOfferStatus() is fail-safe — never throws.
    const founderStatus = await getFounderOfferStatus();
    const applyFounderDiscount = founder && interval === "year" && Boolean(founderCouponId) && founderStatus.active;

    if (!priceId) {
      logger.error("stripe_direct_checkout_missing_price_id", {
        plan_tier: plan,
        billing_interval: interval,
      });
      const err = new Error(
        `Stripe price ID for plan '${plan}' (interval: ${interval}) is not configured`
      );
      (err as NodeJS.ErrnoException).code = "missing_price_id";
      throw err;
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        // Pre-fill email if provided (reduces checkout friction for buyers arriving
        // from a CTA that already knows their email). Stripe collects + verifies
        // the email during checkout; we read it back from session.customer_details.email
        // in the webhook — we never trust the client-supplied value for entitlement.
        ...(email ? { customer_email: email } : {}),
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        // flow='direct' marks this as a checkout-first session (no tenant_id).
        // The webhook handler checks this flag to branch to handleDirectCheckoutCompleted.
        metadata: {
          plan_tier: plan,
          billing_interval: interval,
          founder_discount: String(applyFounderDiscount),
          flow: "direct",
        },
        ...(applyFounderDiscount
          ? { discounts: [{ coupon: founderCouponId as string }] }
          : { allow_promotion_codes: true }),
        subscription_data: {
          metadata: {
            plan_tier: plan,
            billing_interval: interval,
            flow: "direct",
            // NOTE: no tenant_id — buyer has no account yet
          },
        },
      });

      if (!session.url) {
        logger.error("stripe_direct_checkout_no_url", {
          session_id: session.id,
          // NOTE: no customer ID logged — hard rule
        });
        throw new Error("Stripe direct checkout session created but URL is null");
      }

      logger.info("stripe_direct_checkout_session_created", {
        session_id: session.id,
        plan_tier: plan,
        billing_interval: interval,
        // NOTE: no customer ID, no email logged — hard rule
      });

      return { url: session.url };
    } catch (err) {
      // Defense-in-depth: if Stripe rejects the coupon (exhausted / invalid) while
      // we tried to apply the founder discount, retry once without it so checkout
      // still completes at list price.
      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        applyFounderDiscount
      ) {
        logger.warn("stripe_direct_checkout_coupon_fallback", {
          plan_tier: plan,
        });
        try {
          const stripe = getStripe();
          const sessionRetry = await stripe.checkout.sessions.create({
            mode: "subscription",
            ...(email ? { customer_email: email } : {}),
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
              plan_tier: plan,
              billing_interval: interval,
              founder_discount: "false",
              flow: "direct",
            },
            discounts: undefined,
            allow_promotion_codes: true,
            subscription_data: {
              metadata: {
                plan_tier: plan,
                billing_interval: interval,
                flow: "direct",
              },
            },
          });
          if (!sessionRetry.url) {
            throw new Error("Stripe direct checkout session (retry) has no URL");
          }
          return { url: sessionRetry.url };
        } catch (retryErr) {
          logger.error("stripe_direct_checkout_coupon_fallback_failed", {
            error_type:
              retryErr instanceof Stripe.errors.StripeError
                ? retryErr.type
                : "unknown",
            plan_tier: plan,
          });
        }
      }

      if (err instanceof Stripe.errors.StripeError) {
        const isRetryable =
          err.statusCode === undefined ||
          err.statusCode >= 500 ||
          err.statusCode === 429;

        logger.error("stripe_direct_checkout_api_error", {
          error_type: err.type,
          error_code: err.code ?? "unknown",
          retryable: isRetryable,
          plan_tier: plan,
        });

        const wrappedErr = new Error(
          `Stripe direct checkout error: ${err.type} — ${err.code ?? "unknown"}`
        );
        (wrappedErr as NodeJS.ErrnoException).code = "stripe_api_error";
        throw wrappedErr;
      }
      // Re-throw missing_price_id and other non-Stripe errors
      throw err;
    }
  } catch (err) {
    // If getStripeConfig() threw because STRIPE_SECRET_KEY is not set,
    // surface a clean 'stripe_not_configured' code so the route can return 503.
    if (
      err instanceof Error &&
      (err.message.includes("STRIPE_SECRET_KEY") ||
        err.message.includes("STRIPE_WEBHOOK_SECRET"))
    ) {
      const configErr = new Error("Stripe is not configured");
      (configErr as NodeJS.ErrnoException).code = "stripe_not_configured";
      throw configErr;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// mapPriceIdToPlanTier
// ---------------------------------------------------------------------------
// Maps a Stripe price ID to our internal plan tier.
// Price IDs come from env vars STRIPE_PRICE_ID_GROWTH(_ANNUAL) and
// STRIPE_PRICE_ID_AGENCY(_ANNUAL); both monthly and annual IDs map to their tier.
//
// Returns null if the price ID is not recognized (e.g., legacy price, test mode mismatch).
// Callers should treat null as 'free' or log a warning.
// ---------------------------------------------------------------------------
export function mapPriceIdToPlanTier(
  priceId: string
): PaidPlanTier | null {
  const { priceIdGrowth, priceIdAgency, priceIdGrowthAnnual, priceIdAgencyAnnual } =
    getStripeConfig();

  // Match both monthly and annual price IDs for each tier.
  if (priceId === priceIdGrowth || priceId === priceIdGrowthAnnual) {
    return "growth";
  }
  if (priceId === priceIdAgency || priceId === priceIdAgencyAnnual) {
    return "agency";
  }
  // Unknown price ID — log warning (no customer ID, no full price ID to avoid
  // leaking our pricing config structure in aggregated logs)
  logger.warn("stripe_unknown_price_id", {
    price_id_prefix: priceId.substring(0, 8) + "...", // truncated — safe to log
  });
  return null;
}
