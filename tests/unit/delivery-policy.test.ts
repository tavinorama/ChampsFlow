/**
 * delivery-policy.test.ts — audit P0-01 (RELATORIO §3.1 lines 100–110, §16).
 *
 * The invariant, and the three things that must be true when it breaks:
 * an investigation opens, Delivery Health can see it, and the client is told
 * the honest sentence instead of "All caught up".
 */
import { describe, it, expect } from "vitest";
import {
  DELIVERY_LOOP_BROKEN,
  DEFAULT_VISIBILITY_TARGET,
  VISIBILITY_TARGET_ENV,
  INVESTIGATION_GAP,
  evaluateDoNextPolicy,
  resolveVisibilityTarget,
  rollupDoNextInvariant,
  type DoNextPolicyInput,
} from "../../packages/llm/src/delivery-policy";

const TARGET = resolveVisibilityTarget({});

const INPUT = (over: Partial<DoNextPolicyInput> = {}): DoNextPolicyInput => ({
  brandId: "br_1",
  auditId: "aud_1",
  visibilityScore: 80,
  target: TARGET,
  lostIntentCount: 0,
  criticalProfileMissing: false,
  openActionCount: 0,
  activeInvestigation: false,
  loopGeneration: { status: "ok", at: "2026-09-04T10:00:00.000Z" },
  ...over,
});

describe("the visibility target is configuration, not a constant in a branch", () => {
  it("defaults to the number the GEO plan already promises the client", () => {
    expect(DEFAULT_VISIBILITY_TARGET).toBe(50);
    expect(resolveVisibilityTarget({})).toEqual({ value: 50, source: "default" });
  });

  it("reads the env var", () => {
    expect(resolveVisibilityTarget({ [VISIBILITY_TARGET_ENV]: "65" })).toEqual({ value: 65, source: "env" });
  });

  it("prefers a per-brand target", () => {
    expect(resolveVisibilityTarget({ [VISIBILITY_TARGET_ENV]: "65" }, 40)).toEqual({ value: 40, source: "brand" });
  });

  it("never swallows an unusable configured value", () => {
    const t = resolveVisibilityTarget({ [VISIBILITY_TARGET_ENV]: "banana" });
    expect(t.source).toBe("default");
    expect(t.invalidValue).toBe("banana");
  });
});

describe("the invariant of RELATORIO §3.1", () => {
  it("holds when there is no gap, the generator ran, and nothing is open", () => {
    const v = evaluateDoNextPolicy(INPUT());
    expect(v.code).toBe("OK");
    expect(v.mayShowAllCaughtUp).toBe(true);
    expect(v.clientMessage).toContain("All caught up");
    expect(v.investigation).toBeNull();
  });

  it("breaks when visibility is below target and nothing is open", () => {
    const v = evaluateDoNextPolicy(INPUT({ visibilityScore: 20 }));
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.materialGap).toBe(true);
    expect(v.mayShowAllCaughtUp).toBe(false);
    expect(v.reasons.join(" ")).toContain("below the target of 50");
  });

  it("breaks when buyer questions are lost and nothing is open", () => {
    const v = evaluateDoNextPolicy(INPUT({ lostIntentCount: 4 }));
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.reasons.join(" ")).toContain("4 buyer questions");
  });

  it("breaks when a critical profile is missing and nothing is open", () => {
    expect(evaluateDoNextPolicy(INPUT({ criticalProfileMissing: true })).code).toBe(DELIVERY_LOOP_BROKEN);
  });

  it("holds when the same gap already has an open action", () => {
    const v = evaluateDoNextPolicy(INPUT({ visibilityScore: 20, lostIntentCount: 9, openActionCount: 3 }));
    expect(v.code).toBe("OK");
    expect(v.mayShowAllCaughtUp).toBe(false); // there IS work — never "caught up"
    expect(v.clientMessage).toContain("3 actions are open");
  });

  it("holds when an investigation is already active", () => {
    const v = evaluateDoNextPolicy(INPUT({ visibilityScore: 20, activeInvestigation: true }));
    expect(v.code).toBe("OK");
    expect(v.mayShowAllCaughtUp).toBe(false);
  });
});

describe("a fail-soft generator can no longer hide (the #574 hole)", () => {
  it("a failed generation is DELIVERY_LOOP_BROKEN even with a perfect score", () => {
    const v = evaluateDoNextPolicy(
      INPUT({
        visibilityScore: 100,
        loopGeneration: { status: "failed", at: "2026-09-04T10:00:00.000Z", detail: "column vector violates check" },
      })
    );
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.mayShowAllCaughtUp).toBe(false);
    expect(v.reasons.join(" ")).toContain("an empty list here proves nothing");
    expect(v.investigation?.evidence).toContain("column vector violates check");
  });

  it("a generator that never ran cannot produce 'all caught up'", () => {
    const v = evaluateDoNextPolicy(INPUT({ loopGeneration: { status: "never_ran", at: null } }));
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.mayShowAllCaughtUp).toBe(false);
  });

  it("a run with no probe evidence is reported, not treated as a clean bill", () => {
    const v = evaluateDoNextPolicy(INPUT({ loopGeneration: { status: "no_evidence", at: "2026-09-04T10:00:00.000Z" } }));
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.reasons.join(" ")).toContain("no probe evidence");
  });
});

describe("absent data is never zero and never green", () => {
  it("an unmeasured visibility score does not mean the client is caught up", () => {
    const v = evaluateDoNextPolicy(INPUT({ visibilityScore: null }));
    expect(v.materialGapUnknown).toBe(true);
    expect(v.materialGap).toBe(false); // unknown is not the same as proven-bad
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
    expect(v.mayShowAllCaughtUp).toBe(false);
    expect(v.reasons.join(" ")).toContain("unknown is not zero");
  });

  it("an unreadable lost-intent count is reported, not counted as zero", () => {
    const v = evaluateDoNextPolicy(INPUT({ lostIntentCount: null }));
    expect(v.materialGapUnknown).toBe(true);
    expect(v.code).toBe(DELIVERY_LOOP_BROKEN);
  });
});

describe("what the client is told", () => {
  it("never says 'all caught up' while the loop is broken", () => {
    const v = evaluateDoNextPolicy(INPUT({ visibilityScore: 12 }));
    expect(v.clientMessage.toLowerCase()).not.toContain("all caught up —");
    expect(v.clientMessage).toContain("generating and reviewing the actions");
  });
});

describe("the investigation card", () => {
  const v = evaluateDoNextPolicy(INPUT({ visibilityScore: 12, lostIntentCount: 5 }));

  it("is opened automatically with a stable key so re-runs refresh it", () => {
    expect(v.investigation).not.toBeNull();
    expect(v.investigation!.gap).toBe(INVESTIGATION_GAP);
    expect(evaluateDoNextPolicy(INPUT({ visibilityScore: 3 })).investigation!.gap).toBe(INVESTIGATION_GAP);
  });

  it("is owned by the platform and states the reasons as evidence", () => {
    expect(v.investigation!.owner).toBe("platform");
    expect(v.investigation!.evidence).toContain(DELIVERY_LOOP_BROKEN);
    expect(v.investigation!.evidence).toContain("below the target");
    expect(v.investigation!.metric.length).toBeGreaterThan(10);
  });

  it("asks nothing of the client", () => {
    expect(v.investigation!.action).toContain("Nothing is required from you");
  });
});

describe("the aggregate Delivery Health reads", () => {
  it("counts holding vs broken and never invents a rate from nothing", () => {
    const r = rollupDoNextInvariant([
      { brandId: "a", verdict: evaluateDoNextPolicy(INPUT()) },
      { brandId: "b", verdict: evaluateDoNextPolicy(INPUT({ visibilityScore: 10 })) },
    ]);
    expect(r.total).toBe(2);
    expect(r.holding).toBe(1);
    expect(r.broken.map((x) => x.brandId)).toEqual(["b"]);
    expect(r.rate).toBe(0.5);
    expect(rollupDoNextInvariant([]).rate).toBeNull();
  });
});
