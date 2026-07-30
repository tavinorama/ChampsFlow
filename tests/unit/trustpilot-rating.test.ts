/**
 * Unit tests for the Trustpilot rating gate (apps/web/src/lib/trustpilot.ts).
 *
 * What is actually being protected here: the footer badge prints a star rating
 * to every visitor of ozvor.com. The profile had ZERO published reviews on the
 * day this shipped, so the failure that matters is not a crash — it is the badge
 * confidently printing "0.0" or "5.0 · 1 review" and reading as advertising.
 *
 * These tests pin the two halves of that:
 *   - getTrustpilotRating() returns null on every failure path, so the badge
 *     falls back to its invite instead of printing something invented.
 *   - isWorthShowing() refuses ratings that are real but too thin to mean
 *     anything (< 5 reviews) or too weak to advertise (< 4.0 stars).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTrustpilotRating,
  isWorthShowing,
  MIN_STARS,
  MIN_REVIEWS,
} from "../../apps/web/src/lib/trustpilot";

const KEY = "TRUSTPILOT_API_KEY";

/** Builds a fetch stub that returns one JSON body with status 200. */
function okJson(body: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
}

describe("isWorthShowing", () => {
  it("rejects null — the read failed or no key is set", () => {
    expect(isWorthShowing(null)).toBe(false);
  });

  it("rejects a real but lonely 5.0 from a single review", () => {
    // The case the founder will actually hit first. One glowing review reads as
    // a favour from a friend; the badge must keep inviting instead.
    expect(isWorthShowing({ stars: 5, reviews: 1 })).toBe(false);
  });

  it("rejects a strong average that is one review short of the floor", () => {
    expect(isWorthShowing({ stars: 4.9, reviews: MIN_REVIEWS - 1 })).toBe(false);
  });

  it("rejects a well-reviewed but weak score", () => {
    // We would not want 3.4 quoted back at us on the pricing page, so we do not
    // print it in the footer either.
    expect(isWorthShowing({ stars: 3.4, reviews: 200 })).toBe(false);
  });

  it("accepts exactly the floor, on both axes at once", () => {
    expect(isWorthShowing({ stars: MIN_STARS, reviews: MIN_REVIEWS })).toBe(true);
  });

  it("accepts a healthy rating", () => {
    expect(isWorthShowing({ stars: 4.7, reviews: 38 })).toBe(true);
  });
});

describe("getTrustpilotRating", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env[KEY];

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env[KEY];
    else process.env[KEY] = realKey;
    vi.restoreAllMocks();
  });

  it("returns null and makes NO request when the key is missing", async () => {
    // This is production's current state. It must cost zero network calls per
    // page render, not one failing call per render.
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    expect(await getTrustpilotRating()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads score and total from a well-formed response", async () => {
    process.env[KEY] = "k";
    globalThis.fetch = okJson({
      score: { trustScore: 4.6 },
      numberOfReviews: { total: 23 },
    }) as unknown as typeof fetch;
    expect(await getTrustpilotRating()).toEqual({ stars: 4.6, reviews: 23 });
  });

  it("sends the key as a query param on the business-unit endpoint", async () => {
    process.env[KEY] = "sekret";
    const spy = okJson({ score: { trustScore: 5 }, numberOfReviews: { total: 9 } });
    globalThis.fetch = spy as unknown as typeof fetch;
    await getTrustpilotRating();
    const url = String((spy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("api.trustpilot.com/v1/business-units/");
    expect(url).toContain("apikey=sekret");
  });

  it("returns null on a non-OK response (bad key, rate limit)", async () => {
    process.env[KEY] = "k";
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response) as unknown as typeof fetch;
    expect(await getTrustpilotRating()).toBeNull();
  });

  it("returns null when the network throws, and does not rethrow", async () => {
    // A footer must never be able to take a page down.
    process.env[KEY] = "k";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(getTrustpilotRating()).resolves.toBeNull();
  });

  it("returns null when the shape changes upstream", async () => {
    // The failure this exists to stop: a renamed field yielding undefined, and
    // "NaN" rendered in the footer of every marketing page.
    process.env[KEY] = "k";
    globalThis.fetch = okJson({ trustScore: 4.6, reviews: 23 }) as unknown as typeof fetch;
    expect(await getTrustpilotRating()).toBeNull();
  });

  it("returns null on a score outside the 0–5 scale", async () => {
    process.env[KEY] = "k";
    globalThis.fetch = okJson({
      score: { trustScore: 96 },
      numberOfReviews: { total: 23 },
    }) as unknown as typeof fetch;
    // 96 would be a percentage, not stars — printing "96.0 ★" is worse than
    // printing nothing.
    expect(await getTrustpilotRating()).toBeNull();
  });

  it("rounds a fractional review count rather than rendering it", async () => {
    process.env[KEY] = "k";
    globalThis.fetch = okJson({
      score: { trustScore: 4.2 },
      numberOfReviews: { total: 12.4 },
    }) as unknown as typeof fetch;
    expect(await getTrustpilotRating()).toEqual({ stars: 4.2, reviews: 12 });
  });
});
