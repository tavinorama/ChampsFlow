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
 *
 * ---
 * FreeTestResult JSON shape (full):
 * {
 *   prompt: string,
 *   live: boolean,
 *   engines: Array<{
 *     engine: LLMProvider,
 *     live: boolean,
 *     brandCited: boolean,
 *     brandPosition: number | null,
 *     competitorCited: boolean
 *   }>,
 *   brandEngineCount: number,
 *   competitorEngineCount: number,
 *   totalEngines: number,
 *   enginesLive: number,
 *   domain: string | null,
 *   verdict: string,
 *   status: "invisible" | "trailing" | "competitive" | "leading",
 *   score: { ai: number, performance: number, brand: number, overall: number },
 *   breakdown: {
 *     ai: {
 *       citationRate: number,
 *       avgPosition: number | null,
 *       sentiment: number,
 *       note: string
 *     },
 *     performance: {
 *       schemaCoverage: number,
 *       aiCrawlerAccess: number,
 *       note: string
 *     },
 *     brand: {
 *       entityCompleteness: number,
 *       note: string
 *     }
 *   },
 *   recommendations: Array<{
 *     plan: "kit" | "growth" | "agency" | "call",
 *     reason: string,
 *     href: string
 *   }>
 * }
 */

import { runProbes } from "./providers/gateway";
import { parseCitation } from "./citation-parser";
import { detectCompetitors } from "./competitor-detect";
import { analyzeSentiment } from "./sentiment";
import { crawlSite } from "./site-crawl";
import { computeGeoScore } from "./scoring";
import { createHash } from "node:crypto";
import type { LLMProvider, UserRegion } from "./providers/types";

export interface EngineResult {
  engine: LLMProvider;
  /** true if this engine produced a live (not mock) response */
  live: boolean;
  brandCited: boolean;
  brandPosition: number | null;
  competitorCited: boolean;
}

export interface FreeTestResult {
  /** The buyer prompt we asked (shown for transparency). */
  prompt: string;
  /** true if live engines were queried, false if deterministic mock. */
  live: boolean;
  engines: EngineResult[];
  /** How many engines cited the brand / the competitor. */
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  /** How many engines responded with a live (non-mock) response */
  enginesLive: number;
  /** Domain used for the light crawl (may be null if not provided) */
  domain: string | null;
  /** Headline verdict for the scorecard. */
  verdict: string;
  /** "invisible" | "trailing" | "competitive" | "leading" — drives UI tone. */
  status: "invisible" | "trailing" | "competitive" | "leading";
  /** Real 3-vector score — computed from what the free tier can actually measure */
  score: {
    ai: number;       // 0-100
    performance: number; // 0-100
    brand: number;    // 0-100
    overall: number;  // 0-100
  };
  /** Per-signal breakdown with honest notes */
  breakdown: {
    ai: {
      citationRate: number;      // 0-1
      avgPosition: number | null; // null if brand was never cited
      sentiment: number;         // 0-1 (0.5 = no mentions classified)
      note: string;              // one-line plain-English explanation
    };
    performance: {
      schemaCoverage: number;   // 0-1 (from crawl; 0.5 if no domain)
      aiCrawlerAccess: number;  // 0-1 (from crawl; 0.5 if no domain)
      note: string;
    };
    brand: {
      entityCompleteness: number; // 0-1 (from crawl; 0.5 if no domain)
      note: string;
    };
  };
  /** Ordered upsell recommendations based on the score */
  recommendations: Array<{
    plan: "kit" | "growth" | "agency" | "call";
    reason: string;
    href: string;
  }>;
}

/** Backward-compatibility alias — the DB stores `lead_capture.result` as this type. */
export type InvisibilityTestResult = FreeTestResult;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** The single highest-intent buyer prompt for a category. */
export function buildTestPrompt(category: string): string {
  const cat = category.trim() || "solution";
  return `What is the best ${cat} for small businesses?`;
}

const LIVE_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "gemini", "perplexity"];

/**
 * Returns true only if the specific provider's API key env var is set.
 * Replaces the old global `liveMode()` which treated any key as all-live.
 */
function isProviderLive(provider: LLMProvider): boolean {
  switch (provider) {
    case "anthropic":  return !!process.env["ANTHROPIC_API_KEY"];
    case "openai":     return !!process.env["OPENAI_API_KEY"];
    case "gemini":     return !!process.env["GEMINI_API_KEY"];
    case "perplexity": return !!process.env["PERPLEXITY_API_KEY"];
    default:           return false;
  }
}

const PLAN_HREFS: Record<"kit" | "growth" | "agency" | "call", string> = {
  kit: "/kit",
  growth: "/login?plan=growth&next=checkout",
  agency: "/login?plan=agency&next=checkout",
  call: "/book",
};

function buildRecommendations(
  overall: number,
  brandEngineCount: number,
  status: FreeTestResult["status"]
): FreeTestResult["recommendations"] {
  type Plan = "kit" | "growth" | "agency" | "call";

  const rec = (plan: Plan, reason: string): FreeTestResult["recommendations"][number] => ({
    plan,
    reason,
    href: PLAN_HREFS[plan],
  });

  if (overall <= 30 || brandEngineCount === 0) {
    return [
      rec("kit", "Your brand is invisible to AI buyers — the $29 Kit gives you the exact prompts and fixes to get cited fast."),
      rec("call", "A 20-minute GEO sprint call will identify the fastest path from invisible to recommended."),
    ];
  }
  if (overall <= 55 || status === "trailing") {
    return [
      rec("kit", "The Kit delivers a citation-ready content blueprint tailored to your brand's specific gaps."),
      rec("growth", "Growth monitoring keeps you from sliding back as competitors publish new citation-worthy content."),
    ];
  }
  if (overall <= 75 || status === "competitive") {
    return [
      rec("growth", "Growth plan gives you weekly AI citation tracking so you catch competitive moves before they cost you leads."),
      rec("agency", "Agency-tier competitor benchmarking shows exactly which content topics to own to pull definitively ahead."),
    ];
  }
  // leading
  return [
    rec("agency", "Agency monitoring defends your lead with real-time alerts when competitors gain AI citation ground."),
    rec("call", "A strategy call turns your current citation advantage into a documented, repeatable content programme."),
  ];
}

/**
 * Run the Invisibility Test. Never throws — returns a scorecard either way.
 * @param brand       the client's own brand
 * @param competitor  one competitor (used only to scan answer text — GEO-A2)
 * @param category    buyer category (e.g. "CRM", "accounting software")
 * @param region      "EU" | "US" (routing gate; EU excludes Perplexity)
 * @param domain      optional homepage domain for light crawl (SSRF-safe via guardedFetch)
 */
export async function runInvisibilityTest(
  brand: string,
  competitor: string | null,
  category: string,
  region: UserRegion = "US",
  domain?: string | null
): Promise<FreeTestResult> {
  const prompt = buildTestPrompt(category);
  const query = { queryHash: sha256(prompt), queryText: prompt, brandName: brand };

  // Run probe and light crawl in parallel for minimum latency.
  const [probeResult, crawl] = await Promise.all([
    runProbes([query], {
      region,
      requestedProviders: LIVE_PROVIDERS,
      repeat: 1,
    }),
    crawlSite(domain ?? null),
  ]);

  const engines: EngineResult[] = probeResult.responses.map((r) => {
    const parsed = parseCitation(r.rawText ?? "", brand);
    const competitorCited =
      !!competitor && detectCompetitors(r.rawText ?? "", [competitor]).length > 0;
    return {
      engine: r.provider,
      live: isProviderLive(r.provider),
      brandCited: parsed.mentioned,
      brandPosition: parsed.position,
      competitorCited,
    };
  });

  const totalEngines = engines.length;
  const brandEngineCount = engines.filter((e) => e.brandCited).length;
  const competitorEngineCount = engines.filter((e) => e.competitorCited).length;
  const enginesLive = engines.filter((e) => e.live).length;

  // --- AI vector ---
  const citationRate = totalEngines > 0 ? brandEngineCount / totalEngines : 0;

  // Average position across engines where brand was cited
  const citedPositions = engines
    .filter((e) => e.brandCited && e.brandPosition !== null)
    .map((e) => e.brandPosition as number);
  const avgPosition: number | null =
    citedPositions.length > 0
      ? citedPositions.reduce((a, b) => a + b, 0) / citedPositions.length
      : null;
  // avgPositionScore: 1/position (position 1 = 1.0); 0 if never cited
  const avgPositionScore = avgPosition !== null ? 1 / avgPosition : 0;

  // Sentiment: analyze probe answers where brand was cited
  const sentimentInputs = probeResult.responses.map((r) => ({
    text: r.rawText ?? "",
    mentioned: parseCitation(r.rawText ?? "", brand).mentioned,
  }));
  const sentimentResult = analyzeSentiment(sentimentInputs, brand);
  const sentiment = sentimentResult.sentimentScore; // 0.5 if nothing classified

  // --- Performance vector ---
  const schemaCoverage = crawl.performance.schemaCoverage;
  const aiCrawlerAccess = crawl.performance.aiCrawlerAccess;
  const performanceNote = crawl.reachable
    ? "Homepage crawled: schema coverage + AI crawler access measured."
    : "No domain provided — performance signals use neutral defaults.";

  // --- Brand vector ---
  const entityCompleteness = crawl.brand.entityCompleteness;
  const brandNote = crawl.reachable
    ? "Entity signals measured from homepage."
    : "No domain — brand signals use neutral defaults.";

  // Real share-of-voice vs the competitor — NOT the raw citation rate. If neither
  // is cited it's 0 (honest: you have no share). This stops a single citation
  // from inflating the Performance vector and makes "losing to the competitor"
  // show up truthfully.
  const shareOfVoice =
    brandEngineCount + competitorEngineCount > 0
      ? brandEngineCount / (brandEngineCount + competitorEngineCount)
      : 0;

  // --- Compute GEO score ---
  const score = computeGeoScore({
    ai: {
      citationRate,
      avgPositionScore,
      sentimentScore: sentiment,
    },
    performance: {
      schemaCoverage,
      llmsTxtPresent: crawl.performance.llmsTxtPresent,
      aiCrawlerAccess,
      citationShareVsCompetitors: shareOfVoice,
      aioPresence: false, // not measured in free tier
    },
    brand: {
      entityCompleteness,
      // Honest brand-citation signal = real share-of-voice, not a third copy of
      // citationRate (which previously triple-counted one signal into AI +
      // Performance + Brand and pushed brand-new sites to ~100).
      citationVolume: shareOfVoice,
      eeaSignal: crawl.brand.eeaSignal,
    },
  });

  // --- Status ---
  let status: FreeTestResult["status"];
  if (brandEngineCount === 0) status = "invisible";
  else if (competitor && competitorEngineCount > brandEngineCount) status = "trailing";
  else if (competitor && competitorEngineCount === brandEngineCount) status = "competitive";
  else status = "leading";

  const verdict = buildVerdict(brand, competitor, brandEngineCount, competitorEngineCount, totalEngines, status);

  const recommendations = buildRecommendations(score.overall, brandEngineCount, status);

  return {
    prompt,
    live: enginesLive > 0,
    engines,
    brandEngineCount,
    competitorEngineCount,
    totalEngines,
    enginesLive,
    domain: domain ?? null,
    verdict,
    status,
    score: {
      ai: score.ai,
      performance: score.performance,
      brand: score.brand,
      overall: score.overall,
    },
    breakdown: {
      ai: {
        citationRate,
        avgPosition,
        sentiment,
        note: `Tested across ${totalEngines} AI engine${totalEngines !== 1 ? "s" : ""} (${enginesLive} live). Brand cited on ${brandEngineCount}/${totalEngines} engines.`,
      },
      performance: {
        schemaCoverage,
        aiCrawlerAccess,
        note: performanceNote,
      },
      brand: {
        entityCompleteness,
        note: brandNote,
      },
    },
    recommendations,
  };
}

function buildVerdict(
  brand: string,
  competitor: string | null,
  brandN: number,
  compN: number,
  total: number,
  status: FreeTestResult["status"]
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
