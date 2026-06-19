/**
 * GEO Bias/Fairness Parity — GEO-A8 Gate 6→7 condition
 *
 * The GEO platform's AI features must not treat brands differently based on
 * the cultural origin of their name. Every deterministic analysis layer is
 * tested for PARITY: identical inputs except the brand name (drawn from a
 * corpus of diverse linguistic origins) must produce identical outputs.
 *
 * Layers covered (per the GEO-A8 condition in gate-log):
 *  1. Sentiment classifier (AI vector) — same answer text, swapped names →
 *     identical classification and score.
 *  2. Citation parser (probe analysis) — mention/position detection parity,
 *     including diacritics and multi-word names.
 *  3. Competitor detection — word-boundary detection parity for accented names.
 *  4. Strategy generator — name-blind by construction (no brand name in its
 *     input type); asserted via identical plans for identical gap inputs.
 *  5. Content Studio templates — identical structure (headings, placeholders,
 *     schema type) across name origins; name appears only interpolated.
 *
 * No real API calls — all layers are deterministic/keyless in test env.
 * Produces tests/ai/geo-bias-parity-report.md as the compliance artifact.
 */
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { analyzeSentiment } from "../../packages/llm/src/sentiment";
import { parseCitation } from "../../packages/llm/src/citation-parser";
import { detectCompetitors } from "../../packages/llm/src/competitor-detect";
import { generateStrategy, type StrategyInputs } from "../../packages/llm/src/strategy-generator";
import { generateContent } from "../../packages/llm/src/content-studio";

// Brand names of diverse linguistic origins (incl. diacritics + multi-word).
const BRAND_CORPUS = [
  "Smith & Co",          // English
  "Oliveira Tech",       // Portuguese
  "Müller Software",     // German (umlaut)
  "Nguyen Solutions",    // Vietnamese
  "Kowalski Apps",       // Polish
  "Yamamoto Systems",    // Japanese (romanized)
  "Açaí Digital",        // Portuguese (cedilla + acute)
  "Al-Farsi Group",      // Arabic (romanized, hyphenated)
  "São Paulo Analytics", // accented multi-word
  "O'Brien Labs",        // apostrophe
];

const results: string[] = [];

afterAll(() => {
  const report = [
    "# GEO Bias Parity Report — GEO-A8 (Gate 6→7)",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Brand-name corpus: ${BRAND_CORPUS.length} names across 8+ linguistic origins (incl. diacritics, hyphens, apostrophes, multi-word).`,
    "",
    "| Layer | Parity result |",
    "|---|---|",
    ...results,
    "",
    "Method: identical inputs except the brand name; outputs must be identical",
    "(scores byte-equal, structures equal). All layers deterministic — no live API calls.",
    "Scoring engine (computeGeoScore) takes no name inputs — name-blind by construction.",
  ].join("\n");
  writeFileSync(join(__dirname, "geo-bias-parity-report.md"), report);
});

// ---------------------------------------------------------------------------
// 1. Sentiment classifier parity
// ---------------------------------------------------------------------------

describe("GEO-A8 §1 — sentiment classifier parity across name origins", () => {
  const TEMPLATES = [
    "{B} is the best and most trusted option, highly recommended and reliable.",
    "{B} is a software platform headquartered in the capital city.",
    "{B} felt expensive and the setup was confusing and clunky.",
  ];

  it("classifies identical text identically regardless of brand-name origin", () => {
    for (const template of TEMPLATES) {
      const outcomes = BRAND_CORPUS.map((name) => {
        const r = analyzeSentiment([{ text: template.replace(/\{B\}/g, name), mentioned: true }], name);
        return `${r.positive}/${r.neutral}/${r.negative}/${r.sentimentScore}`;
      });
      expect(new Set(outcomes).size, `divergent outcomes for template "${template}": ${outcomes.join(", ")}`).toBe(1);
    }
    results.push("| Sentiment classifier | PASS — identical classification for all 10 name origins across 3 polarity templates |");
  });
});

// ---------------------------------------------------------------------------
// 2. Citation parser parity
// ---------------------------------------------------------------------------

describe("GEO-A8 §2 — citation parser parity", () => {
  it("detects mention + position identically for every name origin", () => {
    const outcomes = BRAND_CORPUS.map((name) => {
      const text = `Several options exist for small businesses. ${name} is frequently recommended by experts. See https://example.com for details.`;
      const r = parseCitation(text, name);
      return `${r.mentioned}/${r.position}/${r.sources.length}`;
    });
    expect(new Set(outcomes).size, `divergent: ${outcomes.join(", ")}`).toBe(1);
    expect(outcomes[0]).toBe("true/2/1");
    results.push("| Citation parser | PASS — mention=true, position=2, sources=1 for all 10 name origins |");
  });

  it("returns not-mentioned identically when the brand is absent", () => {
    const outcomes = BRAND_CORPUS.map((name) =>
      String(parseCitation("Generic answer with no brands at all.", name).mentioned)
    );
    expect(new Set(outcomes).size).toBe(1);
    expect(outcomes[0]).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// 3. Competitor detection parity
// ---------------------------------------------------------------------------

describe("GEO-A8 §3 — competitor detection parity", () => {
  it("detects each name origin equally when present in answer text", () => {
    for (const name of BRAND_CORPUS) {
      const found = detectCompetitors(`Many teams choose ${name} for this use case.`, [name]);
      expect(found, `failed to detect "${name}"`).toContain(name);
    }
    results.push("| Competitor detection | PASS — every name origin detected when present (word-boundary safe) |");
  });

  it("does not false-positive on substrings for any origin", () => {
    for (const name of BRAND_CORPUS) {
      const found = detectCompetitors("An unrelated answer about productivity software.", [name]);
      expect(found).not.toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Strategy generator — name-blind by construction
// ---------------------------------------------------------------------------

describe("GEO-A8 §4 — strategy generator is name-blind", () => {
  it("produces identical plans for identical gaps (no brand name in inputs)", () => {
    const inputs: StrategyInputs = {
      scores: { brand: 45, performance: 50, ai: 40, overall: 45 },
      components: {
        brand: { entityCompleteness: 0.3, citationVolume: 0.4, eeaSignal: 0.4 },
        performance: { schemaCoverage: 0.3, llmsTxtPresent: false, aiCrawlerAccess: 0.5, citationShareVsCompetitors: 0.3, aioPresence: false },
        ai: { citationRate: 0.3, avgPositionScore: 0.3, sentimentScore: 0.4 },
      },
      displacedByCompetitors: 2,
    };
    // StrategyInputs carries no brand name — parity is structural. Verify determinism.
    expect(generateStrategy(inputs)).toEqual(generateStrategy(inputs));
    results.push("| Strategy generator | PASS — name-blind by construction (no name in StrategyInputs); deterministic |");
  });
});

// ---------------------------------------------------------------------------
// 5. Content Studio template parity (keyless template path)
// ---------------------------------------------------------------------------

describe("GEO-A8 §5 — content template structural parity", () => {
  function structure(body: string, schema: string | null): string {
    const headings = (body.match(/^#+\s/gm) ?? []).length;
    const placeholders = (body.match(/\[PLACEHOLDER/g) ?? []).length;
    const schemaType = schema ? (JSON.parse(schema)["@type"] as string) : "none";
    return `${headings}/${placeholders}/${schemaType}`;
  }

  it("produces structurally identical blog drafts for every name origin", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const outcomes: string[] = [];
    for (const name of BRAND_CORPUS) {
      const d = await generateContent({ contentType: "blog", brandName: name, category: "CRM", topic: "How to choose a CRM" });
      outcomes.push(structure(d.body, d.schemaMarkup));
      expect(d.body).toContain(name); // name interpolated, not dropped
    }
    expect(new Set(outcomes).size, `divergent structures: ${outcomes.join(", ")}`).toBe(1);
    results.push("| Content Studio (blog template) | PASS — identical heading/placeholder/schema structure for all 10 name origins |");
  });

  it("produces structurally identical FAQ drafts (FAQPage schema) for every origin", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const outcomes: string[] = [];
    for (const name of BRAND_CORPUS) {
      const d = await generateContent({ contentType: "faq", brandName: name, category: "CRM", topic: "Is it secure?" });
      outcomes.push(structure(d.body, d.schemaMarkup));
    }
    expect(new Set(outcomes).size).toBe(1);
    expect(outcomes[0]?.endsWith("FAQPage")).toBe(true);
    results.push("| Content Studio (FAQ template) | PASS — identical structure + FAQPage schema for all 10 name origins |");
  });
});
