/**
 * trend-comparability.test.ts — Visibility Loop v2 Phase 2.
 *
 * The founder's own history is the fixture class under test: a 31/08 run
 * without anthropic (4 engines / 42 checks) sat between 5-engine runs of
 * 49-55 checks, and the chart read it as "you lost ground". The contract:
 * only runs with the SAME pinned engine panel + check-count band belong on
 * the trend line; everything else is excluded WITH a stated reason.
 */
import { describe, it, expect } from "vitest";
import {
  markComparableTrend,
  runConfidence,
  CHECK_BAND_FRACTION,
  SMALL_SAMPLE_CHECKS,
  type TrendRunMeta,
} from "../../apps/api/src/lib/trend-comparability";

const FIVE = ["anthropic", "openai", "google", "perplexity", "dataforseo"];
const FOUR = ["openai", "google", "perplexity", "dataforseo"];

const run = (over: Partial<TrendRunMeta>): TrendRunMeta => ({
  auditId: "a",
  recordedAt: "2026-09-01T00:00:00Z",
  providers: FIVE,
  checks: 50,
  comparableFlag: true,
  ...over,
});

describe("markComparableTrend", () => {
  it("keeps a clean same-panel history fully in trend", () => {
    const r = markComparableTrend([
      run({ auditId: "a1", recordedAt: "2026-08-01T00:00:00Z", checks: 49 }),
      run({ auditId: "a2", recordedAt: "2026-08-15T00:00:00Z", checks: 55 }),
      run({ auditId: "a3", recordedAt: "2026-09-01T00:00:00Z", checks: 50 }),
    ]);
    expect(r.marks.every((m) => m.inTrend)).toBe(true);
    expect(r.excluded).toBe(0);
    expect(r.pinnedPanel).toEqual([...FIVE].sort());
  });

  it("excludes a run flagged comparable=false, with the partial reason", () => {
    const r = markComparableTrend([
      run({ auditId: "full", recordedAt: "2026-09-01T00:00:00Z" }),
      run({
        auditId: "partial",
        recordedAt: "2026-08-31T00:00:00Z",
        providers: FOUR,
        checks: 42,
        comparableFlag: false,
      }),
    ]);
    const partial = r.marks.find((m) => m.auditId === "partial");
    expect(partial?.inTrend).toBe(false);
    expect(partial?.reason).toContain("Partial — not comparable");
    expect(r.marks.find((m) => m.auditId === "full")?.inTrend).toBe(true);
  });

  it("excludes a run whose engine panel differs from the pinned one even if its own coverage was full", () => {
    // e.g. anthropic key removed for a while: those runs answered everything
    // they asked (comparable=true for their own panel) but measured 4 engines.
    const r = markComparableTrend([
      run({ auditId: "now5", recordedAt: "2026-09-01T00:00:00Z" }),
      run({ auditId: "was4", recordedAt: "2026-08-20T00:00:00Z", providers: FOUR, checks: 42 }),
    ]);
    const was4 = r.marks.find((m) => m.auditId === "was4");
    expect(was4?.inTrend).toBe(false);
    expect(was4?.reason).toContain("Different engine panel");
  });

  it("pins to the NEWEST full-coverage run's panel", () => {
    const r = markComparableTrend([
      run({ auditId: "old5", recordedAt: "2026-07-01T00:00:00Z" }),
      run({ auditId: "new4", recordedAt: "2026-09-01T00:00:00Z", providers: FOUR, checks: 42 }),
    ]);
    expect(r.pinnedPanel).toEqual([...FOUR].sort());
    expect(r.marks.find((m) => m.auditId === "new4")?.inTrend).toBe(true);
    expect(r.marks.find((m) => m.auditId === "old5")?.inTrend).toBe(false);
  });

  it("excludes a same-panel run whose check count is outside the band", () => {
    const r = markComparableTrend([
      run({ auditId: "a1", recordedAt: "2026-08-01T00:00:00Z", checks: 50 }),
      run({ auditId: "a2", recordedAt: "2026-08-15T00:00:00Z", checks: 52 }),
      run({ auditId: "tiny", recordedAt: "2026-08-20T00:00:00Z", checks: 20 }),
    ]);
    const tiny = r.marks.find((m) => m.auditId === "tiny");
    expect(tiny?.inTrend).toBe(false);
    expect(tiny?.reason).toContain("Check count outside the comparable band");
    // sanity on the constant the reason is derived from
    expect(Math.abs(20 - 50) > 50 * CHECK_BAND_FRACTION).toBe(true);
  });

  it("keeps legacy rows (no coverage, no providers) in trend — never erases history it cannot judge", () => {
    const r = markComparableTrend([
      run({ auditId: "new", recordedAt: "2026-09-01T00:00:00Z" }),
      run({
        auditId: "legacy",
        recordedAt: "2026-06-01T00:00:00Z",
        providers: null,
        checks: null,
        comparableFlag: null,
      }),
    ]);
    expect(r.marks.find((m) => m.auditId === "legacy")?.inTrend).toBe(true);
  });

  it("marks are 1:1 and in the same order as the input rows", () => {
    const rows = [
      run({ auditId: "x", recordedAt: "2026-08-01T00:00:00Z" }),
      run({ auditId: "y", recordedAt: "2026-09-01T00:00:00Z", comparableFlag: false }),
    ];
    const r = markComparableTrend(rows);
    expect(r.marks.map((m) => m.auditId)).toEqual(["x", "y"]);
  });
});

describe("runConfidence", () => {
  it("adds a stability note when the sample is small", () => {
    const c = runConfidence(SMALL_SAMPLE_CHECKS - 5, 4);
    expect(c.stabilityNote).toContain(`${SMALL_SAMPLE_CHECKS - 5} checks`);
  });
  it("stays silent at healthy sample sizes and on unknown counts", () => {
    expect(runConfidence(55, 7).stabilityNote).toBeNull();
    expect(runConfidence(null, null).stabilityNote).toBeNull();
  });
});
