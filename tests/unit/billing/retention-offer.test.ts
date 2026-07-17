/**
 * tests/unit/billing/retention-offer.test.ts — applyRetentionDiscount guards
 *
 * Hermes review #357 blockers:
 *  1. Concurrency — the Stripe update carries a FIXED idempotency key per
 *     subscription, so a racing duplicate replays the same mutation.
 *  2. Monthly-only — a "3 months" coupon on annual billing would expire
 *     before the next invoice; the function must refuse (not_monthly).
 *  One-offer guard — any pre-existing discount refuses (already_discounted).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetrieve = vi.fn();
const mockUpdate = vi.fn();
const mockCouponRetrieve = vi.fn();
const mockCouponCreate = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    subscriptions = { retrieve: mockRetrieve, update: mockUpdate };
    coupons = { retrieve: mockCouponRetrieve, create: mockCouponCreate };
    static errors = { StripeError: class StripeError extends Error { code?: string } };
  }
  return { default: StripeMock };
});

import { applyRetentionDiscount } from "../../../apps/api/src/integrations/stripe";

function sub(interval: string, discounts: unknown[] = []) {
  return { discounts, items: { data: [{ price: { recurring: { interval } } }] } };
}

describe("applyRetentionDiscount", () => {
  beforeEach(() => {
    mockRetrieve.mockReset(); mockUpdate.mockReset();
    mockCouponRetrieve.mockReset(); mockCouponCreate.mockReset();
    process.env["STRIPE_SECRET_KEY"] = "sk_test_dummy";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_dummy";
    mockCouponRetrieve.mockResolvedValue({ id: "RETENTION30" });
  });

  it("refuses ANNUAL subscriptions (not_monthly) — the 3-month coupon would expire before the next invoice", async () => {
    mockRetrieve.mockResolvedValue(sub("year"));
    const r = await applyRetentionDiscount("sub_annual");
    expect(r).toEqual({ applied: false, reason: "not_monthly" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses when ANY discount is already attached (one offer per subscription)", async () => {
    mockRetrieve.mockResolvedValue(sub("month", [{ id: "di_1" }]));
    const r = await applyRetentionDiscount("sub_disc");
    expect(r).toEqual({ applied: false, reason: "already_discounted" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies to a clean MONTHLY subscription with a FIXED per-subscription idempotency key", async () => {
    mockRetrieve.mockResolvedValue(sub("month"));
    mockUpdate.mockResolvedValue({});
    const r = await applyRetentionDiscount("sub_ok");
    expect(r).toEqual({ applied: true });
    const [id, params, opts] = mockUpdate.mock.calls[0]!;
    expect(id).toBe("sub_ok");
    expect(params.discounts).toEqual([{ coupon: "RETENTION30" }]);
    expect(opts.idempotencyKey).toBe("retention30-apply-sub_ok");
  });

  it("legacy single-discount shape also refuses", async () => {
    mockRetrieve.mockResolvedValue({ discount: { id: "di_old" }, items: { data: [{ price: { recurring: { interval: "month" } } }] } });
    const r = await applyRetentionDiscount("sub_legacy");
    expect(r).toEqual({ applied: false, reason: "already_discounted" });
  });
});
