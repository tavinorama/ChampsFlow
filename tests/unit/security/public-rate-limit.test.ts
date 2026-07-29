/**
 * public-rate-limit.test.ts — the limiter has to stay bounded when Redis is
 * not there.
 *
 * The point of lib/public-rate-limit.ts is that a public route can never be
 * left uncapped by accident. Its Redis path is the fast one; its fallback is
 * the one that decides whether an outage turns a capped surface into an
 * uncapped one, so that is what is tested here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  memoryRateLimitAllow,
  __resetMemoryRateLimit,
} from "../../../apps/api/src/lib/memory-rate-limit";

describe("public rate limit — in-process fallback", () => {
  beforeEach(() => {
    __resetMemoryRateLimit();
  });

  it("allows up to the limit and refuses the one after it", () => {
    const key = "t:allow";
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(memoryRateLimitAllow(key, 5, 60_000, now)).toBe(true);
    }
    expect(memoryRateLimitAllow(key, 5, 60_000, now)).toBe(false);
  });

  it("forgets hits once the window has passed", () => {
    const key = "t:window";
    const now = Date.now();
    for (let i = 0; i < 5; i++) memoryRateLimitAllow(key, 5, 60_000, now);
    expect(memoryRateLimitAllow(key, 5, 60_000, now)).toBe(false);
    expect(memoryRateLimitAllow(key, 5, 60_000, now + 60_001)).toBe(true);
  });

  it("keeps callers apart — one noisy address does not lock out the rest", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) memoryRateLimitAllow("t:noisy", 5, 60_000, now);
    expect(memoryRateLimitAllow("t:noisy", 5, 60_000, now)).toBe(false);
    expect(memoryRateLimitAllow("t:quiet", 5, 60_000, now)).toBe(true);
  });
});

/**
 * Enumeration is the case a per-resource cap cannot see.
 *
 * /api/reports/:token is capped on the token AND on the caller. Reviewing #396
 * caught the first version shipping only the token cap: every guessed token
 * gets a fresh bucket, so rotating the path buys unlimited attempts and writes
 * one Redis key per guess. These assert the shape of the fix — the caller is
 * bounded no matter how many distinct tokens they try.
 */
describe("public rate limit — token enumeration", () => {
  beforeEach(() => {
    __resetMemoryRateLimit();
  });

  it("a per-token cap alone never stops a caller rotating tokens", () => {
    const now = Date.now();
    // 50 distinct guesses, each its own bucket, every one allowed.
    for (let i = 0; i < 50; i++) {
      expect(memoryRateLimitAllow(`rl:report:guess-${i}`, 60, 3_600_000, now)).toBe(true);
    }
  });

  it("the caller-keyed cap does stop them, whatever token they try", () => {
    const now = Date.now();
    const ip = "rl:report_ip:203.0.113";
    for (let i = 0; i < 120; i++) {
      expect(memoryRateLimitAllow(ip, 120, 3_600_000, now)).toBe(true);
    }
    // The 121st guess is refused even though its token is brand new.
    expect(memoryRateLimitAllow(ip, 120, 3_600_000, now)).toBe(false);
  });
});
