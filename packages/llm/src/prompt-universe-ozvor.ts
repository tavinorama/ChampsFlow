/**
 * prompt-universe-ozvor.ts — the Ozvor workspace's own prompt universe (P0-06).
 *
 * THE PROBLEM THIS FIXES
 * ----------------------
 * Ozvor measures itself with the generic default portfolio. Those prompts ask
 * for "the best <category> for small businesses" and "best <category> for SMBs
 * on a budget". Nobody reaches an AI-visibility product by asking that. We
 * were scoring ourselves in a category we do not compete in, and then reading
 * the noise as a trend.
 *
 * This module holds two lists:
 *
 *   OZVOR_RETIRED_PROMPTS  the generic questions being ARCHIVED, each with the
 *                          reason it no longer represents the category.
 *   OZVOR_PROMPT_UNIVERSE  their replacements: GEO / AI visibility / brand
 *                          monitoring / local service / agency questions.
 *
 * ARCHIVE, NEVER DELETE
 * ---------------------
 * History is append-only in this house. The retired prompts keep their rows
 * (archived_at + archived_reason set), keep their citation_check evidence, and
 * keep appearing in the audit trail (prompt_universe_event). Nothing about a
 * past measurement is rewritten — the point is that future runs stop pretending
 * to continue it.
 *
 * THIS IS A DELIBERATE, APPROVED METHODOLOGY BREAK
 * ------------------------------------------------
 * Swapping the questions changes the score. The founder approved that on
 * 2026-09-03 on the condition that the break is explicit and labelled: the run
 * carries prompt_set_version + prompt_set_hash, the trend refuses to connect
 * across the break, and the badge reads "Prompt set changed". No historical
 * score is recomputed or relabelled — see the backfill policy in
 * docs/methodology-changelog.md.
 *
 * Pure data + pure functions. No I/O.
 */

import type { PromptDefinition, PromptCohort } from "./prompt-universe";
import { PROMPT_UNIVERSE_VERSION } from "./prompt-universe";

/** The date the founder approved the swap (report section 4). */
export const OZVOR_UNIVERSE_APPROVED_AT = "2026-09-03T00:00:00.000Z";

/**
 * One retired prompt: the text as it was, and why it leaves the universe.
 * A reason is mandatory — "we changed our minds" is not an audit trail, and
 * the DB refuses an archived row without one.
 */
export interface RetiredPrompt {
  /** Substring match, case-insensitive, against the live prompt text. */
  matchText: string;
  reason: string;
}

/**
 * The generic prompts leaving the Ozvor workspace universe.
 *
 * These are matched by TEXT rather than id because they were generated
 * in-process by buildIntentPortfolio() and, for the defaults, never had a row
 * of their own. The migration writes them into audit_prompt as archived rows
 * so the retirement itself is a fact in the database, not a code comment.
 */
export const OZVOR_RETIRED_PROMPTS: readonly RetiredPrompt[] = Object.freeze([
  {
    matchText: "best SaaS for small businesses",
    reason:
      "Generic SaaS discovery. Ozvor competes in AI search visibility, not in the undifferentiated SaaS category; buyers never reach us through this question.",
  },
  {
    matchText: "best SaaS for SMBs on a budget",
    reason:
      "Price-led generic SaaS question. Wrong category and wrong buying motion — it measured a market we do not sell into.",
  },
  {
    matchText: "What is the best solution for small businesses",
    reason:
      "Category placeholder ('solution') with no vertical. Unanswerable in a way that maps to our market; the engines answer about whatever they like.",
  },
  {
    matchText: "Best solution for SMBs on a budget",
    reason:
      "Same placeholder category, price-led. No demand evidence and no buyer intent we can act on.",
  },
  {
    matchText: "Top SaaS providers in 2026",
    reason:
      "Year-stamped generic vendor list. Freshness decays annually and the category is not ours.",
  },
  {
    matchText: "SaaS alternatives worth considering",
    reason:
      "Alternatives question against the wrong category — the competitor set it surfaces is not our competitive set.",
  },
]);

interface Seed {
  id: string;
  text: string;
  cohort: PromptCohort;
  intent: PromptDefinition["intent"];
  funnelStage: PromptDefinition["funnelStage"];
  branded: boolean;
  businessValue: number;
  relevanceScore: number;
  vertical: string;
  market: string;
  locale: string;
  expectedCompetitors: string[];
  /** Rotating cohorts get a bounded window; benchmark stays open for 90d. */
  validUntil?: string;
}

const DEFAULT_COMPETITORS = [
  "Profound",
  "Otterly",
  "AthenaHQ",
  "Semrush",
  "Ahrefs Brand Radar",
  "SEOmonitor",
];

/**
 * Benchmark cohort freeze window. The report calls for 90 days: long enough
 * that a trend means something, short enough that the questions do not rot.
 */
export const BENCHMARK_FREEZE_DAYS = 90;

const SEEDS: readonly Seed[] = Object.freeze([
  // --- benchmark: the frozen questions that carry the trend ------------------
  {
    id: "ozvor-bm-geo-tool",
    text: "Which tools track how a brand appears in AI search answers?",
    cohort: "benchmark",
    intent: "discovery",
    funnelStage: "awareness",
    branded: false,
    businessValue: 1,
    relevanceScore: 0.95,
    vertical: "ai-search-visibility",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-geo-agency",
    text: "How can an agency report AI search visibility to its clients?",
    cohort: "benchmark",
    intent: "solution",
    funnelStage: "consideration",
    branded: false,
    businessValue: 0.9,
    relevanceScore: 0.9,
    vertical: "agency",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-brand-monitoring",
    text: "What is the best way to monitor brand mentions inside ChatGPT and Perplexity?",
    cohort: "benchmark",
    intent: "problem",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.95,
    relevanceScore: 0.93,
    vertical: "brand-monitoring",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-geo-vs-seo",
    text: "Generative engine optimization compared with traditional SEO: which platforms cover both?",
    cohort: "benchmark",
    intent: "comparison",
    funnelStage: "consideration",
    branded: false,
    businessValue: 0.85,
    relevanceScore: 0.88,
    vertical: "geo",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-local-service",
    text: "How does a local service business get recommended by AI assistants?",
    cohort: "benchmark",
    intent: "local",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.9,
    relevanceScore: 0.9,
    vertical: "local-service",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-trust",
    text: "Which AI visibility platforms do marketers actually trust for reporting?",
    cohort: "benchmark",
    intent: "trust",
    funnelStage: "decision",
    branded: false,
    businessValue: 0.95,
    relevanceScore: 0.9,
    vertical: "ai-search-visibility",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-branded-direct",
    text: "What is Ozvor and what does it measure?",
    cohort: "benchmark",
    intent: "branded",
    funnelStage: "consideration",
    branded: true,
    businessValue: 0.8,
    relevanceScore: 0.85,
    vertical: "ai-search-visibility",
    market: "US",
    locale: "en-US",
    expectedCompetitors: [],
  },
  {
    id: "ozvor-bm-branded-compare",
    text: "How does Ozvor compare with other AI visibility trackers?",
    // "branded" is an INTENT, never a cohort: a brand-name question still
    // belongs in the frozen benchmark set that carries the trend.
    cohort: "benchmark",
    intent: "branded",
    funnelStage: "decision",
    branded: true,
    businessValue: 0.9,
    relevanceScore: 0.87,
    vertical: "ai-search-visibility",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-br-geo",
    text: "Como medir se uma marca aparece nas respostas do ChatGPT e do Perplexity?",
    cohort: "benchmark",
    intent: "problem",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.85,
    relevanceScore: 0.88,
    vertical: "brand-monitoring",
    market: "BR",
    locale: "pt-BR",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },
  {
    id: "ozvor-bm-eu-geo",
    text: "Which GDPR-compliant tools measure brand visibility in AI assistants for EU companies?",
    cohort: "benchmark",
    intent: "solution",
    funnelStage: "consideration",
    branded: false,
    businessValue: 0.85,
    relevanceScore: 0.86,
    vertical: "ai-search-visibility",
    market: "PT",
    locale: "en-GB",
    expectedCompetitors: DEFAULT_COMPETITORS,
  },

  // --- opportunity: rotating, bounded freshness ------------------------------
  {
    id: "ozvor-op-aio-citation",
    text: "Why does Google AI Overview cite some sources and ignore others?",
    cohort: "opportunity",
    intent: "problem",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.7,
    relevanceScore: 0.8,
    vertical: "geo",
    market: "US",
    locale: "en-US",
    expectedCompetitors: DEFAULT_COMPETITORS,
    validUntil: "2026-12-31T00:00:00.000Z",
  },
  {
    id: "ozvor-op-llms-txt",
    text: "Does an llms.txt file change whether AI assistants cite a website?",
    cohort: "opportunity",
    intent: "problem",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.6,
    relevanceScore: 0.75,
    vertical: "geo",
    market: "US",
    locale: "en-US",
    expectedCompetitors: [],
    validUntil: "2026-12-31T00:00:00.000Z",
  },
  {
    id: "ozvor-op-ai-stack-audit",
    text: "How do small businesses choose which AI tools to actually adopt?",
    cohort: "opportunity",
    intent: "discovery",
    funnelStage: "awareness",
    branded: false,
    businessValue: 0.75,
    relevanceScore: 0.78,
    vertical: "ai-stack-audit",
    market: "BR",
    locale: "pt-BR",
    expectedCompetitors: [],
    validUntil: "2026-12-31T00:00:00.000Z",
  },
]);

/**
 * The Ozvor workspace universe.
 *
 * `now` is passed in (no clock in this module) and fixes the benchmark freeze
 * window, so a test can assert the 90-day freeze without faking timers. The
 * `customer` cohort is intentionally EMPTY here: Ozvor's own customer-approved
 * questions live in the database, not in shipped code, and composeUniverse()
 * redistributes the unfilled quota with an explicit note rather than silently
 * pretending a 60/20/20 happened.
 */
export function buildOzvorUniverse(now: string): PromptDefinition[] {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new Error(`ozvor_universe_now_invalid: "${now}"`);
  const freezeUntil = new Date(
    nowMs + BENCHMARK_FREEZE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  return SEEDS.map((s) => ({
    id: s.id,
    text: s.text,
    cohort: s.cohort,
    intent: s.intent,
    vertical: s.vertical,
    market: s.market,
    locale: s.locale,
    funnelStage: s.funnelStage,
    // Demand is null until the intent map (GSC/Ads/PAA/CRM) actually measures
    // it. Null is "not measured" and must never be read as zero demand.
    demand: null,
    businessValue: s.businessValue,
    relevanceScore: s.relevanceScore,
    branded: s.branded,
    expectedCompetitors: [...s.expectedCompetitors],
    validFrom: now,
    validUntil: s.validUntil ?? (s.cohort === "opportunity" ? freezeUntil : null),
    version: PROMPT_UNIVERSE_VERSION,
    approvedBy: "founder",
    ownerType: "ozvor" as const,
    archivedAt: null,
    archivedReason: null,
  }));
}

/**
 * Does this live prompt text belong to the retired generic set?
 * Case-insensitive substring match, so both the "SaaS" and the "solution"
 * placeholder variants produced by buildIntentPortfolio() are caught.
 */
export function findRetirement(text: string): RetiredPrompt | null {
  const t = text.toLowerCase();
  for (const r of OZVOR_RETIRED_PROMPTS) {
    if (t.includes(r.matchText.toLowerCase())) return r;
  }
  return null;
}

export interface ArchivePlanEntry {
  text: string;
  reason: string;
}

export interface ArchivePlan {
  /** Prompts to soft-archive (archived_at + archived_reason). Never deleted. */
  archive: ArchivePlanEntry[];
  /** Prompts left untouched. */
  keep: string[];
}

/**
 * Plan the workspace migration: which of the currently live prompt texts get
 * archived and why. Returns a plan rather than performing it — the caller
 * writes both the audit_prompt update and the prompt_universe_event row in one
 * transaction, so an archive can never happen without its trail.
 */
export function planOzvorArchive(liveTexts: readonly string[]): ArchivePlan {
  const archive: ArchivePlanEntry[] = [];
  const keep: string[] = [];
  for (const text of liveTexts) {
    const hit = findRetirement(text);
    if (hit) archive.push({ text, reason: hit.reason });
    else keep.push(text);
  }
  return { archive, keep };
}
