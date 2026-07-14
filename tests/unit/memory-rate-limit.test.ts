/**
 * memory-rate-limit.test.ts — locks the bounded in-process fallback limiter
 * that replaces "fail-open on Redis error" for cost-bearing endpoints (#261).
 *
 * The property that matters: when the distributed limiter is down, requests are
 * still CAPPED (not unlimited), the window SLIDES (old hits expire), and the key
 * store stays MEMORY-BOUNDED under a distinct-key flood.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  memoryRateLimitAllow,
  __resetMemoryRateLimit,
} from "../../apps/api/src/lib/memory-rate-limit";

beforeEach(() => {
  __resetMemoryRateLimit();
});

describe("memoryRateLimitAllow", () => {
  it("allows up to the limit, then blocks — the cap is enforced, not fail-open", () => {
    const t0 = 1_000_000;
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(memoryRateLimitAllow("ip:1", 3, 10_000, t0 + i));
    }
    // 3 allowed, then blocked — NOT unlimited.
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("slides the window: hits older than windowMs stop counting", () => {
    const t0 = 2_000_000;
    const windowMs = 10_000;
    // Fill the cap.
    expect(memoryRateLimitAllow("ip:2", 2, windowMs, t0)).toBe(true);
    expect(memoryRateLimitAllow("ip:2", 2, windowMs, t0 + 1)).toBe(true);
    expect(memoryRateLimitAllow("ip:2", 2, windowMs, t0 + 2)).toBe(false);
    // Advance past the window — the two early hits expire, so we're allowed again.
    expect(memoryRateLimitAllow("ip:2", 2, windowMs, t0 + windowMs + 3)).toBe(true);
  });

  it("keys are independent — one IP's usage doesn't limit another", () => {
    const t0 = 3_000_000;
    expect(memoryRateLimitAllow("ip:a", 1, 10_000, t0)).toBe(true);
    expect(memoryRateLimitAllow("ip:a", 1, 10_000, t0 + 1)).toBe(false); // a exhausted
    expect(memoryRateLimitAllow("ip:b", 1, 10_000, t0 + 1)).toBe(true); // b unaffected
  });

  it("stays memory-bounded: a flood of distinct expired keys is pruned", () => {
    const windowMs = 1_000;
    // 12,000 distinct keys, each hit once, all far in the past relative to the
    // final `now` — the store must not retain all of them (MAX_KEYS = 10,000).
    for (let i = 0; i < 12_000; i++) {
      memoryRateLimitAllow(`flood:${i}`, 5, windowMs, 1_000 + i);
    }
    // A fresh key well after every flood hit expired still behaves correctly.
    const now = 1_000 + 12_000 + windowMs + 10;
    expect(memoryRateLimitAllow("fresh", 2, windowMs, now)).toBe(true);
    expect(memoryRateLimitAllow("fresh", 2, windowMs, now + 1)).toBe(true);
    expect(memoryRateLimitAllow("fresh", 2, windowMs, now + 2)).toBe(false);
  });
});
