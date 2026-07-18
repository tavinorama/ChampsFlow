/**
 * kit-deliverable.ts — Ozvor · "The Get-Cited Kit" ($29 tripwire)
 *
 * Assembles the one-time, no-subscription deliverable a buyer gets for $29:
 *   1. Full AI Visibility audit + Ozvor AI Visibility Score (3 vectors)
 *   2. Top 3 highest-impact "get cited" fixes (from the strategy engine)
 *   3. Three ready-to-publish drafts (blog + LinkedIn + FAQ, with schema.org)
 *   4. A "where to publish" checklist
 *
 * This orchestrates the SAME pure primitives the worker's audit job uses, but
 * inline and tenant-free — appropriate for a pre-account buyer. No DB, no RLS.
 * Never throws (every sub-call degrades to baseline/mock). Deterministic in
 * mock mode; live when provider keys are present.
 */

import { createHash } from "node:crypto";
import { runProbes } from "./providers/gateway";
import { parseCitation } from "./citation-parser";
import { computeGeoScore } from "./scoring";
import { crawlSite } from "./site-crawl";
import { measureOffsiteSignal } from "./offsite-signal";
import { analyzeContentGeo } from "./content-geo";
import { analyzeSentiment } from "./sentiment";
import { analyzeRedditPresence } from "./reddit-signal";
import { analyzeEntityGraph, pickEntityCompleteness } from "./entity-graph";
import { generateStrategy, type Recommendation } from "./strategy-generator";
import { generateContent, templateDraft, type ContentDraft, type ContentType } from "./content-studio";
import type { InvisibilityTestResult } from "./invisibility-test";
import type { LLMProvider, UserRegion } from "./providers/types";

/**
 * Continuity summary of the buyer's FREE AI Invisibility Test, when the Kit was
 * purchased off the back of one. Lets the delivered Kit frame Part 1 as "your
 * free test, completed" rather than an unrelated fresh run. Null for buyers who
 * went straight to the Kit.
 */
export interface KitFromTest {
  status: InvisibilityTestResult["status"];
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  verdict: string;
}

export interface KitDeliverable {
  brand: string;
  generatedAt: string;
  live: boolean;
  /** Continuity with the free test that seeded this Kit (null if bought directly). */
  fromTest: KitFromTest | null;
  score: { brand: number; performance: number; ai: number; overall: number };
  topFixes: Recommendation[];
  drafts: Array<{ contentType: ContentType } & ContentDraft>;
  publishChecklist: string[];
  meta: { probesTotal: number; probesCited: number; enginesUsed: string[] };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const LIVE_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "gemini", "perplexity", "serp"];


/**
 * Emergency-safe Kit assembly used when the live audit path fails inside a paid
 * delivery request. It intentionally uses conservative baseline scores and
 * template drafts rather than fabricating live probe results. This protects the
 * buyer experience: a paid Kit should deliver an honest starter pack instead of
 * a generic "Something went wrong" page when one provider/runner is unavailable.
 */
export function buildFallbackKitDeliverable(input: KitInput): KitDeliverable {
  const { brand, category } = input;
  const fromTest: KitFromTest | null = input.testSeed
    ? {
        status: input.testSeed.status,
        brandEngineCount: input.testSeed.brandEngineCount,
        competitorEngineCount: input.testSeed.competitorEngineCount,
        totalEngines: input.testSeed.totalEngines,
        verdict: input.testSeed.verdict,
      }
    : null;

  const score = computeGeoScore({
    brand: { entityCompleteness: 0.35, citationVolume: 0.1, eeaSignal: 0.25 },
    performance: {
      schemaCoverage: 0.2,
      llmsTxtPresent: false,
      aiCrawlerAccess: 0.5,
      citationShareVsCompetitors: 0.1,
      aioPresence: false,
    },
    ai: { citationRate: 0.1, avgPositionScore: 0, sentimentScore: 0.5 },
  });

  const plan = generateStrategy({
    scores: score,
    components: {
      brand: { entityCompleteness: 0.35, citationVolume: 0.1, eeaSignal: 0.25 },
      performance: {
        schemaCoverage: 0.2,
        llmsTxtPresent: false,
        aiCrawlerAccess: 0.5,
        citationShareVsCompetitors: 0.1,
        aioPresence: false,
      },
      ai: { citationRate: 0.1, avgPositionScore: 0, sentimentScore: 0.5 },
    },
    offsiteSources: [],
    contentTraits: {},
    displacedByCompetitors: 0,
  });
  const topFixes = plan.recommendations.slice(0, 3);
  const types: ContentType[] = ["blog", "linkedin", "faq"];
  const drafts: Array<{ contentType: ContentType } & ContentDraft> = types.map((contentType, i) => {
    const rec = topFixes[i] ?? topFixes[0];
    const topic = rec?.action ?? `How ${brand} helps with ${category}`;
    return { contentType, ...templateDraft({ contentType, brandName: brand, category, topic }), keyUsed: "none" as const };
  });

  return {
    brand,
    generatedAt: new Date().toISOString(),
    live: false,
    fromTest,
    score,
    topFixes,
    drafts,
    publishChecklist: [
      "Start with robots.txt: allow GPTBot, ClaudeBot, PerplexityBot and Google-Extended so AI engines can read your site.",
      "Publish the blog draft on your website and link it from your homepage or resources page.",
      "Publish the LinkedIn draft from your company page and add concrete proof points before posting.",
      "Add the FAQ draft to your site with the included schema.org markup.",
      "Re-run your AI Visibility Test in ~30 days to measure movement.",
    ],
    meta: { probesTotal: 0, probesCited: 0, enginesUsed: [] },
  };
}

function buildPrompts(brand: string, category: string): string[] {
  const cat = category.trim() || "solution";
  return [
    `What is the best ${cat} for small businesses?`,
    `Top ${cat} providers in 2026`,
    `${cat} alternatives worth considering`,
    `Which ${cat} do experts recommend?`,
    `Most trusted ${cat} companies`,
    `Is ${brand} a good choice?`,
  ];
}

export interface KitInput {
  brand: string;
  domain: string | null;
  category: string;
  region?: UserRegion;
  /**
   * The buyer's free AI Invisibility Test result, when the Kit was purchased off
   * the back of one. Used only for narrative continuity (Part 1 = "your free
   * test, completed"); the full audit is always recomputed fresh below.
   */
  testSeed?: InvisibilityTestResult | null;
}

/**
 * Build the full Get-Cited Kit deliverable. Self-contained — safe to call from
 * the API request path (no queue, no DB).
 */
export async function buildKitDeliverable(input: KitInput): Promise<KitDeliverable> {
  const { brand, domain, category } = input;
  const region: UserRegion = input.region === "EU" ? "EU" : "US";

  // Narrative continuity with the free test that seeded this Kit (if any).
  const fromTest: KitFromTest | null = input.testSeed
    ? {
        status: input.testSeed.status,
        brandEngineCount: input.testSeed.brandEngineCount,
        competitorEngineCount: input.testSeed.competitorEngineCount,
        totalEngines: input.testSeed.totalEngines,
        verdict: input.testSeed.verdict,
      }
    : null;

  const live =
    !!process.env["ANTHROPIC_API_KEY"] ||
    !!process.env["OPENAI_API_KEY"] ||
    !!process.env["PERPLEXITY_API_KEY"] ||
    !!process.env["GEMINI_API_KEY"];
  const repeat = live ? 3 : 1;

  // --- Probes (AI vector) ---
  const prompts = buildPrompts(brand, category);
  const queries = prompts.map((t) => ({ queryHash: sha256(t), queryText: t, brandName: brand }));
  const probe = await runProbes(queries, { region, requestedProviders: LIVE_PROVIDERS, repeat });

  let citedSum = 0;
  let citedAny = 0;
  let positionScoreSum = 0;
  let positionScoreN = 0;
  const sentimentProbes: Array<{ text: string; mentioned: boolean }> = [];
  for (const r of probe.responses) {
    const rate = typeof r.mentionRate === "number" ? r.mentionRate : r.mentioned ? 1 : 0;
    citedSum += rate;
    if (rate > 0) citedAny += 1;
    if (r.mentioned && r.position && r.position > 0) {
      positionScoreSum += 1 / r.position;
      positionScoreN += 1;
    }
    sentimentProbes.push({ text: r.rawText ?? "", mentioned: r.mentioned });
  }
  const totalProbes = probe.responses.length || 1;
  const citationRate = citedSum / totalProbes;
  const avgPositionScore = positionScoreN > 0 ? positionScoreSum / positionScoreN : 0;
  const aioPresence = probe.responses.some((r) => r.provider === "serp" && r.mentioned);
  const sentiment = analyzeSentiment(sentimentProbes, brand);

  // --- Site, off-site, content, reddit, entity (Brand + Performance vectors) ---
  const crawl = await crawlSite(domain);
  const offsite = await measureOffsiteSignal(brand);
  const content = await analyzeContentGeo(domain);
  const reddit = await analyzeRedditPresence(brand);
  const entity = await analyzeEntityGraph(brand, domain, { mockMode: !live });

  const eeaBlended = crawl.reachable
    ? crawl.brand.eeaSignal * 0.4 + offsite.offsiteScore * 0.4 + reddit.redditScore * 0.2
    : offsite.offsiteScore * 0.7 + reddit.redditScore * 0.3;
  // Entity graph measure when usable, else the on-site estimate — see
  // pickEntityCompleteness (shared with apps/worker/src/jobs/audit-run.ts).
  const entityCompleteness = pickEntityCompleteness(entity, crawl.brand.entityCompleteness);

  const scoreInputs = {
    brand: {
      entityCompleteness,
      citationVolume: Math.min(1, citationRate * 1.5),
      eeaSignal: eeaBlended,
    },
    performance: {
      schemaCoverage: content.analyzed
        ? crawl.performance.schemaCoverage * 0.5 + content.contentScore * 0.5
        : crawl.performance.schemaCoverage,
      llmsTxtPresent: crawl.performance.llmsTxtPresent,
      aiCrawlerAccess: crawl.performance.aiCrawlerAccess,
      citationShareVsCompetitors: citationRate,
      aioPresence,
    },
    ai: { citationRate, avgPositionScore, sentimentScore: sentiment.sentimentScore },
  };
  const score = computeGeoScore(scoreInputs);

  // --- Top 3 fixes ---
  const plan = generateStrategy({
    scores: score,
    components: scoreInputs,
    offsiteSources: offsite.sources.map((s) => ({ label: s.label, present: s.present })),
    contentTraits: content.traits,
    displacedByCompetitors: 0,
  });
  const topFixes = plan.recommendations.slice(0, 3);

  // --- 3 ready-to-publish drafts (blog + LinkedIn + FAQ) ---
  // In non-live (mock/test) mode we use templateDraft directly — it produces a
  // structured placeholder without requiring a key. We do NOT call generateContent
  // without a key: that path now returns a graceful error message (for the API
  // endpoint), not a structured template. The kit is designed to degrade gracefully
  // to placeholders, not to show an "add your key" message to a pre-account buyer.
  const platformKey = process.env["ANTHROPIC_API_KEY"];
  const types: ContentType[] = ["blog", "linkedin", "faq"];
  const drafts: Array<{ contentType: ContentType } & ContentDraft> = [];
  for (let i = 0; i < types.length; i++) {
    const rec = topFixes[i] ?? topFixes[0];
    const topic = rec?.action ?? `How ${brand} helps with ${category}`;
    const contentReq = { contentType: types[i]!, brandName: brand, category, topic };
    let draft: ContentDraft;
    if (live && platformKey) {
      draft = await generateContent(contentReq, { apiKey: platformKey });
    } else {
      draft = { ...templateDraft(contentReq), keyUsed: "none" };
    }
    drafts.push({ contentType: types[i]!, ...draft });
  }

  // --- Publish checklist ---
  const checklist: string[] = [
    "Blog post → publish on your website (/blog) and link it from your homepage.",
    "LinkedIn post → publish from your company LinkedIn page (the #2 source AI cites).",
    "FAQ entry → add to your site's FAQ page WITH the schema.org markup included.",
  ];
  if (crawl.reachable && crawl.performance.aiCrawlerAccess < 1) {
    checklist.push("Allow GPTBot, ClaudeBot, PerplexityBot and Google-Extended in your robots.txt — some are currently blocked.");
  }
  if (!entity.found) {
    checklist.push("Create a Wikidata entity for your brand (official website, industry, founding date) so AI recognizes you as a distinct entity.");
  }
  if (reddit.threadCount === 0) {
    checklist.push("Get a genuine mention on Reddit (the #1 source AI cites) — answer a relevant question in your category's subreddit.");
  }
  checklist.push("Re-run your free AI Visibility Test in ~30 days to see movement.");

  return {
    brand,
    generatedAt: new Date().toISOString(),
    live,
    fromTest,
    score,
    topFixes,
    drafts,
    publishChecklist: checklist,
    meta: {
      probesTotal: totalProbes,
      probesCited: citedAny,
      enginesUsed: Array.from(new Set(probe.responses.map((r) => r.provider))),
    },
  };
}
