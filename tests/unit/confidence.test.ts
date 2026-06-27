/**
 * Unit tests for the probe confidence-derivation rule (capability #84).
 *
 * Rule under test (apps/web/src/lib/confidence.ts):
 *  - runsCount null or ≤ 1          → "single sample"  (level: "single")
 *  - mentionRate null, runsCount > 1 → "single sample"  (level: "single") — honest fallback
 *  - mentionRate === 1.0             → "High confidence (N/N runs)"  (level: "high")
 *  - mentionRate === 0.0             → "High confidence (0/N runs)"  (level: "high")
 *  - otherwise (split)              → "Low confidence — volatile (X/N runs)"  (level: "low")
 *
 * NEVER implies more certainty than the data supports.
 */

import { describe, it, expect } from "vitest";
import { confidenceLabel } from "../../apps/web/src/lib/confidence";

describe("confidenceLabel", () => {
  // ── Single-sample cases ────────────────────────────────────────────────────

  it("returns 'single sample' when runsCount is null", () => {
    const result = confidenceLabel(1.0, null);
    expect(result.level).toBe("single");
    expect(result.text).toBe("single sample");
  });

  it("returns 'single sample' when runsCount is 1 (only one run)", () => {
    const result = confidenceLabel(1.0, 1);
    expect(result.level).toBe("single");
    expect(result.text).toBe("single sample");
  });

  it("returns 'single sample' when runsCount is 0 (edge case — no runs recorded)", () => {
    const result = confidenceLabel(0.0, 0);
    expect(result.level).toBe("single");
    expect(result.text).toBe("single sample");
  });

  it("returns 'single sample' when mentionRate is null even if runsCount > 1 (rate not recorded)", () => {
    // This is the key honesty requirement: multi-run but no rate data → still single sample.
    const result = confidenceLabel(null, 3);
    expect(result.level).toBe("single");
    expect(result.text).toBe("single sample");
  });

  // ── High-confidence cases ──────────────────────────────────────────────────

  it("returns 'high' when mentionRate === 1.0 with 3 runs (brand mentioned in every run)", () => {
    const result = confidenceLabel(1.0, 3);
    expect(result.level).toBe("high");
    expect(result.text).toBe("High confidence (3/3 runs)");
  });

  it("returns 'high' when mentionRate === 1.0 with 5 runs", () => {
    const result = confidenceLabel(1.0, 5);
    expect(result.level).toBe("high");
    expect(result.text).toBe("High confidence (5/5 runs)");
  });

  it("returns 'high' when mentionRate === 0.0 with 3 runs (brand absent in every run)", () => {
    // All runs agreed the brand was NOT cited — that is consistent, hence high confidence.
    const result = confidenceLabel(0.0, 3);
    expect(result.level).toBe("high");
    expect(result.text).toBe("High confidence (0/3 runs)");
  });

  it("returns 'high' when mentionRate === 0.0 with 5 runs", () => {
    const result = confidenceLabel(0.0, 5);
    expect(result.level).toBe("high");
    expect(result.text).toBe("High confidence (0/5 runs)");
  });

  // ── Low-confidence / volatile cases ───────────────────────────────────────

  it("returns 'low' when mentionRate is 1/3 (volatile — only 1 of 3 runs cited the brand)", () => {
    const rate = 1 / 3;
    const result = confidenceLabel(rate, 3);
    expect(result.level).toBe("low");
    expect(result.text).toBe("Low confidence — volatile (1/3 runs)");
  });

  it("returns 'low' when mentionRate is 2/3 (volatile — 2 of 3 runs cited the brand)", () => {
    const rate = 2 / 3;
    const result = confidenceLabel(rate, 3);
    expect(result.level).toBe("low");
    expect(result.text).toBe("Low confidence — volatile (2/3 runs)");
  });

  it("returns 'low' when mentionRate is 0.4 with 5 runs (2 of 5 runs cited)", () => {
    const result = confidenceLabel(0.4, 5);
    expect(result.level).toBe("low");
    expect(result.text).toBe("Low confidence — volatile (2/5 runs)");
  });

  it("returns 'low' when mentionRate is 0.6 with 5 runs (3 of 5 runs cited — majority but not unanimous)", () => {
    const result = confidenceLabel(0.6, 5);
    expect(result.level).toBe("low");
    expect(result.text).toBe("Low confidence — volatile (3/5 runs)");
  });

  // ── Never fabricates certainty ─────────────────────────────────────────────

  it("never returns level 'high' for split results (data integrity guard)", () => {
    const splitCases: Array<[number, number]> = [
      [1 / 3, 3],
      [2 / 3, 3],
      [0.5, 2],
      [0.4, 5],
      [0.8, 5],
    ];
    for (const [rate, runs] of splitCases) {
      const result = confidenceLabel(rate, runs);
      expect(result.level).not.toBe("high");
    }
  });

  it("never returns level 'single' for genuine multi-run unanimous results", () => {
    expect(confidenceLabel(1.0, 3).level).not.toBe("single");
    expect(confidenceLabel(0.0, 3).level).not.toBe("single");
  });
});
