/**
 * prompt-universe.test.ts — P0-06: cohort composition, freshness, set identity,
 * and the Ozvor workspace archive plan.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_COHORT_MIX,
  PROMPT_UNIVERSE_VERSION,
  composeUniverse,
  largestRemainder,
  parseCohortMixEnv,
  promptSetHash,
  resolveCohortMix,
  type PromptDefinition,
  type PromptCohort,
} from "../../packages/llm/src/prompt-universe";
import {
  OZVOR_RETIRED_PROMPTS,
  buildOzvorUniverse,
  findRetirement,
  planOzvorArchive,
} from "../../packages/llm/src/prompt-universe-ozvor";
import { buildIntentPortfolio } from "../../packages/llm/src/prompt-portfolio";

const NOW = "2026-09-03T00:00:00.000Z";

function def(id: string, cohort: PromptCohort, over: Partial<PromptDefinition> = {}): PromptDefinition {
  return {
    id,
    text: `question ${id}`,
    cohort,
    intent: "discovery",
    vertical: "geo",
    market: "US",
    locale: "en-US",
    funnelStage: "awareness",
    demand: null,
    businessValue: 0.5,
    relevanceScore: 0.8,
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

describe("resolveCohortMix — 60/20/20 is a default, not a law", () => {
  it("defaults to 60/20/20 and says so", () => {
    const r = resolveCohortMix();
    expect(r.mix).toEqual({ benchmark: 0.6, opportunity: 0.2, customer: 0.2 });
    expect(r.source).toBe("default");
    expect(r.notes).toEqual([]);
  });

  it("accepts an override and reports it as an override", () => {
    const r = resolveCohortMix({ benchmark: 0.4, opportunity: 0.4, customer: 0.2 });
    expect(r.mix.benchmark).toBeCloseTo(0.4);
    expect(r.source).toBe("override");
  });

  it("renormalises WITH a note rather than silently reshaping the measurement", () => {
    const r = resolveCohortMix({ benchmark: 3, opportunity: 1, customer: 1 });
    expect(r.mix.benchmark).toBeCloseTo(0.6);
    expect(r.notes[0]).toContain("renormalised");
  });

  it("refuses negative, non-finite and all-zero weights", () => {
    expect(() => resolveCohortMix({ benchmark: -1 })).toThrow(/cohort_mix_invalid/);
    expect(() => resolveCohortMix({ benchmark: Number.NaN })).toThrow(/cohort_mix_invalid/);
    expect(() => resolveCohortMix({ benchmark: 0, opportunity: 0, customer: 0 })).toThrow(
      /sum to 0/
    );
  });

  it("does not mutate the frozen default", () => {
    resolveCohortMix({ benchmark: 0.9, opportunity: 0.05, customer: 0.05 });
    expect(DEFAULT_COHORT_MIX).toEqual({ benchmark: 0.6, opportunity: 0.2, customer: 0.2 });
  });
});

describe("parseCohortMixEnv", () => {
  it("parses a well-formed env string", () => {
    expect(parseCohortMixEnv("benchmark=0.5,opportunity=0.3,customer=0.2")).toEqual({
      benchmark: 0.5,
      opportunity: 0.3,
      customer: 0.2,
    });
  });

  it("returns null for absent/blank input so the caller falls back to the default", () => {
    expect(parseCohortMixEnv(undefined)).toBeNull();
    expect(parseCohortMixEnv("  ")).toBeNull();
  });

  it("throws on a typo instead of silently reshaping the measurement", () => {
    expect(() => parseCohortMixEnv("benchmrk=0.5")).toThrow(/unknown_cohort/);
    expect(() => parseCohortMixEnv("benchmark=abc")).toThrow(/not_a_number/);
    expect(() => parseCohortMixEnv("benchmark")).toThrow(/malformed/);
  });
});

describe("largestRemainder", () => {
  it("allocates exactly `size` slots — no leak, no invented slot", () => {
    for (const size of [0, 1, 3, 7, 10, 11, 13, 100]) {
      const q = largestRemainder({ benchmark: 0.6, opportunity: 0.2, customer: 0.2 }, size);
      expect(q.benchmark + q.opportunity + q.customer).toBe(size);
    }
  });

  it("gives 10 slots the documented 6/2/2", () => {
    expect(largestRemainder({ benchmark: 0.6, opportunity: 0.2, customer: 0.2 }, 10)).toEqual({
      benchmark: 6,
      opportunity: 2,
      customer: 2,
    });
  });
});

describe("composeUniverse", () => {
  const pool = [
    ...Array.from({ length: 8 }, (_, i) => def(`b${i}`, "benchmark")),
    ...Array.from({ length: 5 }, (_, i) => def(`o${i}`, "opportunity")),
    ...Array.from({ length: 5 }, (_, i) => def(`c${i}`, "customer")),
  ];

  it("honours the default mix", () => {
    const r = composeUniverse(pool, { size: 10, now: NOW });
    expect(r.counts).toEqual({ benchmark: 6, opportunity: 2, customer: 2 });
    expect(r.prompts).toHaveLength(10);
    expect(r.mixSource).toBe("default");
    expect(r.version).toBe(PROMPT_UNIVERSE_VERSION);
  });

  it("honours an override mix", () => {
    const r = composeUniverse(pool, {
      size: 10,
      mix: { benchmark: 0.8, opportunity: 0.1, customer: 0.1 },
      now: NOW,
    });
    expect(r.counts.benchmark).toBe(8);
    expect(r.mixSource).toBe("override");
  });

  it("excludes archived prompts and says how many", () => {
    const withArchived = [
      ...pool,
      def("gone", "benchmark", { archivedAt: NOW, archivedReason: "retired" }),
    ];
    const r = composeUniverse(withArchived, { size: 10, now: NOW });
    expect(r.prompts.find((p) => p.id === "gone")).toBeUndefined();
    expect(r.notes.join(" ")).toContain("1 archived prompt(s) excluded");
  });

  it("excludes expired and not-yet-valid prompts", () => {
    const r = composeUniverse(
      [
        def("expired", "benchmark", { validUntil: "2026-01-01T00:00:00.000Z" }),
        def("future", "benchmark", { validFrom: "2027-01-01T00:00:00.000Z" }),
        def("live", "benchmark"),
      ],
      { size: 3, now: NOW }
    );
    expect(r.prompts.map((p) => p.id)).toEqual(["live"]);
    expect(r.notes.join(" ")).toContain("outside their freshness window");
  });

  it("redistributes an unmet quota WITH a note — never a silent 40/20/20", () => {
    const thin = [
      ...Array.from({ length: 8 }, (_, i) => def(`b${i}`, "benchmark")),
      def("o0", "opportunity"),
      // no customer prompts at all — Ozvor's own case
    ];
    const r = composeUniverse(thin, { size: 10, now: NOW });
    expect(r.prompts).toHaveLength(9);
    const notes = r.notes.join(" ");
    expect(notes).toContain('Cohort "customer" could only supply 0 of 2 slots');
    expect(notes).toContain("Universe supplied 9 of 10");
  });

  it("ranks by relevance x business value, deterministically", () => {
    const r = composeUniverse(
      [
        def("low", "benchmark", { relevanceScore: 0.6, businessValue: 0.1 }),
        def("high", "benchmark", { relevanceScore: 0.95, businessValue: 1 }),
        def("mid", "benchmark", { relevanceScore: 0.8, businessValue: 0.5 }),
      ],
      { size: 2, now: NOW }
    );
    expect(r.prompts.map((p) => p.id)).toEqual(["high", "mid"]);
  });

  it("is stable across runs — a reshuffle would itself be an unlabelled change", () => {
    const a = composeUniverse(pool, { size: 10, now: NOW });
    const b = composeUniverse([...pool].reverse(), { size: 10, now: NOW });
    expect(a.setHash).toBe(b.setHash);
  });

  it("rejects a nonsense size or now instead of guessing", () => {
    expect(() => composeUniverse(pool, { size: -1, now: NOW })).toThrow(/compose_size_invalid/);
    expect(() => composeUniverse(pool, { size: 2.5, now: NOW })).toThrow(/compose_size_invalid/);
    expect(() => composeUniverse(pool, { size: 3, now: "not-a-date" })).toThrow(/compose_now_invalid/);
  });
});

describe("promptSetHash", () => {
  it("is order-independent — same questions, same measurement", () => {
    expect(promptSetHash(["a question", "b question"])).toBe(
      promptSetHash(["b question", "a question"])
    );
  });

  it("ignores cosmetic whitespace and case", () => {
    expect(promptSetHash(["  Best  GEO tool ? "])).toBe(promptSetHash(["best geo tool ?"]));
  });

  it("changes when a real question changes", () => {
    expect(promptSetHash(["best geo tool"])).not.toBe(promptSetHash(["best crm tool"]));
  });

  it("changes when a question is added or removed", () => {
    expect(promptSetHash(["a", "b"])).not.toBe(promptSetHash(["a"]));
  });
});

describe("Ozvor workspace universe", () => {
  const universe = buildOzvorUniverse(NOW);

  it("contains no generic SaaS/SMB questions", () => {
    for (const p of universe) {
      expect(findRetirement(p.text), `"${p.text}" is a retired generic prompt`).toBeNull();
      expect(p.text.toLowerCase()).not.toContain("best saas");
    }
  });

  it("covers GEO, AI visibility, brand monitoring, local service and agency", () => {
    const verticals = new Set(universe.map((p) => p.vertical));
    expect(verticals).toContain("geo");
    expect(verticals).toContain("ai-search-visibility");
    expect(verticals).toContain("brand-monitoring");
    expect(verticals).toContain("local-service");
    expect(verticals).toContain("agency");
  });

  it("covers the three markets the company sells into", () => {
    const markets = new Set(universe.map((p) => p.market));
    expect(markets).toContain("US");
    expect(markets).toContain("BR");
    expect(markets).toContain("PT");
  });

  it("declares branded vs non-branded on every prompt, and has both kinds", () => {
    for (const p of universe) expect(typeof p.branded).toBe("boolean");
    expect(universe.some((p) => p.branded)).toBe(true);
    expect(universe.some((p) => !p.branded)).toBe(true);
  });

  it("leaves demand null rather than inventing a number", () => {
    for (const p of universe) expect(p.demand).toBeNull();
  });

  it("keeps 'branded' an intent, never a cohort", () => {
    for (const p of universe) {
      expect(["benchmark", "opportunity", "customer"]).toContain(p.cohort);
    }
    expect(universe.some((p) => p.intent === "branded" && p.cohort === "benchmark")).toBe(true);
  });

  it("bounds the opportunity cohort and leaves benchmark open", () => {
    const opp = universe.filter((p) => p.cohort === "opportunity");
    expect(opp.length).toBeGreaterThan(0);
    for (const p of opp) expect(p.validUntil).not.toBeNull();
  });

  it("ships no customer cohort — those live in the DB, and composition says so", () => {
    expect(universe.filter((p) => p.cohort === "customer")).toHaveLength(0);
    const r = composeUniverse(universe, { size: 10, now: NOW });
    expect(r.notes.join(" ")).toContain('Cohort "customer" could only supply 0');
  });

  it("rejects a nonsense clock rather than silently freezing from epoch 0", () => {
    expect(() => buildOzvorUniverse("nope")).toThrow(/ozvor_universe_now_invalid/);
  });
});

describe("planOzvorArchive — the v1 -> v2 workspace migration", () => {
  it("archives every generic prompt the v1 portfolio generated for a SaaS brand", () => {
    const v1 = buildIntentPortfolio("Ozvor", "SaaS").map((p) => p.text);
    const plan = planOzvorArchive(v1);

    // The two money-question duplicates and the year-stamped vendor list go.
    const archived = plan.archive.map((a) => a.text);
    expect(archived).toContain("What is the best SaaS for small businesses?");
    expect(archived).toContain("Best SaaS for SMBs on a budget");
    expect(archived).toContain("Top SaaS providers in 2026");
    expect(archived).toContain("SaaS alternatives worth considering");
  });

  it("catches the placeholder-category variant too (category = null)", () => {
    const v1 = buildIntentPortfolio("Ozvor", null).map((p) => p.text);
    const archived = planOzvorArchive(v1).archive.map((a) => a.text);
    expect(archived).toContain("What is the best solution for small businesses?");
    expect(archived).toContain("Best solution for SMBs on a budget");
  });

  it("gives every archived prompt a reason — the DB refuses one without", () => {
    const v1 = buildIntentPortfolio("Ozvor", "SaaS").map((p) => p.text);
    for (const a of planOzvorArchive(v1).archive) {
      expect(a.reason.length).toBeGreaterThan(20);
    }
  });

  it("leaves brand-name questions alone — those still measure something real", () => {
    const plan = planOzvorArchive(["Ozvor vs competitors", "Is Ozvor a good choice?"]);
    expect(plan.archive).toHaveLength(0);
    expect(plan.keep).toHaveLength(2);
  });

  it("never deletes: archive + keep together account for every input", () => {
    const v1 = buildIntentPortfolio("Ozvor", "SaaS").map((p) => p.text);
    const plan = planOzvorArchive(v1);
    expect(plan.archive.length + plan.keep.length).toBe(v1.length);
  });

  it("every retirement rule carries a stated reason", () => {
    for (const r of OZVOR_RETIRED_PROMPTS) {
      expect(r.reason.trim().length).toBeGreaterThan(20);
    }
  });
});
