/**
 * gap-classifier.test.ts — audit P0-07 (RELATORIO §5.2, §5.3, §17).
 *
 * The tests that must fail if the classifier or the generator regresses:
 *   - the seven categories of §5.3 and nothing else;
 *   - each row of the table produces its own diagnosis from its own evidence;
 *   - absent data (entity confidence, crawl check, sentiment) is reported as
 *     missing, never read as a zero/negative;
 *   - EVERY generated action names the prompt, the engine, the stored answer,
 *     the hypothesis, the artifact, the owner, the acceptance criteria and the
 *     next recheck;
 *   - a generic template — including the five the audit photographed — is
 *     REFUSED by the specificity guard.
 */
import { describe, it, expect } from "vitest";
import {
  GAP_TYPES,
  GAP_TABLE,
  assertGapTableComplete,
  classifyGap,
  classifyAndGenerate,
  buildVisibilityAction,
  validateActionSpecificity,
  isSpecificAction,
  assertActionsSpecific,
  isOffsiteSource,
  RECHECK_DAYS,
  type NormalizedObservation,
  type GapSignals,
  type ActionGeneratorContext,
  type VisibilityAction,
} from "../../packages/llm/src/gap-classifier";

const OBS = (over: Partial<NormalizedObservation> = {}): NormalizedObservation => ({
  auditId: "aud_1",
  promptId: "p_1",
  promptText: "best dental clinic in Muriae for implants",
  engine: "openai",
  modelOrMode: "gpt-5",
  market: "BR",
  locale: "pt-BR",
  runIndex: 0,
  mentioned: false,
  mentionPosition: null,
  cited: false,
  citations: [],
  competitors: [],
  sentiment: "unknown",
  entityConfidence: null,
  falsePositive: false,
  ambiguityReason: null,
  rawAnswerRef: "ans_1",
  latencyMs: 900,
  cost: 0.004,
  methodologyVersion: "v2",
  ...over,
});

const CTX: ActionGeneratorContext = {
  brandId: "br_1",
  brandName: "Acme Dental",
  brandDomain: "acmedental.com",
  auditCompletedAt: "2026-09-04T10:00:00.000Z",
};

describe("the gap table is exactly RELATORIO §5.3", () => {
  it("has the seven categories and no others", () => {
    expect([...GAP_TYPES].sort()).toEqual(
      ["content", "entity", "local", "offsite", "proof", "reputation", "technical"].sort()
    );
  });

  it("every row carries evidence, diagnosis, action, artifact and channel", () => {
    expect(assertGapTableComplete()).toEqual([]);
    for (const t of GAP_TYPES) expect(GAP_TABLE[t].type).toBe(t);
  });

  it("has a recheck window for every type", () => {
    for (const t of GAP_TYPES) expect(RECHECK_DAYS[t]).toBeGreaterThan(0);
  });
});

describe("classifyGap — one row of the table per evidence pattern", () => {
  const signals: GapSignals = { brandName: "Acme Dental", brandDomain: "acmedental.com" };

  it("page not crawlable → technical", () => {
    const c = classifyGap(OBS(), { ...signals, pageCrawlable: false, targetUrl: "https://acmedental.com/implants" });
    expect(c?.gapType).toBe("technical");
    expect(c?.reason).toContain("acmedental.com/implants");
  });

  it("entity confusion → entity, and the mention does not count", () => {
    const c = classifyGap(
      OBS({ mentioned: true, cited: true, falsePositive: true, ambiguityReason: "another Acme, in Texas" }),
      signals
    );
    expect(c?.gapType).toBe("entity");
    expect(c?.reason).toContain("another Acme");
  });

  it("competitor cited from its own content → content gap", () => {
    const c = classifyGap(
      OBS({ competitors: ["Bright Smile"], citations: ["https://brightsmile.com/implants"] }),
      { ...signals, localIntent: false }
    );
    expect(c?.gapType).toBe("content");
    expect(c?.reason).toContain("Bright Smile");
  });

  it("competitor cited from Reddit/G2/YouTube → offsite gap", () => {
    const c = classifyGap(
      OBS({ competitors: ["Bright Smile"], citations: ["https://www.reddit.com/r/dentistry/abc"] }),
      { ...signals, localIntent: false }
    );
    expect(c?.gapType).toBe("offsite");
    expect(c?.reason).toContain("reddit.com");
  });

  it("brand named but not recommended → proof gap", () => {
    const c = classifyGap(OBS({ mentioned: true, cited: false, sentiment: "neutral" }), signals);
    expect(c?.gapType).toBe("proof");
  });

  it("brand named negatively → reputation gap", () => {
    const c = classifyGap(OBS({ mentioned: true, cited: true, sentiment: "negative" }), signals);
    expect(c?.gapType).toBe("reputation");
  });

  it("local-intent prompt lost → local gap", () => {
    const c = classifyGap(OBS({ citations: ["https://brightsmile.com/x"] }), { ...signals, localIntent: true });
    expect(c?.gapType).toBe("local");
  });

  it("cited, positive and well placed → no gap at all", () => {
    const c = classifyGap(
      OBS({ mentioned: true, cited: true, mentionPosition: 1, sentiment: "positive", entityConfidence: 0.95 }),
      signals
    );
    expect(c).toBeNull();
  });

  it("a published action that did not move the answer is flagged, not repeated", () => {
    const c = classifyGap(OBS({ competitors: ["Bright Smile"] }), {
      ...signals,
      localIntent: false,
      priorAttempt: { actionId: "va_old", gapType: "content", state: "published", publishedUrl: "https://acmedental.com/implants" },
    });
    expect(c?.failedHypothesis).toBe(true);
  });
});

describe("absent data is never zero (house rule)", () => {
  const signals: GapSignals = { brandName: "Acme Dental" };

  it("a null entityConfidence is NOT read as a confused entity", () => {
    const c = classifyGap(OBS({ entityConfidence: null, competitors: ["Bright Smile"] }), { ...signals, localIntent: false });
    expect(c?.gapType).not.toBe("entity");
    expect(c?.missingSignals.join(" ")).toContain("entity confidence");
  });

  it("an unchecked crawl status is NOT read as a technical block", () => {
    const c = classifyGap(OBS({ competitors: ["Bright Smile"] }), { ...signals, localIntent: false });
    expect(c?.gapType).not.toBe("technical");
    expect(c?.missingSignals.join(" ")).toContain("crawl/index check");
  });

  it("no sources at all is still a gap, with the confidence saying the evidence is thin", () => {
    const c = classifyGap(OBS(), { ...signals, localIntent: false });
    expect(c?.gapType).toBe("content");
    expect(c!.confidence).toBeLessThan(0.5);
    expect(c?.missingSignals.join(" ")).toContain("cited sources");
  });
});

describe("every generated action carries its own evidence (RELATORIO §3.1 list)", () => {
  const obs = OBS({ competitors: ["Bright Smile"], citations: ["https://brightsmile.com/implants"] });
  const cls = classifyGap(obs, { ...CTX, localIntent: false })!;
  const action = buildVisibilityAction(obs, cls, { ...CTX, localIntent: false });

  it("names the lost prompt, the engine, the winner and the stored answer", () => {
    expect(action.evidence.lostPrompt).toBe(obs.promptText);
    expect(action.evidence.observedAnswerId).toBe("ans_1");
    expect(action.evidence.winningBrands).toContain("Bright Smile");
    expect(action.evidence.citedSources).toContain("brightsmile.com");
    expect(action.recommendation).toContain(obs.promptText);
    expect(action.recommendation).toContain("openai");
  });

  it("carries hypothesis, artifact, channel, owner, effort, impact, confidence and priority", () => {
    expect(action.hypothesis.length).toBeGreaterThan(20);
    expect(action.artifactType).toBe(GAP_TABLE.content.artifactType);
    expect(action.channel).toBe(GAP_TABLE.content.channel);
    expect(action.ownerType).toBeTruthy();
    expect(["S", "M", "L"]).toContain(action.effort);
    expect(action.impact).toBeGreaterThan(0);
    expect(action.confidence).toBeGreaterThan(0);
    expect(action.priority).toBeGreaterThan(0);
  });

  it("carries acceptance criteria and a verification plan with a next recheck", () => {
    expect(action.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(action.verificationPlan.promptIds).toEqual(["p_1"]);
    expect(Date.parse(action.verificationPlan.earliestCheckAt)).toBeGreaterThan(
      Date.parse(CTX.auditCompletedAt)
    );
    expect(action.verificationPlan.successCondition).toContain("Acme Dental");
    expect(action.verificationPlan.maxAttemptsBeforeReplan).toBeGreaterThan(0);
  });

  it("starts as proposed — nothing is born verified", () => {
    expect(action.state).toBe("proposed");
  });

  it("is deterministic: the same evidence yields the same id", () => {
    const again = buildVisibilityAction(obs, cls, { ...CTX, localIntent: false });
    expect(again.id).toBe(action.id);
  });

  it("passes the specificity guard", () => {
    expect(validateActionSpecificity(action)).toEqual([]);
    expect(isSpecificAction(action)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE test the audit demands: a generic template is refused.
// ---------------------------------------------------------------------------

const GENERIC_FROM_THE_AUDIT = [
  "Publish content in answer format",
  "Create presence on Wikipedia, LinkedIn and G2",
  "Audit profile consistency",
  "Publish weekly",
  "Activate weekly monitoring",
];

describe("generic templates are refused (RELATORIO §3.1)", () => {
  const good = buildVisibilityAction(
    OBS({ competitors: ["Bright Smile"], citations: ["https://brightsmile.com/x"] }),
    classifyGap(OBS({ competitors: ["Bright Smile"], citations: ["https://brightsmile.com/x"] }), {
      ...CTX,
      localIntent: false,
    })!,
    { ...CTX, localIntent: false }
  );

  for (const template of GENERIC_FROM_THE_AUDIT) {
    it(`refuses "${template}"`, () => {
      const bad: VisibilityAction = { ...good, recommendation: template };
      const problems = validateActionSpecificity(bad);
      expect(problems.length).toBeGreaterThan(0);
      expect(isSpecificAction(bad)).toBe(false);
      expect(() => assertActionsSpecific([bad])).toThrow(/refused/);
    });
  }

  it("refuses a long recommendation that never quotes the lost prompt", () => {
    const bad: VisibilityAction = {
      ...good,
      recommendation:
        "Improve your content strategy by publishing more helpful material about your services on a regular cadence.",
    };
    const fields = validateActionSpecificity(bad).map((p) => p.problem).join(" ");
    expect(fields).toContain("does not quote the lost prompt");
  });

  it("refuses an action with no pointer to the stored answer", () => {
    const bad: VisibilityAction = { ...good, evidence: { ...good.evidence, observedAnswerId: "" } };
    expect(validateActionSpecificity(bad).some((p) => p.field === "evidence.observedAnswerId")).toBe(true);
  });

  it("refuses an action with no acceptance criteria or no recheck date", () => {
    expect(validateActionSpecificity({ ...good, acceptanceCriteria: [] }).length).toBeGreaterThan(0);
    expect(
      validateActionSpecificity({
        ...good,
        verificationPlan: { ...good.verificationPlan, earliestCheckAt: "not a date" },
      }).length
    ).toBeGreaterThan(0);
  });
});

describe("classifyAndGenerate", () => {
  it("produces one action per prompt per gap type and never a refused one", () => {
    const observations = [
      OBS({ engine: "openai", competitors: ["Bright Smile"], citations: ["https://brightsmile.com/a"] }),
      OBS({ engine: "anthropic", runIndex: 1, competitors: ["Bright Smile"], citations: ["https://brightsmile.com/a"] }),
      OBS({
        promptId: "p_2",
        promptText: "who does same-day implants near me",
        engine: "google",
        citations: ["https://www.reddit.com/r/x"],
        competitors: ["Bright Smile"],
      }),
      OBS({ promptId: "p_3", promptText: "acme dental reviews", mentioned: true, cited: true, mentionPosition: 1, sentiment: "positive", entityConfidence: 0.9 }),
    ];
    const out = classifyAndGenerate(observations, { ...CTX, localIntent: false });
    expect(out.clean).toBe(1); // p_3 has no gap
    expect(out.actions).toHaveLength(2); // p_1 (content) and p_2 (offsite)
    expect(out.refused).toEqual([]);
    expect(out.byType.content).toBe(1);
    expect(out.byType.offsite).toBe(1);
    for (const a of out.actions) expect(validateActionSpecificity(a)).toEqual([]);
  });

  it("sorts by priority and keeps every gap accounted for", () => {
    const out = classifyAndGenerate(
      [OBS({ competitors: ["A"] }), OBS({ promptId: "p_9", promptText: "cheapest implants in Muriae", competitors: [] })],
      { ...CTX, localIntent: false }
    );
    const priorities = out.actions.map((a) => a.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    expect(out.actions.length + out.refused.length).toBe(2);
  });
});

describe("offsite source detection", () => {
  it("knows the community/review/video sources", () => {
    expect(isOffsiteSource("reddit.com")).toBe(true);
    expect(isOffsiteSource("www.g2.com".replace(/^www\./, ""))).toBe(true);
    expect(isOffsiteSource("youtube.com")).toBe(true);
    expect(isOffsiteSource("acmedental.com")).toBe(false);
    expect(isOffsiteSource("")).toBe(false);
  });
});
