/**
 * design-partner-pack-region.test.ts — the first LIVE pack (17/09, Robert Crow
 * Law) read 10 answers instead of 80 and printed "Not asked: openai (region
 * gate); gemini (region gate); perplexity (region gate)" for a US prospect.
 * The script passed region "us"; the routing gate knows "US" | "EU" exactly,
 * and anything that is not "US" gets the EU rules. One engine of four, paid.
 *
 * What these tests hold:
 *   1. the gate's vocabulary: "US" permits all four engines; a lowercase "us"
 *      does NOT (it fails closed — that behaviour is correct and stays);
 *   2. the pack script passes a typed "US";
 *   3. no script or job hands a lowercase region literal to the probe runner.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { permittedProviders } from "../../packages/llm/src/providers/routing";
import type { LLMProvider, UserRegion } from "../../packages/llm/src/providers/types";

const root = join(__dirname, "../..");
const ENGINES: LLMProvider[] = ["openai", "anthropic", "gemini", "perplexity"];

describe("the routing gate's vocabulary", () => {
  it('"US" permits the four engines', () => {
    expect(permittedProviders("US", ENGINES)).toEqual(ENGINES);
  });

  it('a lowercase "us" is not "US": the gate fails closed to the EU rules', () => {
    const allowed = permittedProviders("us" as unknown as UserRegion, ENGINES);
    expect(allowed).toEqual(["anthropic"]);
  });
});

describe("callers speak that vocabulary", () => {
  it("the design-partner pack probes a US prospect as US, typed", () => {
    const src = readFileSync(join(root, "scripts/design-partner-pack.ts"), "utf8");
    expect(src).toContain('const region: UserRegion = "US";');
    expect(src).not.toMatch(/region:\s*"us"/);
  });

  it("no script hands a lowercase region literal to the probe runner", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(join(root, "scripts"))) {
      if (!/\.(ts|mjs|js)$/.test(f)) continue;
      const src = readFileSync(join(root, "scripts", f), "utf8");
      if (!/runProbes(Sequential)?\(/.test(src)) continue;
      if (/region:\s*"(us|eu)"/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 17/09 — a local service business is asked local buyer questions.
// ---------------------------------------------------------------------------
import { buildLocalServicePortfolio } from "../../packages/llm/src/prompt-portfolio-local";
import { buildIntentPortfolio, PORTFOLIO_INTENTS } from "../../packages/llm/src/prompt-portfolio";
import { parsePackArgs } from "../../packages/llm/src/design-partner-cli";

describe("the local-service portfolio", () => {
  const local = buildLocalServicePortfolio("Robert Crow Law", "criminal defense attorney", "Portland, Oregon");

  it("has the same shape as the product portfolio: 10 questions, 5 intents x 2 formulations", () => {
    expect(local).toHaveLength(10);
    for (const intent of PORTFOLIO_INTENTS) {
      const ix = local.filter((p) => p.intentId === intent).map((p) => p.formulationIx).sort();
      expect(ix).toEqual([0, 1]);
    }
  });

  it("speaks like a local buyer: the place is in every question, and no software words", () => {
    for (const p of local) {
      expect(p.text).toContain("Portland, Oregon");
      expect(p.text).not.toMatch(/\b(vendor|SMBs?|providers?|companies|solution|small businesses)\b/i);
    }
    expect(local.map((p) => p.text)).toContain("I need a criminal defense attorney in Portland, Oregon. Who should I call?");
  });

  it("uses the article a person would say", () => {
    const hvac = buildLocalServicePortfolio("Shamrock", "HVAC company", "Tempe, Arizona").map((p) => p.text);
    expect(hvac).toContain("I need an HVAC company in Tempe, Arizona. Who should I call?");
  });

  it("the product portfolio is untouched (its texts are methodology)", () => {
    const product = buildIntentPortfolio("Acme", "roofing contractor").map((p) => p.text);
    expect(product[0]).toBe("What is the best roofing contractor for small businesses?");
    expect(product[9]).toBe("How to choose a roofing contractor vendor");
  });

  it("--place is parsed, and absent means the default portfolio", () => {
    const base = ["--domain", "x.com", "--company", "X", "--category", "roofer"];
    const withPlace = parsePackArgs([...base, "--place", "Austin, Texas"]);
    const without = parsePackArgs(base);
    expect(withPlace.ok && withPlace.options.place).toBe("Austin, Texas");
    expect(without.ok && without.options.place).toBe("");
  });
});

describe("an unchecked name is not 'nobody named'", () => {
  it("the renderer has a separate label, in both languages, used when no competitor list was given", () => {
    const src = readFileSync(join(root, "packages/llm/src/design-partner-pack.ts"), "utf8");
    expect(src).toContain('notCheckedLabel: "names not checked"');
    expect(src).toContain('notCheckedLabel: "nomes não verificados"');
    expect(src).toContain("model.namesChecked !== false");
    const script = readFileSync(join(root, "scripts/design-partner-pack.ts"), "utf8");
    expect(script).toContain("competitorsGiven: options.competitors.length > 0");
  });
});
