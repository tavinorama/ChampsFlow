/**
 * Unit — canonical pricing/MRR math (packages/shared/src/pricing).
 *
 * Locks the rule that fixed the admin↔operator MRR drift: MRR counts ONLY
 * status='active'. Trialing/canceled/past_due/incomplete never contribute.
 */
import { describe, it, expect } from "vitest";
import {
  computeMrr,
  mrrForTier,
  arrFromMrr,
  dfyPriceForSku,
  applyDiscountCents,
  receivedMonthlyUsd,
  LIST_PRICE_USD,
  LIST_PRICE_ANNUAL_USD,
  PLAN_MRR_USD,
} from "../../packages/shared/src/pricing";

describe("pricing", () => {
  it("prices each plan tier; unknown/free/starter = 0", () => {
    expect(mrrForTier("growth")).toBe(99);
    expect(mrrForTier("agency")).toBe(549);
    expect(mrrForTier("pro")).toBe(99); // legacy alias
    expect(mrrForTier("free")).toBe(0);
    expect(mrrForTier("starter")).toBe(0);
    expect(mrrForTier(null)).toBe(0);
    expect(mrrForTier("mystery")).toBe(0);
  });

  it("computeMrr counts ONLY active subscriptions", () => {
    const subs = [
      { plan_tier: "growth", status: "active" },   // 99
      { plan_tier: "agency", status: "active" },   // 549
      { plan_tier: "growth", status: "trialing" }, // 0 — not billing yet
      { plan_tier: "agency", status: "past_due" }, // 0
      { plan_tier: "growth", status: "canceled" }, // 0
      { plan_tier: "starter", status: "active" },  // 0 — starter is free-priced
    ];
    expect(computeMrr(subs)).toBe(99 + 549);
  });

  it("computeMrr is empty-safe and arr is x12", () => {
    expect(computeMrr([])).toBe(0);
    expect(arrFromMrr(348)).toBe(348 * 12);
  });

  it("dfyPriceForSku maps the two DFY SKUs", () => {
    expect(dfyPriceForSku("geo_sprint")).toBe(LIST_PRICE_USD.geoSprint);
    expect(dfyPriceForSku("managed_geo")).toBe(LIST_PRICE_USD.managedGeo);
    expect(dfyPriceForSku("other")).toBe(0);
    expect(dfyPriceForSku(null)).toBe(0);
  });

  it("PLAN_MRR_USD stays aligned with the list prices", () => {
    expect(PLAN_MRR_USD.growth).toBe(LIST_PRICE_USD.growth);
    expect(PLAN_MRR_USD.agency).toBe(LIST_PRICE_USD.agency);
  });
});

describe("received-value MRR math", () => {
  it("applyDiscountCents: no discount is a pass-through", () => {
    expect(applyDiscountCents(9900)).toBe(9900);
    expect(applyDiscountCents(9900, null)).toBe(9900);
    expect(applyDiscountCents(9900, {})).toBe(9900);
  });

  it("applyDiscountCents: percent_off (30% founder coupon)", () => {
    expect(applyDiscountCents(83100, { percentOff: 30 })).toBeCloseTo(58170, 5);
    // 100%-off → $0 received (the honest number, not the sticker)
    expect(applyDiscountCents(9900, { percentOff: 100 })).toBe(0);
  });

  it("applyDiscountCents: amount_off (fixed cents) clamps at 0", () => {
    expect(applyDiscountCents(9900, { amountOffCents: 2000 })).toBe(7900);
    expect(applyDiscountCents(9900, { amountOffCents: 999999 })).toBe(0);
  });

  it("applyDiscountCents: guards non-positive/invalid gross", () => {
    expect(applyDiscountCents(0)).toBe(0);
    expect(applyDiscountCents(-100, { percentOff: 30 })).toBe(0);
    expect(applyDiscountCents(Number.NaN)).toBe(0);
  });

  it("receivedMonthlyUsd: annual charge amortizes across 12 months", () => {
    // Growth annual $831 → $69.25/mo, NOT the $99 sticker.
    expect(receivedMonthlyUsd(LIST_PRICE_ANNUAL_USD.growth * 100, "year")).toBeCloseTo(69.25, 2);
    // Agency annual $4,611 → $384.25/mo.
    expect(receivedMonthlyUsd(LIST_PRICE_ANNUAL_USD.agency * 100, "year")).toBeCloseTo(384.25, 2);
  });

  it("receivedMonthlyUsd: monthly charge passes through", () => {
    expect(receivedMonthlyUsd(9900, "month")).toBe(99);
  });

  it("received value composes discount + amortization (founder annual growth)", () => {
    // $831/yr with 30% founder coupon → $581.70/yr → $48.475/mo.
    const net = applyDiscountCents(LIST_PRICE_ANNUAL_USD.growth * 100, { percentOff: 30 });
    expect(receivedMonthlyUsd(net, "year")).toBeCloseTo(48.475, 3);
  });

  it("receivedMonthlyUsd: zero/invalid → 0", () => {
    expect(receivedMonthlyUsd(0, "month")).toBe(0);
    expect(receivedMonthlyUsd(Number.NaN, "year")).toBe(0);
  });
});
