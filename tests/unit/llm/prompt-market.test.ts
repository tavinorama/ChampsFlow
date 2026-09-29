/**
 * prompt-market.test.ts — D4 (Codex N10, 28/09).
 *
 * The Ozvor universe has two pt-BR questions for Brazil and one en-GB
 * question for Portugal. The audit stamped US / en-US on every question, the
 * Google probe asked all of them in the brand's market, and the task for the
 * Portuguese question showed "US / unspecified". The market now belongs to
 * the question.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serpMarketFor, serpMarketForQuery, marketMix, resolvePromptMarket } from "../../../packages/llm/src/serp-market";

const auditLevel = serpMarketFor({ region: "US" });

describe("resolvePromptMarket — what the question row says, never a hardcoded US", () => {
  it("keeps the row's own market and locale", () => {
    expect(resolvePromptMarket({ market: "BR", locale: "pt-BR" }, "US")).toEqual({ market: "BR", locale: "pt-BR" });
    expect(resolvePromptMarket({ market: "PT", locale: "en-GB" }, "US")).toEqual({ market: "PT", locale: "en-GB" });
  });
  it("a row without them falls back to the brand region and says the locale is unspecified", () => {
    expect(resolvePromptMarket({ market: null, locale: null }, "US")).toEqual({ market: "US", locale: "unspecified" });
    expect(resolvePromptMarket({}, null)).toEqual({ market: "unspecified", locale: "unspecified" });
  });
});

describe("serpMarketForQuery — the question's market wins over the audit's", () => {
  it("a Brazilian question is asked in Brazil, in Portuguese, inside a US audit", () => {
    expect(serpMarketForQuery({ market: "BR", locale: "pt-BR" }, "US", auditLevel)).toMatchObject({ country: "BR", language_code: "pt", location_code: 2076 });
  });
  it("Portugal with an English locale keeps the country and the language apart", () => {
    expect(serpMarketForQuery({ market: "PT", locale: "en-GB" }, "US", auditLevel)).toMatchObject({ country: "PT", language_code: "en", location_code: 2620 });
  });
  it("a question with no market of its own uses the audit-level decision", () => {
    expect(serpMarketForQuery({}, "US", auditLevel)).toBe(auditLevel);
    expect(serpMarketForQuery({ market: "unspecified", locale: "unspecified" }, "US", auditLevel)).toBe(auditLevel);
    expect(serpMarketForQuery({ market: null, locale: null }, "EU", undefined)).toMatchObject({ country: "GB", basis: "region_default" });
  });
  it("an unknown market on the question never overrides a known audit market", () => {
    expect(serpMarketForQuery({ market: "Mars" }, "US", auditLevel)).toBe(auditLevel);
  });
  it("the mix says what was asked where", () => {
    const qs = [{ market: "US", locale: "en-US" }, { market: "US", locale: "en-US" }, { market: "BR", locale: "pt-BR" }, {}];
    expect(marketMix(qs.map((q) => serpMarketForQuery(q, "US", auditLevel)))).toEqual({ "US/en": 3, "BR/pt": 1 });
  });
});

describe("wiring in the audit job and the gateway", () => {
  const root = join(__dirname, "../../..");
  const job = readFileSync(join(root, "apps/worker/src/jobs/audit-run.ts"), "utf8");
  it("the universe reads market and locale, and nothing hardcodes US / en-US for a question", () => {
    expect(job).toContain("SELECT id, text, cohort, intent, business_value, relevance_score, market, locale");
    expect(job).toContain("promptMarketByText.set(r.text.trim(), resolvePromptMarket(r, brand.region))");
    const universe = job.slice(job.indexOf("const defs: PromptDefinition[] = universeRows.map"), job.indexOf("const defs: PromptDefinition[] = universeRows.map") + 900);
    expect(universe).not.toContain('market: "US"');
    expect(universe).not.toContain('locale: "en-US"');
  });
  it("the task's market comes from the question, and the recheck date is persisted", () => {
    expect(job).toContain("promptMarketByText.get((r.queryText as string).trim())?.market ?? brand.region");
    expect(job).toContain("UPDATE plan_task SET due_date = ${recheckAt}::timestamptz");
    expect(job).toContain("serp_market_mix: marketMix(");
  });
  it("the gateway decides the SERP market per question", () => {
    const gw = readFileSync(join(root, "packages/llm/src/providers/gateway.ts"), "utf8");
    expect(gw).toContain("serpMarket: serpMarketForQuery(query, region, opts.serpMarket)");
  });
});
