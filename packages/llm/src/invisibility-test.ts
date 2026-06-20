/**
 * invisibility-test.ts — TrustIndex AI · "The AI Invisibility Test" (lead magnet)
 *
 * The free hook: ONE high-intent buyer prompt, run across the AI engines for the
 * client's brand vs ONE competitor. Returns a visceral, instant scorecard:
 * are you cited? is your competitor? who ranks higher? on how many engines?
 *
 * It is Step 1 (SEE) of the product — a single-prompt slice of the full audit
 * engine — so it reveals the problem the $29 Get-Cited Kit then solves.
 *
 * Reuses the exact primitives the full audit uses (runProbes / parseCitation /
 * detectCompetitors). GEO-A2: only the client's own brand goes into the prompt;
 * the competitor name is used ONLY to scan the returned answer text, never sent
 * to a provider. Deterministic in mock mode; live when keys are present.
 */

import { runProbes } from "./providers/gateway";
import { parseCitation } from "./citation-parser";
import { detectCompetitors } from "./competitor-detect";
import { createHash } from "node:crypto";
import type { LLMProvider, UserRegion } from "./providers/types";

export interface EngineResult {
  engine: LLMProvider;
  brandCited: boolean;
  brandPosition: number | null;
  competitorCited: boolean;
}

export interface InvisibilityTestResult {
  /** The buyer prompt we asked (shown for transparency). */
  prompt: string;
  /** true if live engines were queried, false if deterministic mock. */
  live: boolean;
  engines: EngineResult[];
  /** How many engines cited the brand / the competitor. */
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  /** Headline verdict for the scorecard. */
  verdict: string;
  /** "invisible" | "trailing" | "competitive" | "leading" — drives UI tone. */
  status: "invisible" | "trailing" | "competitive" | "leading";
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** The single highest-intent buyer prompt for a category. */
export function buildTestPrompt(category: string): string {
  const cat = category.trim() || "solution";
  return `What is the best ${cat} for small businesses?`;
}

const LIVE_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "gemini", "perplexity"];

function liveMode(): boolean {
  return (
    !!process.env["ANTHROPIC_API_KEY"] ||
    !!process.env["OPENAI_API_KEY"] ||
    !!process.env["PERPLEXITY_API_KEY"] ||
    !!process.env["GEMINI_API_KEY"]
  );
}

/**
 * Run the Invisibility Test. Never throws — returns a scorecard either way.
 * @param brand       the client's own brand
 * @param competitor  one competitor (used only to scan answer text — GEO-A2)
 * @param category    buyer category (e.g. "CRM", "accounting software")
 * @param region      "EU" | "US" (routing gate; EU excludes Perplexity)
 */
export async function runInvisibilityTest(
  brand: string,
  competitor: string | null,
  category: string,
  region: UserRegion = "US"
): Promise<InvisibilityTestResult> {
  const prompt = buildTestPrompt(category);
  const query = { queryHash: sha256(prompt), queryText: prompt, brandName: brand };

  const result = await runProbes([query], {
    region,
    requestedProviders: LIVE_PROVIDERS,
    repeat: 1,
  });

  const engines: EngineResult[] = result.responses.map((r) => {
    const parsed = parseCitation(r.rawText ?? "", brand);
    const competitorCited =
      !!competitor && detectCompetitors(r.rawText ?? "", [competitor]).length > 0;
    return {
      engine: r.provider,
      brandCited: parsed.mentioned,
      brandPosition: parsed.position,
      competitorCited,
    };
  });

  const totalEngines = engines.length;
  const brandEngineCount = engines.filter((e) => e.brandCited).length;
  const competitorEngineCount = engines.filter((e) => e.competitorCited).length;

  let status: InvisibilityTestResult["status"];
  if (brandEngineCount === 0) status = "invisible";
  else if (competitor && competitorEngineCount > brandEngineCount) status = "trailing";
  else if (competitor && competitorEngineCount === brandEngineCount) status = "competitive";
  else status = "leading";

  const verdict = buildVerdict(brand, competitor, brandEngineCount, competitorEngineCount, totalEngines, status);

  return {
    prompt,
    live: liveMode(),
    engines,
    brandEngineCount,
    competitorEngineCount,
    totalEngines,
    verdict,
    status,
  };
}

function buildVerdict(
  brand: string,
  competitor: string | null,
  brandN: number,
  compN: number,
  total: number,
  status: InvisibilityTestResult["status"]
): string {
  const invisibleOn = total - brandN;
  switch (status) {
    case "invisible":
      return competitor && compN > 0
        ? `When buyers ask AI, it recommends ${competitor} — not ${brand}. You're invisible on all ${total} engines.`
        : `${brand} is invisible: not cited on any of the ${total} AI engines buyers use.`;
    case "trailing":
      return `${competitor} is recommended on ${compN} of ${total} engines; ${brand} on only ${brandN}. You're being out-cited.`;
    case "competitive":
      return `${brand} and ${competitor} are neck-and-neck (${brandN} vs ${compN} of ${total} engines). There's room to pull ahead.`;
    case "leading":
      return invisibleOn > 0
        ? `${brand} leads, but is still invisible on ${invisibleOn} of ${total} engines — gaps remain.`
        : `${brand} is cited on all ${total} engines. Strong — now defend and widen the lead.`;
  }
}
