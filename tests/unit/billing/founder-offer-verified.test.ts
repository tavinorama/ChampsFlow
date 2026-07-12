/**
 * Unit — founder-offer count honesty (P3.3, no fake scarcity)
 *
 * getFounderOfferStatus() must distinguish a REAL Stripe read from a fail-safe:
 *   - Live read (coupon retrieved)     → `verified: true`, remaining = limit − redeemed.
 *   - Fail-safe (Stripe unconfigured / retrieve throws) → `verified: false`,
 *     remaining = full limit as a KEEP-OPEN default (never breaks checkout),
 *     but flagged unverified so public surfaces hide the number instead of
 *     publishing an unverified "100 of 100 left" as if it were live.
 *
 * Guards the launch honesty rule: the /pricing FounderBand promises "no fake
 * scarcity" — the API must never advertise a count it didn't actually read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Stripe SDK — expose coupons.retrieve + a static errors.StripeError so
// getFounderOfferStatus's catch block (which narrows on Stripe.errors.StripeError)
// type-checks and runs.
const mockRetrieve = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    coupons = { retrieve: mockRetrieve };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

import { getFounderOfferStatus } from "../../../apps/api/src/integrations/stripe";

// Env keys this suite mutates — saved/restored so tests stay isolated.
const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_FOUNDER_COUPON_ID",
  "FOUNDER_DISCOUNT_ACTIVE",
  "FOUNDER_OFFER_LIMIT",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
let saved: Record<string, string | undefined>;

describe("getFounderOfferStatus — verified vs fail-safe", () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    mockRetrieve.mockReset();
    // Minimal Stripe config so getStripeConfig() succeeds.
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
    process.env.STRIPE_FOUNDER_COUPON_ID = "FOUNDER30";
    delete process.env.FOUNDER_DISCOUNT_ACTIVE; // default → active
    process.env.FOUNDER_OFFER_LIMIT = "100";
    // No Redis configured → runs cache-less (deterministic, no stale cache hit).
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  function restore() {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  it("LIVE read → verified:true, remaining = limit − times_redeemed", async () => {
    mockRetrieve.mockResolvedValue({ id: "FOUNDER30", valid: true, times_redeemed: 12 });
    const s = await getFounderOfferStatus();
    expect(s.verified).toBe(true);
    expect(s.remaining).toBe(88);
    expect(s.redeemed).toBe(12);
    expect(s.limit).toBe(100);
    expect(s.active).toBe(true);
    restore();
  });

  it("SOLD OUT (real read at cap) → verified:true, active:false, remaining:0", async () => {
    mockRetrieve.mockResolvedValue({ id: "FOUNDER30", valid: true, times_redeemed: 100 });
    const s = await getFounderOfferStatus();
    expect(s.verified).toBe(true);
    expect(s.active).toBe(false);
    expect(s.remaining).toBe(0);
    restore();
  });

  it("STRIPE THROWS → fail-safe: verified:false, offer stays open, count NOT trusted", async () => {
    mockRetrieve.mockRejectedValue(new Error("stripe down"));
    const s = await getFounderOfferStatus();
    expect(s.verified).toBe(false); // the number is a keep-open default, not live
    expect(s.active).toBe(true); // don't break checkout on a Stripe blip
    expect(s.remaining).toBe(100); // full limit — but verified:false means "hide it"
    expect(mockRetrieve).toHaveBeenCalledOnce();
    restore();
  });

  it("COUPON UNCONFIGURED → fail-safe: verified:false, no Stripe call", async () => {
    delete process.env.STRIPE_FOUNDER_COUPON_ID;
    const s = await getFounderOfferStatus();
    expect(s.verified).toBe(false);
    expect(s.remaining).toBe(100);
    expect(mockRetrieve).not.toHaveBeenCalled();
    restore();
  });

  it("public contract: verified:false must map to a hidden count (remaining → null)", async () => {
    // Mirrors GET /api/founder-status: only a VERIFIED read is published as a
    // number; an unverified fail-safe is nulled so the UI shows generic copy.
    mockRetrieve.mockRejectedValue(new Error("stripe down"));
    const s = await getFounderOfferStatus();
    const published = s.verified ? s.remaining : null;
    expect(published).toBeNull();
    restore();
  });
});
