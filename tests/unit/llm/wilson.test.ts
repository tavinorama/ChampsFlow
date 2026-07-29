/**
 * wilson.test.ts — B1 Wilson 95% interval + intent×engine aggregation.
 *
 * Known values below are the standard published Wilson score intervals for
 * z = 1.96 (95%), verifiable with any statistics reference implementation
 * (e.g. R binom::binom.wilson, statsmodels proportion_confint(method="wilson")).
 * No invented numbers — every expectation is computable from the closed form:
 *   (p̂ + z²/2n ± z·sqrt(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)
 */
import { describe, it, expect } from "vitest";
import { wilson95, aggregateIntentEngine } from "../../../packages/llm/src/wilson";

describe("wilson95 — known values (z = 1.96)", () => {
  it("0/1 → [0, 0.7935]", () => {
    const w = wilson95(0, 1);
    expect(w.rate).toBe(0);
    expect(w.low).toBe(0);
    expect(w.high).toBeCloseTo(0.7935, 3);
    expect(w.n).toBe(1);
  });

  it("1/1 → [0.2065, 1] (mirror of 0/1)", () => {
    const w = wilson95(1, 1);
    expect(w.rate).toBe(1);
    expect(w.low).toBeCloseTo(0.2065, 3);
    expect(w.high).toBe(1);
  });

  it("5/10 → [0.2366, 0.7634] (symmetric at p̂ = 0.5)", () => {
    const w = wilson95(5, 10);
    expect(w.rate).toBe(0.5);
    expect(w.low).toBeCloseTo(0.2366, 3);
    expect(w.high).toBeCloseTo(0.7634, 3);
  });

  it("1/10 → [0.0179, 0.4042]", () => {
    const w = wilson95(1, 10);
    expect(w.rate).toBeCloseTo(0.1, 10);
    expect(w.low).toBeCloseTo(0.0179, 3);
    expect(w.high).toBeCloseTo(0.4042, 3);
  });

  it("0/10 → [0, 0.2775]", () => {
    const w = wilson95(0, 10);
    expect(w.low).toBe(0);
    expect(w.high).toBeCloseTo(0.2775, 3);
  });

  it("2/4 → [0.1500, 0.8500] (the ambiguous base-protocol case)", () => {
    const w = wilson95(2, 4);
    expect(w.rate).toBe(0.5);
    expect(w.low).toBeCloseTo(0.15, 3);
    expect(w.high).toBeCloseTo(0.85, 3);
  });

  it("3/4 → [0.3006, 0.9544]", () => {
    const w = wilson95(3, 4);
    expect(w.rate).toBe(0.75);
    expect(w.low).toBeCloseTo(0.3006, 3);
    expect(w.high).toBeCloseTo(0.9544, 3);
  });
});

describe("wilson95 — invariants and guards", () => {
  it("always satisfies 0 <= low <= rate <= high <= 1", () => {
    for (let n = 1; n <= 12; n++) {
      for (let s = 0; s <= n; s++) {
        const w = wilson95(s, n);
        expect(w.low).toBeGreaterThanOrEqual(0);
        expect(w.low).toBeLessThanOrEqual(w.rate + 1e-12);
        expect(w.rate).toBeLessThanOrEqual(w.high + 1e-12);
        expect(w.high).toBeLessThanOrEqual(1);
      }
    }
  });

  it("interval narrows as n grows at the same rate", () => {
    const small = wilson95(2, 4);
    const large = wilson95(20, 40);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("n = 0 → maximum uncertainty [0, 1], never NaN", () => {
    const w = wilson95(0, 0);
    expect(w).toEqual({ rate: 0, low: 0, high: 1, n: 0 });
  });

  it("clamps successes into [0, n] and tolerates non-finite input", () => {
    expect(wilson95(99, 4).rate).toBe(1);
    expect(wilson95(-3, 4).rate).toBe(0);
    expect(wilson95(Number.NaN, 4).rate).toBe(0);
    expect(wilson95(2, Number.NaN)).toEqual({ rate: 0, low: 0, high: 1, n: 0 });
  });
});

describe("aggregateIntentEngine", () => {
  it("sums runs of an intent's formulations per engine (2/4 from two 1/2 formulations)", () => {
    const stats = aggregateIntentEngine([
      { intentId: "local_best", provider: "openai", successes: 1, runs: 2 },
      { intentId: "local_best", provider: "openai", successes: 1, runs: 2 },
    ]);
    expect(stats).toHaveLength(1);
    const s = stats[0]!;
    expect(s).toMatchObject({ intentId: "local_best", provider: "openai", successes: 2, n: 4, formulations: 2 });
    expect(s.citationRate).toBe(0.5);
    // Must equal wilson95(2, 4) exactly — the CI is derived, not restated.
    const w = wilson95(2, 4);
    expect(s.ciLow).toBe(w.low);
    expect(s.ciHigh).toBe(w.high);
  });

  it("keeps engines separate and sorts deterministically (intent asc, provider asc)", () => {
    const stats = aggregateIntentEngine([
      { intentId: "b_intent", provider: "serp", successes: 2, runs: 2 },
      { intentId: "a_intent", provider: "openai", successes: 0, runs: 2 },
      { intentId: "a_intent", provider: "anthropic", successes: 1, runs: 2 },
    ]);
    expect(stats.map((s) => `${s.intentId}|${s.provider}`)).toEqual([
      "a_intent|anthropic",
      "a_intent|openai",
      "b_intent|serp",
    ]);
  });

  it("skips rows without an intent and rows with no runs", () => {
    const stats = aggregateIntentEngine([
      { intentId: null, provider: "openai", successes: 1, runs: 2 },
      { intentId: "x", provider: "openai", successes: 1, runs: 0 },
      { intentId: "x", provider: "openai", successes: 1, runs: 2 },
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ successes: 1, n: 2, formulations: 1 });
  });

  it("clamps per-row successes to that row's runs", () => {
    const stats = aggregateIntentEngine([
      { intentId: "x", provider: "openai", successes: 7, runs: 2 },
    ]);
    expect(stats[0]).toMatchObject({ successes: 2, n: 2 });
  });
});
