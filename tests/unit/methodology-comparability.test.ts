/**
 * methodology-comparability.test.ts — P0-06.
 *
 * The load-bearing test is "the founder's real history": the four runs
 * measured in production on 2026-09-03 for brand
 * e74fcbc1-a988-4b5d-b054-87329dc881c0. Before this module they were drawn as
 * one falling line. They must now come apart into labelled segments.
 */
import { describe, it, expect } from "vitest";
import {
  classifyMethodologyBreaks,
  compareRuns,
  latestComparablePair,
  BADGE_LABEL,
  type RunMethodMeta,
} from "../../apps/api/src/lib/methodology-comparability";

const run = (o: Partial<RunMethodMeta> & { auditId: string; recordedAt: string }): RunMethodMeta => ({
  methodologyVersion: "2.1",
  promptSetVersion: "2.0",
  promptSetHash: "hash-a",
  engineSet: ["anthropic", "dataforseo", "gemini", "openai", "perplexity"],
  ...o,
});

describe("compareRuns", () => {
  it("labels identical rulers comparable with no reasons", () => {
    const r = compareRuns(run({ auditId: "a", recordedAt: "2026-08-01" }), run({ auditId: "b", recordedAt: "2026-08-02" }));
    expect(r.badge).toBe("comparable");
    expect(r.reasons).toEqual([]);
  });

  it("breaks on an engine-set change and names both panels", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-08-01" }),
      run({
        auditId: "b",
        recordedAt: "2026-08-31",
        engineSet: ["dataforseo", "gemini", "openai", "perplexity"], // no anthropic
      })
    );
    expect(r.badge).toBe("engine_changed");
    expect(r.reasons[0]).toContain("anthropic");
    expect(r.reasons[0]).toContain("different measurement, not a lower one");
  });

  it("ignores engine ORDER and case — same panel is the same ruler", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-08-01", engineSet: ["openai", "Anthropic"] }),
      run({ auditId: "b", recordedAt: "2026-08-02", engineSet: ["anthropic", "OpenAI"] })
    );
    expect(r.badge).toBe("comparable");
  });

  it("breaks on a prompt-set version change", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-08-01", promptSetVersion: "1.0" }),
      run({ auditId: "b", recordedAt: "2026-09-03", promptSetVersion: "2.0" })
    );
    expect(r.badge).toBe("prompt_set_changed");
    expect(r.reasons[0]).toContain("1.0 -> 2.0");
  });

  it("breaks on a prompt-set HASH change even at the same version", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-08-01", promptSetHash: "hash-a" }),
      run({ auditId: "b", recordedAt: "2026-08-02", promptSetHash: "hash-b" })
    );
    expect(r.badge).toBe("prompt_set_changed");
  });

  it("method change outranks the others in the badge but never hides them", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-07-29T09:58:00Z", methodologyVersion: "1.0", engineSet: ["dataforseo"] }),
      run({ auditId: "b", recordedAt: "2026-07-29T14:11:00Z", methodologyVersion: "2.1" })
    );
    expect(r.badge).toBe("method_changed");
    // Both facts survive — the engine change is still reported.
    expect(r.reasons.join(" ")).toContain("Engine panel changed");
    expect(r.reasons.join(" ")).toContain("new baseline");
  });

  it("missing facts become UNKNOWN, never 'same'", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-06-30", methodologyVersion: null, promptSetVersion: null, promptSetHash: null, engineSet: null }),
      run({ auditId: "b", recordedAt: "2026-07-01" })
    );
    expect(r.badge).toBe("unknown");
    expect(r.reasons.join(" ")).toContain("Unknown is not the same as unchanged");
  });

  it("a KNOWN change still wins over unknown — the badge names the change", () => {
    const r = compareRuns(
      run({ auditId: "a", recordedAt: "2026-06-30", methodologyVersion: "1.0", engineSet: null }),
      run({ auditId: "b", recordedAt: "2026-07-29", methodologyVersion: "2.1" })
    );
    expect(r.badge).toBe("method_changed");
    expect(r.reasons.join(" ")).toContain("Also unrecorded");
  });
});

describe("classifyMethodologyBreaks — the founder's real history (2026-09-03)", () => {
  // Measured in production, brand e74fcbc1-a988-4b5d-b054-87329dc881c0.
  const history: RunMethodMeta[] = [
    {
      auditId: "2026-06-30",
      recordedAt: "2026-06-30T12:00:00Z",
      methodologyVersion: "1.0",
      promptSetVersion: null,
      promptSetHash: null,
      engineSet: ["perplexity", "dataforseo"], // only TWO engines. Brand 90.
    },
    {
      auditId: "2026-07-29-0958",
      recordedAt: "2026-07-29T09:58:00Z",
      methodologyVersion: "1.0",
      promptSetVersion: null,
      promptSetHash: null,
      engineSet: ["dataforseo"], // ONE engine. Brand 19.
    },
    {
      auditId: "2026-07-29-1411",
      recordedAt: "2026-07-29T14:11:00Z",
      methodologyVersion: "2.1",
      promptSetVersion: null,
      promptSetHash: null,
      engineSet: ["anthropic", "dataforseo", "gemini", "openai", "perplexity"], // Brand 24.
    },
    {
      auditId: "2026-08-31",
      recordedAt: "2026-08-31T12:00:00Z",
      methodologyVersion: "2.1",
      promptSetVersion: null,
      promptSetHash: null,
      engineSet: ["dataforseo", "gemini", "openai", "perplexity"], // no anthropic.
    },
  ];

  const result = classifyMethodologyBreaks(history);

  it("refuses to draw these four points as one line", () => {
    // Four runs, three ruler changes → four separate segments.
    expect(result.breaks).toBe(3);
    expect(result.segments).toHaveLength(4);
    for (const seg of result.segments) expect(seg).toHaveLength(1);
  });

  it("names 30/06 -> 29/07 09:58 an engine change (2 engines -> 1)", () => {
    const b = result.badges.find((x) => x.auditId === "2026-07-29-0958");
    expect(b?.badge).toBe("engine_changed");
    expect(b?.comparableWithPrevious).toBe(false);
    expect(b?.reasons.join(" ")).toContain("perplexity");
  });

  it("names the same-day 29/07 pair a METHOD change (1.0 -> 2.1)", () => {
    const b = result.badges.find((x) => x.auditId === "2026-07-29-1411");
    expect(b?.badge).toBe("method_changed");
    expect(b?.reasons.join(" ")).toContain("1.0 -> 2.1");
  });

  it("names 31/08 an engine change — the run without anthropic", () => {
    const b = result.badges.find((x) => x.auditId === "2026-08-31");
    expect(b?.badge).toBe("engine_changed");
    expect(b?.reasons.join(" ")).toContain("anthropic");
  });

  it("has NO legitimate delta to report: no two retained runs share a segment", () => {
    // This is the whole point. "71 -> 48" was never a delta anyone could
    // honestly compute from this history.
    expect(latestComparablePair(result)).toBeNull();
  });

  it("the oldest run opens the baseline without claiming anything before it", () => {
    const first = result.badges[0];
    expect(first?.auditId).toBe("2026-06-30");
    expect(first?.badge).toBe("comparable");
    expect(first?.reasons).toEqual([]);
    expect(first?.previousAuditId).toBeNull();
  });
});

describe("classifyMethodologyBreaks — healthy history", () => {
  const runs: RunMethodMeta[] = [
    run({ auditId: "a", recordedAt: "2026-09-01T00:00:00Z" }),
    run({ auditId: "b", recordedAt: "2026-09-02T00:00:00Z" }),
    run({ auditId: "c", recordedAt: "2026-09-03T00:00:00Z" }),
  ];

  it("keeps identical rulers on one line and offers a real delta pair", () => {
    const res = classifyMethodologyBreaks(runs);
    expect(res.breaks).toBe(0);
    expect(res.segments).toEqual([["a", "b", "c"]]);
    const pair = latestComparablePair(res);
    expect(pair?.current.auditId).toBe("c");
    expect(pair?.previous.auditId).toBe("b");
  });

  it("sorts by timestamp regardless of input order", () => {
    const res = classifyMethodologyBreaks([runs[2]!, runs[0]!, runs[1]!]);
    expect(res.badges.map((b) => b.auditId)).toEqual(["a", "b", "c"]);
  });
});

describe("integration with trend-comparability panel marks (PR #582)", () => {
  const runs: RunMethodMeta[] = [
    run({ auditId: "a", recordedAt: "2026-09-01T00:00:00Z" }),
    run({ auditId: "partial", recordedAt: "2026-09-02T00:00:00Z" }),
    run({ auditId: "c", recordedAt: "2026-09-03T00:00:00Z" }),
  ];

  it("defers to an upstream exclusion instead of re-deciding it", () => {
    const res = classifyMethodologyBreaks(runs, {
      panelMarks: [
        { auditId: "a", inTrend: true, reason: null },
        { auditId: "partial", inTrend: false, reason: "Partial — not comparable: one or more engines did not answer this run." },
        { auditId: "c", inTrend: true, reason: null },
      ],
    });

    const excluded = res.badges.find((b) => b.auditId === "partial");
    expect(excluded?.excludedFromTrend).toBe(true);
    // The upstream reason is carried verbatim, not paraphrased or re-derived.
    expect(excluded?.excludedReason).toBe(
      "Partial — not comparable: one or more engines did not answer this run."
    );
    expect(excluded?.segmentIndex).toBe(-1);

    // 'a' and 'c' are the same ruler, so the excluded run does not fracture
    // the line — it is lifted out of it.
    expect(res.segments).toEqual([["a", "c"]]);
    expect(res.breaks).toBe(0);
  });

  it("without panel marks the engine change still breaks the line", () => {
    // The 31/08 case must not wait on another PR to be told the truth.
    const res = classifyMethodologyBreaks([
      run({ auditId: "a", recordedAt: "2026-09-01T00:00:00Z" }),
      run({ auditId: "b", recordedAt: "2026-09-02T00:00:00Z", engineSet: ["openai"] }),
    ]);
    expect(res.breaks).toBe(1);
  });
});

describe("BADGE_LABEL", () => {
  it("carries the four report labels plus the honest fifth state", () => {
    expect(BADGE_LABEL.comparable).toBe("Comparable");
    expect(BADGE_LABEL.method_changed).toBe("Method changed");
    expect(BADGE_LABEL.prompt_set_changed).toBe("Prompt set changed");
    expect(BADGE_LABEL.engine_changed).toBe("Engine changed");
    expect(BADGE_LABEL.unknown).toContain("unknown");
  });
});
