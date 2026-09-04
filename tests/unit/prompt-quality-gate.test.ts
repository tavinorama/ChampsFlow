/**
 * prompt-quality-gate.test.ts — P0-06: what may enter the score's denominator.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUALITY_GATE,
  evaluatePrompt,
  containment,
  jaccard,
  mentionsBrand,
  normaliseTokens,
  promptSimilarity,
  runQualityGate,
  type QualityGateContext,
} from "../../packages/llm/src/prompt-quality-gate";
import {
  PROMPT_UNIVERSE_VERSION,
  type PromptDefinition,
} from "../../packages/llm/src/prompt-universe";
import { buildOzvorUniverse } from "../../packages/llm/src/prompt-universe-ozvor";

const NOW = "2026-09-03T00:00:00.000Z";
const CTX: QualityGateContext = { now: NOW, brandNames: ["Ozvor", "OrganicPosts"] };

function def(over: Partial<PromptDefinition> = {}): PromptDefinition {
  return {
    id: "p1",
    text: "Which tools track how a brand appears in AI search answers?",
    cohort: "benchmark",
    intent: "discovery",
    vertical: "geo",
    market: "US",
    locale: "en-US",
    funnelStage: "awareness",
    demand: null,
    businessValue: 0.8,
    relevanceScore: 0.9,
    branded: false,
    expectedCompetitors: [],
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: null,
    version: PROMPT_UNIVERSE_VERSION,
    approvedBy: "founder",
    ownerType: "ozvor",
    archivedAt: null,
    archivedReason: null,
    ...over,
  };
}

const codes = (p: PromptDefinition, ctx: QualityGateContext = CTX) =>
  evaluatePrompt(p, ctx).violations.map((v) => v.code);

describe("evaluatePrompt — a good prompt passes clean", () => {
  it("accepts with no violations", () => {
    const v = evaluatePrompt(def(), CTX);
    expect(v.accepted).toBe(true);
    expect(v.violations).toEqual([]);
  });
});

describe("1. relevance floor", () => {
  it("rejects below the floor and names the number", () => {
    const v = evaluatePrompt(def({ relevanceScore: 0.2 }), CTX);
    expect(v.accepted).toBe(false);
    expect(v.violations[0]?.code).toBe("relevance_below_floor");
    expect(v.violations[0]?.message).toContain("0.5");
  });

  it("accepts exactly at the floor", () => {
    expect(codes(def({ relevanceScore: DEFAULT_QUALITY_GATE.relevanceFloor }))).toEqual([]);
  });

  it("honours a configured floor", () => {
    const v = evaluatePrompt(def({ relevanceScore: 0.6 }), { ...CTX, config: { relevanceFloor: 0.7 } });
    expect(v.accepted).toBe(false);
  });
});

describe("2. semantic dedupe", () => {
  it("folds SMB/small-business synonyms — the v1 duplicate pair collapses", () => {
    const a = normaliseTokens("What is the best CRM for small businesses?");
    const b = normaliseTokens("Best CRM for SMBs on a budget");
    // Jaccard alone is 0.75 and would let this pair through: the extra
    // qualifier "budget" is punished as if it made a new question. Containment
    // is what catches it.
    expect(jaccard(a, b)).toBeLessThan(DEFAULT_QUALITY_GATE.duplicateThreshold);
    expect(containment(a, b)).toBe(1);
    expect(promptSimilarity(a, b)).toBeGreaterThanOrEqual(
      DEFAULT_QUALITY_GATE.duplicateThreshold
    );
  });

  it("containment stays silent on short prompts — 'best crm' is not a question", () => {
    expect(containment(normaliseTokens("best CRM"), normaliseTokens("best CRM vendors 2026"))).toBe(0);
  });

  it("rejects the second of a near-duplicate pair", () => {
    const r = runQualityGate(
      [
        def({ id: "keep", text: "What is the best CRM for small businesses?" }),
        def({ id: "dupe", text: "Best CRM for SMBs on a budget" }),
      ],
      CTX
    );
    expect(r.accepted.map((p) => p.id)).toEqual(["keep"]);
    expect(r.rejected[0]?.promptId).toBe("dupe");
    expect(r.rejected[0]?.violations.map((v) => v.code)).toContain("near_duplicate_prompt");
    expect(r.rejected[0]?.violations[0]?.message).toContain("confidence interval");
  });

  it("flags an exact duplicate as such", () => {
    const r = runQualityGate([def({ id: "a" }), def({ id: "b" })], CTX);
    expect(r.rejected[0]?.violations.map((v) => v.code)).toContain("duplicate_prompt");
  });

  it("keeps genuinely different questions apart", () => {
    const r = runQualityGate(
      [
        def({ id: "a", text: "Which tools track how a brand appears in AI search answers?" }),
        def({
          id: "b",
          intent: "local",
          text: "How does a local service business get recommended by AI assistants?",
        }),
      ],
      CTX
    );
    expect(r.accepted).toHaveLength(2);
  });

  it("does not let a REJECTED prompt evict its own good replacement", () => {
    const r = runQualityGate(
      [
        def({ id: "bad", text: "What is the best CRM for small businesses?", relevanceScore: 0.1 }),
        def({ id: "good", text: "Best CRM for SMBs on a budget" }),
      ],
      CTX
    );
    expect(r.accepted.map((p) => p.id)).toEqual(["good"]);
  });
});

describe("3. buyer intent", () => {
  it("rejects a missing intent", () => {
    expect(codes(def({ intent: undefined as never }))).toContain("intent_missing");
  });

  it("rejects an intent outside the vocabulary", () => {
    expect(codes(def({ intent: "vibes" as never }))).toContain("intent_unknown");
  });
});

describe("4. language and market coherence", () => {
  it("rejects a pt-BR question tagged market=US", () => {
    const v = codes(
      def({
        text: "Como medir se uma marca aparece nas respostas do ChatGPT?",
        locale: "pt-BR",
        market: "US",
      })
    );
    expect(v).toContain("locale_market_mismatch");
  });

  it("rejects Portuguese TEXT under an en-US locale", () => {
    const v = codes(
      def({ text: "Qual a melhor forma de medir a marca nas respostas?", locale: "en-US", market: "US" })
    );
    expect(v).toContain("locale_language_mismatch");
  });

  it("accepts pt-BR in BR", () => {
    expect(
      codes(
        def({
          text: "Como medir se uma marca aparece nas respostas do ChatGPT?",
          locale: "pt-BR",
          market: "BR",
          intent: "problem",
        })
      )
    ).toEqual([]);
  });

  it("accepts English in a non-English market — English really is searched there", () => {
    expect(codes(def({ locale: "en-GB", market: "PT" }))).toEqual([]);
  });

  it("rejects a locale with no language subtag", () => {
    expect(codes(def({ locale: "" }))).toContain("locale_language_mismatch");
  });

  it("does not accuse a mismatch when the language cannot be detected", () => {
    // No positive signal must never be read as "English", and therefore never
    // as a mismatch against a non-English locale.
    expect(codes(def({ text: "GEO 2026 AI SERP KPI dashboards", locale: "de-DE", market: "DE" }))).toEqual([]);
  });
});

describe("5. branded vs non-branded is explicit AND consistent", () => {
  it("rejects a brand-naming prompt flagged non-branded", () => {
    const v = evaluatePrompt(def({ text: "How does Ozvor compare with other trackers?", branded: false }), CTX);
    expect(v.accepted).toBe(false);
    expect(v.violations[0]?.code).toBe("branded_flag_contradicts_text");
    expect(v.violations[0]?.message).toContain("inflates the citation rate");
  });

  it("rejects a prompt flagged branded that never names the brand", () => {
    expect(codes(def({ branded: true }))).toContain("branded_flag_contradicts_text");
  });

  it("rejects an undeclared branded flag — unknown is not 'non-branded'", () => {
    const v = evaluatePrompt(def({ branded: null as never }), CTX);
    expect(v.violations.map((x) => x.code)).toContain("branded_flag_missing");
  });

  it("accepts a correctly flagged branded prompt", () => {
    expect(
      codes(def({ text: "What is Ozvor and what does it measure?", branded: true, intent: "branded" }))
    ).toEqual([]);
  });

  it("matches aliases and respects word boundaries", () => {
    expect(mentionsBrand("Is OrganicPosts any good?", ["Ozvor", "OrganicPosts"])).toBe(true);
    // "Ozvor" must not fire inside an unrelated longer word.
    expect(mentionsBrand("Ozvorium supplements review", ["Ozvor"])).toBe(false);
  });
});

describe("6. freshness", () => {
  it("rejects an expired prompt", () => {
    const v = evaluatePrompt(def({ validUntil: "2026-08-01T00:00:00.000Z" }), CTX);
    expect(v.accepted).toBe(false);
    expect(v.violations[0]?.code).toBe("expired");
  });

  it("rejects a not-yet-valid prompt", () => {
    expect(codes(def({ validFrom: "2027-01-01T00:00:00.000Z" }))).toContain("not_yet_valid");
  });

  it("WARNS (does not block) when expiry is near", () => {
    const v = evaluatePrompt(def({ validUntil: "2026-09-10T00:00:00.000Z" }), CTX);
    expect(v.accepted).toBe(true);
    expect(v.violations[0]?.code).toBe("expiring_soon");
    expect(v.violations[0]?.severity).toBe("warning");
  });

  it("refuses a nonsense clock rather than guessing", () => {
    expect(() => evaluatePrompt(def(), { ...CTX, now: "nope" })).toThrow(/quality_gate_now_invalid/);
  });
});

describe("demand provenance", () => {
  it("rejects a demand number with a blank source", () => {
    expect(codes(def({ demand: { value: 1200, source: "  " } }))).toContain("demand_without_source");
  });

  it("accepts a demand number with a real source", () => {
    expect(codes(def({ demand: { value: 1200, source: "gsc:2026-08" } }))).toEqual([]);
  });
});

describe("substance", () => {
  it("rejects a stub", () => {
    expect(codes(def({ text: "best?" }))).toContain("text_too_short");
  });
});

describe("the shipped Ozvor universe passes its own gate", () => {
  it("accepts every prompt with no errors", () => {
    const universe = buildOzvorUniverse(NOW);
    const r = runQualityGate(universe, CTX);
    const failures = r.rejected.map((x) => ({
      id: x.promptId,
      codes: x.violations.map((v) => v.code),
    }));
    expect(failures).toEqual([]);
    expect(r.accepted).toHaveLength(universe.length);
  });

  it("contains no near-duplicate pair", () => {
    const universe = buildOzvorUniverse(NOW);
    for (let i = 0; i < universe.length; i += 1) {
      for (let j = i + 1; j < universe.length; j += 1) {
        const sim = promptSimilarity(
          normaliseTokens(universe[i]!.text),
          normaliseTokens(universe[j]!.text)
        );
        expect(sim, `"${universe[i]!.text}" vs "${universe[j]!.text}"`).toBeLessThan(
          DEFAULT_QUALITY_GATE.duplicateThreshold
        );
      }
    }
  });
});

describe("nothing is ever silently dropped", () => {
  it("every rejection carries a code and a human sentence", () => {
    const r = runQualityGate(
      [
        def({ id: "a", relevanceScore: 0.1 }),
        def({ id: "b", validUntil: "2026-01-01T00:00:00.000Z" }),
        def({ id: "c", intent: "vibes" as never }),
      ],
      CTX
    );
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
    for (const v of r.rejected) {
      expect(v.violations.length).toBeGreaterThan(0);
      for (const x of v.violations) {
        expect(x.code).toBeTruthy();
        expect(x.message.length).toBeGreaterThan(20);
      }
    }
  });

  it("verdicts cover every input, accepted ones included", () => {
    const r = runQualityGate([def({ id: "ok" }), def({ id: "bad", relevanceScore: 0 })], CTX);
    expect(r.verdicts.map((v) => v.promptId)).toEqual(["ok", "bad"]);
  });
});
