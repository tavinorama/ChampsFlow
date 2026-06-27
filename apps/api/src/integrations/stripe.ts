/**
 * Stripe integration — C6 Billing
 *
 * Provides:
 *   createCheckoutSession   — Stripe Checkout for subscription mode (no card data in our app)
 *   createBillingPortalSession — Stripe Customer Portal (Stripe-hosted management)
 *   verifyWebhookSignature  — HMAC-SHA256 signature verification for incoming webhooks
 *   mapStripeStatusToInternal — Stripe subscription status → our internal status
 *   mapPriceIdToPlanTier    — Stripe price ID → plan tier ('growth' | 'agency')
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
 *   agency: $149/mo or $1,251/yr — 25 brands, 10 competitors, 250 prompts, weekly monitoring
 *   Founder 30% discount is annual-only (STRIPE_FOUNDER_COUPON_ID).
 *
 * Sub-processor status:
 *   Stripe is an approved sub-processor in §11. DPA + SCCs required before EU launch (Gate 7 BLOCKER).
 *   Stripe handles all PCI scope. We store only stripe_customer_id + stripe_subscription_id
 *   (opaque Stripe references) in our DB.
 */

import Stripe from "stripe";
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

/** Billing interval for a subscription checkout. */
export type BillingInterval = "month" | "year";

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
//   agency   — 25 brands, 10 competitors, 250 prompts, weekly monitoring (multi-client)
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
  }
> = {
  // Free is a deliberate TASTE, not a usable tier: 1 brand, 1 competitor, a
  // shallow 10-prompt audit, no monitoring. Enough to see your standing once —
  // upgrade to Growth for real depth + weekly tracking.
  free: { max_brands: 1, max_competitors: 1, prompts_per_audit: 10, weekly_monitoring: false },
  growth: { max_brands: 1, max_competitors: 10, prompts_per_audit: 250, weekly_monitoring: true },
  agency: { max_brands: 25, max_competitors: 10, prompts_per_audit: 250, weekly_monitoring: true },
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
  // eligible for the founder discount.
  interval: BillingInterval = "month",
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
  // founder, the interval is yearly, AND a coupon is configured. On monthly
  // checkouts the founder flag is ignored — there is no monthly founder price.
  const applyFounderDiscount = founder && interval === "year" && Boolean(founderCouponId);

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
      // Pre-fill email to reduce checkout friction
      customer_email: userEmail,
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

/**
 * Retrieve a Checkout Session and report whether it is paid. Used by the Kit
 * delivery page to verify payment without relying solely on the webhook.
 */
export async function isCheckoutSessionPaid(sessionId: string): Promise<boolean> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status === "paid";
  } catch (err) {
    logger.error("stripe_session_retrieve_error", {
      error_type: err instanceof Stripe.errors.StripeError ? err.type : "unknown",
    });
    return false;
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
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
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
    case "incomplete_expired":
    case "unpaid":
    case "paused":
    default:
      return "incomplete";
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
