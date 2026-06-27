/**
 * Unit — checkout-first capability
 *
 * Tests:
 *   a. createDirectCheckoutSession — metadata.flow='direct', no tenant_id,
 *      founder discount rules, customer_email handling.
 *   b. Plan validation logic (pure).
 *   c. createDirectCheckoutSession error codes (missing price ID).
 *   d. pendingEmailMatches — email-comparison helper (pure, exported from onboarding).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Stripe SDK — capture checkout.sessions.create payloads.
// Must be declared before any imports that load stripe.ts.
// ---------------------------------------------------------------------------
const mockCreate = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    checkout = { sessions: { create: mockCreate } };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

import {
  createDirectCheckoutSession,
} from "../../../apps/api/src/integrations/stripe";

import { pendingEmailMatches } from "../../../apps/api/src/routes/onboarding";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastArgs = (): any => mockCreate.mock.calls.at(-1)?.[0];

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string> = {
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
    STRIPE_PRICE_ID_GROWTH: "price_growth_monthly",
    STRIPE_PRICE_ID_GROWTH_ANNUAL: "price_growth_annual",
    STRIPE_PRICE_ID_AGENCY: "price_agency_monthly",
    STRIPE_PRICE_ID_AGENCY_ANNUAL: "price_agency_annual",
    STRIPE_FOUNDER_COUPON_ID: "FOUNDER30",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// a. createDirectCheckoutSession — metadata + structure
// ---------------------------------------------------------------------------

describe("createDirectCheckoutSession — metadata and structure", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "cs_direct_test",
      url: "https://checkout.stripe.com/c/pay/cs_direct_test",
    });
    setEnv();
  });

  afterEach(() => {
    // Clean up env so tests don't bleed
    for (const k of [
      "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_GROWTH", "STRIPE_PRICE_ID_GROWTH_ANNUAL",
      "STRIPE_PRICE_ID_AGENCY", "STRIPE_PRICE_ID_AGENCY_ANNUAL",
      "STRIPE_FOUNDER_COUPON_ID",
    ]) {
      delete process.env[k];
    }
  });

  it("sets metadata.flow='direct' on the Stripe session", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    expect(lastArgs().metadata.flow).toBe("direct");
  });

  it("does NOT include tenant_id in session metadata", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    const meta = lastArgs().metadata;
    expect(meta.tenant_id).toBeUndefined();
  });

  it("does NOT include tenant_id in subscription_data.metadata", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    const subMeta = lastArgs().subscription_data?.metadata;
    expect(subMeta?.tenant_id).toBeUndefined();
  });

  it("sets flow='direct' in subscription_data.metadata", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    expect(lastArgs().subscription_data?.metadata?.flow).toBe("direct");
  });

  it("ANNUAL + founder → applies coupon, uses annual price, no promo codes", async () => {
    await createDirectCheckoutSession("growth", "year", true, "https://ok", "https://no");
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_annual");
    expect(args.discounts).toEqual([{ coupon: "FOUNDER30" }]);
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(args.metadata.founder_discount).toBe("true");
  });

  it("MONTHLY + founder → NO coupon (annual-only rule), uses monthly price", async () => {
    await createDirectCheckoutSession("growth", "month", true, "https://ok", "https://no");
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_monthly");
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.metadata.founder_discount).toBe("false");
  });

  it("ANNUAL + non-founder → no coupon, promo codes open", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    const args = lastArgs();
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
  });

  it("sets customer_email when email param is provided", async () => {
    await createDirectCheckoutSession(
      "growth", "year", false, "https://ok", "https://no", "buyer@example.com"
    );
    expect(lastArgs().customer_email).toBe("buyer@example.com");
  });

  it("omits customer_email when email param is not provided", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    // customer_email should be absent (spread of {} when no email)
    expect(lastArgs().customer_email).toBeUndefined();
  });

  it("uses the annual agency price when plan=agency interval=year", async () => {
    await createDirectCheckoutSession("agency", "year", false, "https://ok", "https://no");
    expect(lastArgs().line_items[0].price).toBe("price_agency_annual");
  });

  it("uses the monthly agency price when plan=agency interval=month", async () => {
    await createDirectCheckoutSession("agency", "month", false, "https://ok", "https://no");
    expect(lastArgs().line_items[0].price).toBe("price_agency_monthly");
  });

  it("returns { url } on success", async () => {
    const result = await createDirectCheckoutSession(
      "growth", "year", false, "https://ok", "https://no"
    );
    expect(result).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_direct_test" });
  });

  it("uses mode=subscription (not payment)", async () => {
    await createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no");
    expect(lastArgs().mode).toBe("subscription");
  });

  it("founder discount is skipped when no coupon is configured (fails safe)", async () => {
    setEnv({ STRIPE_FOUNDER_COUPON_ID: undefined });
    await createDirectCheckoutSession("growth", "year", true, "https://ok", "https://no");
    expect(lastArgs().discounts).toBeUndefined();
    expect(lastArgs().allow_promotion_codes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// b. Plan validation — pure function logic
// ---------------------------------------------------------------------------

describe("plan validation — allowed values", () => {
  // Test the validation logic directly as pure functions
  // (mirrors what the route handler does before calling createDirectCheckoutSession)

  function isValidPlan(plan: unknown): plan is "growth" | "agency" {
    return plan === "growth" || plan === "agency";
  }

  it("'growth' is valid", () => {
    expect(isValidPlan("growth")).toBe(true);
  });

  it("'agency' is valid", () => {
    expect(isValidPlan("agency")).toBe(true);
  });

  it("'free' is invalid", () => {
    expect(isValidPlan("free")).toBe(false);
  });

  it("'starter' is invalid", () => {
    expect(isValidPlan("starter")).toBe(false);
  });

  it("empty string is invalid", () => {
    expect(isValidPlan("")).toBe(false);
  });

  it("undefined is invalid", () => {
    expect(isValidPlan(undefined)).toBe(false);
  });

  it("null is invalid", () => {
    expect(isValidPlan(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// c. Error codes from createDirectCheckoutSession
// ---------------------------------------------------------------------------

describe("createDirectCheckoutSession — error handling", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "cs_direct_test",
      url: "https://checkout.stripe.com/c/pay/cs_direct_test",
    });
  });

  afterEach(() => {
    for (const k of [
      "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_GROWTH", "STRIPE_PRICE_ID_GROWTH_ANNUAL",
      "STRIPE_PRICE_ID_AGENCY", "STRIPE_PRICE_ID_AGENCY_ANNUAL",
      "STRIPE_FOUNDER_COUPON_ID",
    ]) {
      delete process.env[k];
    }
  });

  it("throws with code='missing_price_id' when growth annual price env is unset", async () => {
    setEnv({
      STRIPE_PRICE_ID_GROWTH_ANNUAL: undefined,
    });
    await expect(
      createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no")
    ).rejects.toMatchObject({ code: "missing_price_id" });
  });

  it("throws with code='missing_price_id' when agency monthly price env is unset", async () => {
    setEnv({
      STRIPE_PRICE_ID_AGENCY: undefined,
    });
    await expect(
      createDirectCheckoutSession("agency", "month", false, "https://ok", "https://no")
    ).rejects.toMatchObject({ code: "missing_price_id" });
  });

  it("throws with code='stripe_not_configured' when STRIPE_SECRET_KEY is missing", async () => {
    setEnv({
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
    });
    await expect(
      createDirectCheckoutSession("growth", "year", false, "https://ok", "https://no")
    ).rejects.toMatchObject({ code: "stripe_not_configured" });
  });

  it("succeeds with correct session structure when fully configured", async () => {
    setEnv();
    const result = await createDirectCheckoutSession(
      "growth", "year", false,
      "https://example.com/welcome?session_id={CHECKOUT_SESSION_ID}",
      "https://example.com/pricing"
    );
    expect(result.url).toMatch(/checkout\.stripe\.com/);
    const args = lastArgs();
    expect(args.metadata.plan_tier).toBe("growth");
    expect(args.metadata.billing_interval).toBe("year");
    expect(args.metadata.flow).toBe("direct");
    expect(args.metadata.tenant_id).toBeUndefined();
    expect(args.success_url).toContain("{CHECKOUT_SESSION_ID}");
  });
});

// ---------------------------------------------------------------------------
// d. pendingEmailMatches — pure email-comparison helper
// ---------------------------------------------------------------------------

describe("pendingEmailMatches — email comparison helper", () => {
  it("same email (exact) → true", () => {
    expect(pendingEmailMatches("alice@example.com", "alice@example.com")).toBe(true);
  });

  it("different email → false", () => {
    expect(pendingEmailMatches("alice@example.com", "bob@example.com")).toBe(false);
  });

  it("different case → true (case-insensitive)", () => {
    expect(pendingEmailMatches("Alice@Example.COM", "alice@example.com")).toBe(true);
  });

  it("different case in both → true", () => {
    expect(pendingEmailMatches("ALICE@EXAMPLE.COM", "alice@example.com")).toBe(true);
  });

  it("different domain → false", () => {
    expect(pendingEmailMatches("alice@example.com", "alice@other.com")).toBe(false);
  });

  it("whitespace trimmed before comparison — true", () => {
    expect(pendingEmailMatches("  alice@example.com  ", "alice@example.com")).toBe(true);
  });

  it("empty strings → true (both empty)", () => {
    expect(pendingEmailMatches("", "")).toBe(true);
  });

  it("one empty → false", () => {
    expect(pendingEmailMatches("alice@example.com", "")).toBe(false);
  });
});
