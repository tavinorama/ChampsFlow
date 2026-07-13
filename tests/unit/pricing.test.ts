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
  LIST_PRICE_USD,
  PLAN_MRR_USD,
} from "../../packages/shared/src/pricing";

describe("pricing", () => {
  it("prices each plan tier; unknown/free/starter = 0", () => {
    expect(mrrForTier("growth")).toBe(99);
    expect(mrrForTier("agency")).toBe(249);
    expect(mrrForTier("pro")).toBe(99); // legacy alias
    expect(mrrForTier("free")).toBe(0);
    expect(mrrForTier("starter")).toBe(0);
    expect(mrrForTier(null)).toBe(0);
    expect(mrrForTier("mystery")).toBe(0);
  });

  it("computeMrr counts ONLY active subscriptions", () => {
    const subs = [
      { plan_tier: "growth", status: "active" },   // 99
      { plan_tier: "agency", status: "active" },   // 249
      { plan_tier: "growth", status: "trialing" }, // 0 — not billing yet
      { plan_tier: "agency", status: "past_due" }, // 0
      { plan_tier: "growth", status: "canceled" }, // 0
      { plan_tier: "starter", status: "active" },  // 0 — starter is free-priced
    ];
    expect(computeMrr(subs)).toBe(99 + 249);
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
