/**
 * design-partner-pack.test.ts — the Design Partner Pack, proved without calling
 * (or paying) a single engine.
 *
 * What these tests are FOR (canal B, approved 2026-09-11):
 *   1. The pack is a MEASUREMENT. With no probe evidence it refuses to render.
 *      There is no sample mode and no filler competitor.
 *   2. The forbidden copy of RELATORIO section 28 cannot ship — in English or
 *      Portuguese — and the ban does not misfire on a prospect's own words.
 *   3. The cost is printed BEFORE anything is called, and the run that was not
 *      confirmed says out loud that nothing was called and nothing was charged.
 *   4. The whole pipeline (recorded answers -> observations -> gap classifier
 *      -> HTML) runs from a fixture, so a regression is caught here and not in
 *      front of a prospect.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDesignPartnerPack,
  renderDesignPartnerPackHtml,
  findForbiddenClaims,
  assertPackCopyClean,
  lintablePackText,
  longSentences,
  packCopy,
  packEvidenceFromAnswers,
  PackEvidenceError,
  PACK_LANGUAGES,
  MAX_ACTIONS,
  MAX_GAP_ROWS,
  type PackInput,
  type PackLanguage,
} from "../../packages/llm/src/design-partner-pack";
import {
  parsePackArgs,
  parseAuditFixture,
  assemblePack,
  forecastPackCost,
  costPreflightLines,
  packSummaryLines,
  normalizeDomain,
  enginesInMockMode,
  DEFAULT_PACK_ENGINES,
} from "../../packages/llm/src/design-partner-cli";
import {
  estimateAuditCost,
  auditCostCents,
  genRateCents,
  forecastAuditCost,
  formatUsd,
} from "../../packages/llm/src/audit-cost";

const FIXTURE_PATH = join(__dirname, "../fixtures/design-partner-audit.json");
const fixtureRaw = (): unknown => JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const BASE_OPTS = {
  company: "Northgate Roofing",
  market: "United States - English",
  language: "en" as PackLanguage,
  bookUrl: "https://ozvor.com/book?from=design-partner",
  contactEmail: "hello@ozvor.com",
};

// ---------------------------------------------------------------------------
// 1. The pack is a measurement — it refuses to invent one
// ---------------------------------------------------------------------------

describe("the pack refuses to exist without evidence", () => {
  const emptyInput = (over: Partial<PackInput> = {}): PackInput => ({
    company: "Acme",
    domain: "acme.com",
    market: "US",
    language: "en",
    generatedAt: "2026-09-11T09:00:00.000Z",
    coverage: { probed: ["openai"], blocked: [], failed: [] },
    findings: [],
    actions: [],
    methodologyVersion: "2.1",
    bookUrl: "https://ozvor.com/book",
    contactEmail: "hello@ozvor.com",
    ...over,
  });

  it("throws when no question was probed — no sample pack exists", () => {
    expect(() => buildDesignPartnerPack(emptyInput())).toThrow(PackEvidenceError);
    expect(() => buildDesignPartnerPack(emptyInput())).toThrow(/measurement/i);
  });

  it("throws when no engine answered, even if findings were passed", () => {
    expect(() =>
      buildDesignPartnerPack(
        emptyInput({
          findings: [
            { question: "q", engine: "openai", cited: false, rank: null, winners: [], sources: [] },
          ],
          coverage: { probed: [], blocked: [], failed: [] },
        })
      )
    ).toThrow(/no engine answered/i);
  });

  it("throws without a company or a domain", () => {
    expect(() => buildDesignPartnerPack(emptyInput({ company: "  " }))).toThrow(/company/i);
    expect(() => buildDesignPartnerPack(emptyInput({ domain: "" }))).toThrow(/domain/i);
  });

  it("says 'no gap found' out loud rather than padding the pack", () => {
    const model = buildDesignPartnerPack(
      emptyInput({
        findings: [
          { question: "best roofer", engine: "openai", cited: true, rank: 1, winners: [], sources: [] },
        ],
      })
    );
    expect(model.noGapFound).toBe(true);
    const html = renderDesignPartnerPackHtml(model);
    expect(html).toContain(packCopy("en").noGapLine);
  });
});

// ---------------------------------------------------------------------------
// 2. Forbidden copy — RELATORIO section 28
// ---------------------------------------------------------------------------

describe("forbidden copy (RELATORIO section 28) cannot ship", () => {
  const banned: [string, string][] = [
    ["guaranteed rankings", "We deliver guaranteed rankings for your brand."],
    ["guarantee + citations", "Our guarantee: citations on every engine."],
    ["rankings ... guaranteed", "Top rankings, guaranteed."],
    ["we improve your score", "We improve your score every month."],
    ["we will raise the score", "We will raise your score in the first sprint."],
    ["live signals", "Watch your live signals update in the dashboard."],
    ["all caught up", "Nothing to do here — you are all caught up."],
    ["full audit", "Buy the full audit for $49."],
    ["citation deadline", "You will be cited within 30 days."],
    ["ranked in N weeks", "You will be ranked in 2 weeks."],
    ["number one promise", "We will get you to #1 on ChatGPT."],
    ["pt garantia", "Ranking garantido para a sua marca."],
    ["pt melhorar score", "Nos melhoramos seu score todo mes."],
    ["pt sinais ao vivo", "Acompanhe os sinais ao vivo no painel."],
    ["pt tudo em dia", "Esta tudo em dia por aqui."],
    ["pt auditoria completa", "Compre a auditoria completa por R$ 49."],
    ["pt prazo de citacao", "Voce sera citado em 30 dias."],
  ];

  it.each(banned)("catches %s", (_label, text) => {
    const hits = findForbiddenClaims(text);
    expect(hits.length, `"${text}" should have been refused`).toBeGreaterThan(0);
  });

  it("sees through HTML tags — a tag boundary is not an escape hatch", () => {
    expect(findForbiddenClaims("<strong>guaranteed</strong> rankings").length).toBeGreaterThan(0);
    expect(findForbiddenClaims("we <em>improve</em> your score").length).toBeGreaterThan(0);
    expect(findForbiddenClaims("<p>we improve your <b>score</b></p>").length).toBeGreaterThan(0);
  });

  it("does NOT misfire on honest copy we do use", () => {
    const ok = [
      "We do not promise a ranking or a citation.",
      "We do not promise a date for either one.",
      "AI answers are probabilistic. Anyone promising more is guessing.",
      "We re-ask the same questions and show you what moved.",
      "Nao prometemos ranking nem citacao.",
      "Nao prometemos data para nenhum dos dois.",
    ];
    for (const line of ok) expect(findForbiddenClaims(line), line).toEqual([]);
  });

  it("assertPackCopyClean throws with the offending phrase in the message", () => {
    expect(() => assertPackCopyClean("guaranteed rankings for everyone")).toThrow(
      /guaranteed-rankings/
    );
  });

  it.each(PACK_LANGUAGES)("the whole rendered pack is clean in %s", (language) => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, { ...BASE_OPTS, language });
    expect(findForbiddenClaims(lintablePackText(pack.model))).toEqual([]);
  });

  it("a prospect's OWN banned words do not block the pack (evidence is not a promise)", () => {
    const raw = fixtureRaw() as Record<string, unknown>;
    const answers = raw["answers"] as Record<string, unknown>[];
    // A real buyer question can say this. Quoting it back is a measurement.
    answers[0]!["question"] = "Which roofer offers guaranteed rankings and a full audit?";
    const record = parseAuditFixture(raw);
    expect(() => assemblePack(record, BASE_OPTS)).not.toThrow();
    const pack = assemblePack(record, BASE_OPTS);
    // It IS shown to the reader...
    expect(pack.html).toContain("guaranteed rankings and a full audit");
    // ...and it is NOT what the lint reads.
    expect(findForbiddenClaims(lintablePackText(pack.model))).toEqual([]);
  });

  it("a banned phrase in OUR copy still throws at render time", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    const poisoned = { ...pack.model, offer: [...pack.model.offer, "Rankings guaranteed."] };
    expect(() => renderDesignPartnerPackHtml(poisoned)).toThrow(/Forbidden copy/);
  });
});

// ---------------------------------------------------------------------------
// 3. House copy standard
// ---------------------------------------------------------------------------

describe("house copy standard (sentences of 12 words or fewer)", () => {
  it.each(PACK_LANGUAGES)("%s copy respects the sentence cap", (language) => {
    const c = packCopy(language);
    const ours = [
      c.gapsTitle,
      c.actionsIntro,
      c.noGapLine,
      c.planIntro,
      c.notPromisedIntro,
      c.ctaLine,
      ...c.weeks.flatMap((w) => w.lines),
      ...c.notPromised,
      ...c.offer,
    ].join("\n");
    expect(longSentences(ours)).toEqual([]);
  });

  it("longSentences actually catches a long one", () => {
    const long =
      "This sentence has far too many words in it to ever pass the house copy standard we agreed.";
    expect(longSentences(long)).toHaveLength(1);
  });

  it("action headlines stay short in both languages", () => {
    for (const language of PACK_LANGUAGES) {
      const record = parseAuditFixture(fixtureRaw());
      const pack = assemblePack(record, { ...BASE_OPTS, language });
      for (const a of pack.model.actions) {
        expect(longSentences(a.headline), `${language}: ${a.headline}`).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The fixture pipeline — a real pack, zero engine calls
// ---------------------------------------------------------------------------

describe("the generator over a recorded audit (no engine calls, no cost)", () => {
  it("parses the fixture and keeps 'not measured' as null, never 0", () => {
    const record = parseAuditFixture(fixtureRaw());
    expect(record.answers.length).toBeGreaterThan(0);
    const unmeasured = record.answers.find((a) => a.entityConfidence === null);
    expect(unmeasured, "fixture should contain an unmeasured entityConfidence").toBeTruthy();
    expect(record.answers.every((a) => a.entityConfidence !== 0)).toBe(true);
  });

  it("rejects a fixture with no answers instead of rendering an empty pack", () => {
    expect(() => parseAuditFixture({ answers: [] })).toThrow(/non-empty/i);
    expect(() => parseAuditFixture(null)).toThrow(/JSON object/i);
  });

  it("builds a pack whose gaps quote the real question, engine and winner", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    expect(pack.model.gaps.length).toBeGreaterThan(0);
    expect(pack.model.gaps.length).toBeLessThanOrEqual(MAX_GAP_ROWS);
    const top = pack.model.gaps[0]!;
    expect(top.question).toBe("Who is the best roofing contractor in Northgate?");
    expect(top.winners).toContain("Summit Roofworks");
    expect(pack.html).toContain("Summit Roofworks");
    expect(pack.html).toContain("yelp.com");
  });

  it("shows where the brand DOES appear, with its position", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    expect(pack.model.wins.length).toBeGreaterThan(0);
    expect(pack.model.citedAnswers).toBe(2);
    expect(pack.model.wins[0]!.rank).toBe(1);
  });

  it("shows at most three actions, each with evidence and a recheck date", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    expect(pack.model.actions.length).toBeGreaterThan(0);
    expect(pack.model.actions.length).toBeLessThanOrEqual(MAX_ACTIONS);
    for (const a of pack.model.actions) {
      expect(a.because, "an action must quote the lost prompt").toMatch(/We asked "/);
      expect(a.recheckOn, "an action without a recheck date is a horoscope").toMatch(
        /^\d{4}-\d{2}-\d{2}$/
      );
      expect(a.artifact.length).toBeGreaterThan(0);
      expect(a.acceptance.length).toBeGreaterThan(0);
    }
  });

  it("writes the artifact and the acceptance in the PACK's language", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pt = assemblePack(record, { ...BASE_OPTS, language: "pt-BR" });
    for (const a of pt.model.actions) {
      // The classifier's own strings are English; a pt-BR pack must not leak
      // them, or it reads as a translation nobody finished.
      expect(a.artifact, a.artifact).not.toMatch(/^(page|proof asset|off-site presence)$/);
      expect(a.acceptance, a.acceptance).not.toMatch(/\b(The|answers|exists|page is live)\b/);
    }
    // And both lines stay inside the house sentence cap, in both languages.
    for (const language of PACK_LANGUAGES) {
      const pack = assemblePack(record, { ...BASE_OPTS, language });
      for (const a of pack.model.actions) {
        expect(longSentences(a.acceptance), `${language}: ${a.acceptance}`).toEqual([]);
      }
    }
  });

  it("shows three DIFFERENT moves, not the same move three times", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    const headlines = pack.model.actions.map((a) => a.headline);
    expect(new Set(headlines).size, `repeated headline: ${headlines.join(" | ")}`).toBe(
      headlines.length
    );
    const types = pack.model.actions.map((a) => a.gapType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("names the engines it could NOT ask — coverage holes are never hidden", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    expect(pack.html).toContain("perplexity-eu");
    expect(pack.html).toContain("region gate");
    expect(pack.html).toContain("serp");
  });

  it("always renders the section-28 block and the offer", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, BASE_OPTS);
    for (const line of packCopy("en").notPromised) expect(pack.html).toContain(line);
    expect(pack.html).toContain("$750");
    expect(pack.html).toContain("$1,500 per month");
    expect(pack.html).toContain("No lock-in");
    expect(pack.html).toContain("Full export");
    expect(pack.html).toContain("https://ozvor.com/book?from=design-partner");
    expect(pack.html).toContain("hello@ozvor.com");
  });

  it("renders the same evidence in pt-BR with the PT offer wording", () => {
    const record = parseAuditFixture(fixtureRaw());
    const pack = assemblePack(record, { ...BASE_OPTS, language: "pt-BR" });
    expect(pack.html).toContain('lang="pt-BR"');
    expect(pack.html).toContain("US$ 750");
    expect(pack.html).toContain("US$ 1.500 por mês");
    expect(pack.html).toContain("Sem fidelidade");
    // Same evidence, different language.
    expect(pack.html).toContain("Summit Roofworks");
  });

  it("escapes prospect data — a pack is never an injection vector", () => {
    const raw = fixtureRaw() as Record<string, unknown>;
    const answers = raw["answers"] as Record<string, unknown>[];
    answers[0]!["competitors"] = ["<script>alert(1)</script>"];
    const pack = assemblePack(parseAuditFixture(raw), BASE_OPTS);
    expect(pack.html).not.toContain("<script>alert(1)</script>");
    expect(pack.html).toContain("&lt;script&gt;");
  });

  it("is deterministic: the same fixture renders byte-identical HTML", () => {
    const a = assemblePack(parseAuditFixture(fixtureRaw()), BASE_OPTS).html;
    const b = assemblePack(parseAuditFixture(fixtureRaw()), BASE_OPTS).html;
    expect(a).toBe(b);
  });

  it("the summary names refused actions instead of hiding them", () => {
    const pack = assemblePack(parseAuditFixture(fixtureRaw()), BASE_OPTS);
    const lines = packSummaryLines(pack, "/tmp/out.html").join("\n");
    expect(lines).toContain("/tmp/out.html");
    expect(lines).toContain("Northgate Roofing");
    if (pack.classification.refused.length > 0) {
      expect(lines).toMatch(/Refused by the specificity guard/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The money rule: cost printed before anything runs
// ---------------------------------------------------------------------------

describe("cost is printed before a cent is spent", () => {
  const opts = (over: Record<string, unknown> = {}) => {
    const parsed = parsePackArgs([
      "--domain",
      "northgateroofing.com",
      "--company",
      "Northgate Roofing",
      "--category",
      "roofing contractor",
      ...(over["confirm"] === true ? ["--confirm"] : []),
    ]);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.options;
  };

  it("defaults confirm to FALSE — a paid run is never the default", () => {
    expect(opts().confirm).toBe(false);
    expect(opts({ confirm: true }).confirm).toBe(true);
  });

  it("prints an itemised estimate and the total in dollars", () => {
    const o = opts();
    const forecast = forecastPackCost(o, 10, {});
    const text = costPreflightLines(o, forecast).join("\n");
    expect(text).toMatch(/ESTIMATED COST: \$\d+\.\d\d/);
    for (const engine of DEFAULT_PACK_ENGINES) expect(text).toContain(engine);
    expect(text).toContain("extraction");
    expect(text).toContain("api_spend");
    expect(text).toContain("design_partner_pack");
  });

  it("without --confirm it states plainly that nothing was called or charged", () => {
    const o = opts();
    const text = costPreflightLines(o, forecastPackCost(o, 10, {})).join("\n");
    expect(text).toContain("NOTHING WAS CALLED AND NOTHING WAS CHARGED");
    expect(text).toContain("--confirm");
  });

  it("with --confirm it says the money is about to be spent", () => {
    const o = opts({ confirm: true });
    const text = costPreflightLines(o, forecastPackCost(o, 10, {})).join("\n");
    expect(text).toContain("spends real money");
    expect(text).not.toContain("NOTHING WAS CALLED");
  });

  it("the default run forecasts in the region of the known audit cost", () => {
    const o = opts();
    const forecast = forecastPackCost(o, 10, {});
    // Not a magic number test: the point is the order of magnitude the founder
    // approves is the audit's, not a surprise. Rates live in audit-cost.ts.
    expect(forecast.estimate.totalUsd).toBeGreaterThan(0.3);
    expect(forecast.estimate.totalUsd).toBeLessThan(3);
  });

  it("forecasts ZERO extraction calls, because the pack books zero", () => {
    // The customer audit runs the two-pass verifier and books it; this pack
    // does not. A padded forecast makes the approval meaningless.
    const o = opts();
    const forecast = forecastPackCost(o, 10, {});
    expect(forecast.estimate.extractionCalls).toBe(0);
    expect(forecast.estimate.extractionCents).toBe(0);
    const engineOnly = forecast.estimate.lines.reduce((s, l) => s + l.cents, 0);
    expect(forecast.estimate.totalCents).toBe(Math.max(1, Math.round(engineOnly)));
  });

  it("states on the pre-flight that it does not run the two-pass verifier", () => {
    const o = opts();
    const text = costPreflightLines(o, forecastPackCost(o, 10, {})).join("\n");
    expect(text).toContain("named the brand");
    expect(text).toContain("two-pass verifier");
  });

  it("honours AUDIT_COST_CENTS as a flat, stated override", () => {
    const o = opts();
    const forecast = forecastPackCost(o, 10, { AUDIT_COST_CENTS: "80" });
    expect(forecast.estimate.totalCents).toBe(80);
    expect(costPreflightLines(o, forecast).join("\n")).toContain("flat $0.80");
  });
});

// ---------------------------------------------------------------------------
// 6. Argument parsing
// ---------------------------------------------------------------------------

describe("argument parsing", () => {
  it("requires a domain and a company", () => {
    expect(parsePackArgs([])).toMatchObject({ ok: false });
    expect(parsePackArgs(["--domain", "x.com", "--category", "c"])).toMatchObject({
      ok: false,
      error: /company/,
    });
  });

  it("normalizes a pasted URL into a bare domain", () => {
    expect(normalizeDomain("https://www.Example.com/path?a=1")).toBe("example.com");
    const p = parsePackArgs([
      "--domain",
      "https://www.example.com/pricing",
      "--company",
      "X",
      "--category",
      "c",
    ]);
    expect(p.ok && p.options.domain).toBe("example.com");
  });

  it("rejects a domain that is not one", () => {
    expect(parsePackArgs(["--domain", "not a domain", "--company", "X", "--category", "c"])).toMatchObject({
      ok: false,
    });
  });

  it("rejects an unknown language and accepts pt-BR", () => {
    expect(
      parsePackArgs(["--domain", "x.com", "--company", "X", "--category", "c", "--lang", "fr"])
    ).toMatchObject({ ok: false, error: /lang/ });
    const p = parsePackArgs([
      "--domain",
      "x.com",
      "--company",
      "X",
      "--category",
      "c",
      "--lang",
      "pt-BR",
    ]);
    expect(p.ok && p.options.language).toBe("pt-BR");
  });

  it("bounds --runs so a typo cannot multiply the bill", () => {
    for (const runs of ["50", "0"]) {
      expect(
        parsePackArgs(["--domain", "x.com", "--company", "X", "--category", "c", "--runs", runs])
      ).toMatchObject({ ok: false });
    }
  });

  it("carries the fixture path through, which is the free path", () => {
    const p = parsePackArgs(["--domain", "x.com", "--company", "X", "--fixture", "./a.json"]);
    expect(p.ok && p.options.fixture).toBe("./a.json");
  });

  it("demands a category for a live run, and not for a fixture run", () => {
    expect(parsePackArgs(["--domain", "x.com", "--company", "X"])).toMatchObject({
      ok: false,
      error: /category/,
    });
    expect(
      parsePackArgs(["--domain", "x.com", "--company", "X", "--fixture", "./a.json"])
    ).toMatchObject({ ok: true });
    const live = parsePackArgs([
      "--domain",
      "x.com",
      "--company",
      "X",
      "--category",
      "roofing contractor",
    ]);
    expect(live.ok && live.options.category).toBe("roofing contractor");
  });

  it("parses competitors, and treats none as 'we claim no winner'", () => {
    const none = parsePackArgs(["--domain", "x.com", "--company", "X", "--fixture", "./a.json"]);
    expect(none.ok && none.options.competitors).toEqual([]);
    const some = parsePackArgs([
      "--domain",
      "x.com",
      "--company",
      "X",
      "--fixture",
      "./a.json",
      "--competitors",
      "Alpha Co, Beta LLC ",
    ]);
    expect(some.ok && some.options.competitors).toEqual(["Alpha Co", "Beta LLC"]);
  });
});

// ---------------------------------------------------------------------------
// 6b. The mock guard — a pack is never built from a fabricated answer
// ---------------------------------------------------------------------------

describe("mock guard (audit-integrity rule applied to sales)", () => {
  it("names every engine that has no API key", () => {
    expect(enginesInMockMode(["openai", "anthropic"], {})).toEqual(["openai", "anthropic"]);
    expect(
      enginesInMockMode(["openai", "anthropic"], { OPENAI_API_KEY: "sk-x", ANTHROPIC_API_KEY: "sk-y" })
    ).toEqual([]);
    expect(enginesInMockMode(["openai", "anthropic"], { OPENAI_API_KEY: "sk-x" })).toEqual([
      "anthropic",
    ]);
  });

  it("refuses an engine it does not know how to key", () => {
    expect(enginesInMockMode(["totally-new-engine"], {})).toEqual(["totally-new-engine"]);
  });

  it("an empty key string is NOT a key", () => {
    expect(enginesInMockMode(["openai"], { OPENAI_API_KEY: "" })).toEqual(["openai"]);
  });
});

// ---------------------------------------------------------------------------
// 7. The cost model itself (extracted from audit-run; the ledger's arithmetic)
// ---------------------------------------------------------------------------

describe("audit cost model", () => {
  it("uses the measured per-engine rates, not a blended guess", () => {
    expect(genRateCents("anthropic", {})).toBe(1.64);
    expect(genRateCents("openai", {})).toBe(0.41);
    expect(genRateCents("gemini", {})).toBe(0);
    expect(genRateCents("something-new", {})).toBe(1.2);
  });

  it("per-engine env override wins, including a deliberate 0", () => {
    expect(genRateCents("gemini", { AUDIT_COST_PER_GEN_CENTS_GEMINI: "0.9" })).toBe(0.9);
    expect(genRateCents("openai", { AUDIT_COST_PER_GEN_CENTS_OPENAI: "0" })).toBe(0);
  });

  it("uniform override applies only where no specific one exists", () => {
    const env = { AUDIT_COST_PER_GEN_CENTS: "2", AUDIT_COST_PER_GEN_CENTS_OPENAI: "0.5" };
    expect(genRateCents("openai", env)).toBe(0.5);
    expect(genRateCents("anthropic", env)).toBe(2);
  });

  it("AUDIT_COST_CENTS replaces the arithmetic entirely", () => {
    const input = { gensByEngine: { anthropic: 100 }, extractionCalls: 100 };
    expect(auditCostCents(input, { AUDIT_COST_CENTS: "42" })).toBe(42);
    expect(estimateAuditCost(input, { AUDIT_COST_CENTS: "42" }).flatOverride).toBe(true);
  });

  it("never books a real audit as free", () => {
    expect(auditCostCents({ gensByEngine: { gemini: 1 }, extractionCalls: 0 }, {})).toBe(1);
  });

  it("matches the arithmetic audit-run used before the extraction", () => {
    const gens = { anthropic: 20, openai: 20, gemini: 20, perplexity: 20 };
    const expected = Math.max(
      1,
      Math.round(20 * 1.64 + 20 * 0.41 + 20 * 0 + 20 * 0.68 + 30 * 0.2)
    );
    expect(auditCostCents({ gensByEngine: gens, extractionCalls: 30 }, {})).toBe(expected);
  });

  it("the shape forecast is itemised, sorted by cost, and adds up", () => {
    const e = forecastAuditCost({ prompts: 10, engines: ["openai", "anthropic"], runsPerPrompt: 2 }, {});
    expect(e.lines.map((l) => l.engine)).toEqual(["anthropic", "openai"]);
    expect(e.lines[0]!.generations).toBe(20);
    expect(e.extractionCalls).toBe(10 * 2 * 2 * 2);
    expect(e.totalCents).toBe(
      Math.max(1, Math.round(20 * 1.64 + 20 * 0.41 + e.extractionCalls * 0.2))
    );
  });

  it("formats money the one way these tools format money", () => {
    expect(formatUsd(80)).toBe("$0.80");
    expect(formatUsd(1500)).toBe("$15.00");
  });
});
