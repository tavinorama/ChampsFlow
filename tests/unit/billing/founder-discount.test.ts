/**
 * Unit — founder discount is ANNUAL-ONLY (revenue rule)
 *
 * createCheckoutSession must apply the founder coupon (Stripe `discounts`) ONLY
 * when founder === true AND interval === 'year' AND a coupon is configured.
 * On monthly billing — or without the founder flag — it must NOT discount and
 * must leave `allow_promotion_codes: true` (Stripe forbids both together).
 * It must also select the annual vs monthly price ID per the interval.
 *
 * Guards the business rule: "the 30% founder discount applies to annual plans
 * only" (see landing copy + STRIPE_FOUNDER_COUPON_ID).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Stripe SDK — capture the checkout.sessions.create payload.
// Use a class so `new Stripe()` yields an instance with `.checkout`, and expose
// a static `errors.StripeError` so createCheckoutSession's catch block is valid.
const mockCreate = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    checkout = { sessions: { create: mockCreate } };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

import {
  createCheckoutSession,
  FOUNDER_DISCOUNT_PERCENT,
} from "../../../apps/api/src/integrations/stripe";

describe("founder discount — annual-only rule", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    process.env["STRIPE_SECRET_KEY"] = "sk_test_dummy";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_dummy";
    process.env["STRIPE_PRICE_ID_GROWTH"] = "price_growth_monthly";
    process.env["STRIPE_PRICE_ID_GROWTH_ANNUAL"] = "price_growth_annual";
    process.env["STRIPE_FOUNDER_COUPON_ID"] = "FOUNDER30";
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastArgs = (): any => mockCreate.mock.calls.at(-1)?.[0];

  it("FOUNDER_DISCOUNT_PERCENT is 30", () => {
    expect(FOUNDER_DISCOUNT_PERCENT).toBe(30);
  });

  it("ANNUAL + founder → applies the coupon, uses the annual price, no promo codes", async () => {
    await createCheckoutSession("t1", "a@b.co", "growth", "https://ok", "https://no", "EU", "year", true);
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_annual");
    expect(args.discounts).toEqual([{ coupon: "FOUNDER30" }]);
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(args.metadata.billing_interval).toBe("year");
    expect(args.metadata.founder_discount).toBe("true");
  });

  it("MONTHLY + founder → NO coupon (annual-only), uses the monthly price", async () => {
    await createCheckoutSession("t1", "a@b.co", "growth", "https://ok", "https://no", "EU", "month", true);
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_monthly");
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.metadata.founder_discount).toBe("false");
  });

  it("ANNUAL + non-founder → NO coupon (annual price, promo codes open)", async () => {
    await createCheckoutSession("t1", "a@b.co", "growth", "https://ok", "https://no", "EU", "year", false);
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_annual");
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
  });

  it("defaults to ANNUAL (no founder discount unless founder) when interval/founder omitted", async () => {
    // Annual is now the default billing interval (monthly is opt-in). Founder
    // omitted → no coupon even on annual; promo codes stay open.
    await createCheckoutSession("t1", "a@b.co", "growth", "https://ok", "https://no");
    const args = lastArgs();
    expect(args.line_items[0].price).toBe("price_growth_annual");
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
  });

  it("founder discount is skipped when no coupon is configured (fails safe)", async () => {
    delete process.env["STRIPE_FOUNDER_COUPON_ID"];
    await createCheckoutSession("t1", "a@b.co", "growth", "https://ok", "https://no", "EU", "year", true);
    const args = lastArgs();
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
  });
});
