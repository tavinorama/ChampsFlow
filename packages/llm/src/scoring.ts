/**
 * scoring.ts — GEO Score computation engine
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-2 (Score inputs per vector)
 *  - docs/03-architecture.md §4.2 geo_score entity (score_brand, score_performance, score_ai)
 *  - docs/03-architecture.md §12 GEO-A2 — competitor brand names MUST NOT appear
 *    in strategy/scoring prompt inputs
 *
 * Score vectors (architecture §12 GEO-2):
 *
 *  BRAND (30% weight):
 *    - entityCompleteness: 0–1 normalised score across 4 sources
 *      (Wikidata, Crunchbase, LinkedIn, Google Business)
 *    - citationVolume: 0–1 normalised mention count across permitted providers
 *    - eeaSignal: 0–1 E-E-A-T signal approximation (domain authority of citing sources)
 *    Formula: brand = clamp((entityCompleteness*0.4 + citationVolume*0.4 + eeaSignal*0.2) * 100)
 *
 *  PERFORMANCE (35% weight):
 *    - schemaCoverage: 0–1 schema.org coverage (STANDARD SEO best practice — NOT
 *      "special AI schema"; Google's 2026 generative-AI guide states no special
 *      schema is required, so this is scored as ordinary structured-data hygiene).
 *    - aiCrawlerAccess: 0–1 fraction of AI crawlers with access (crawlability is
 *      explicitly endorsed by Google's guide as a real lever).
 *    - citationShareVsCompetitors: 0–1 share-of-voice (anonymised benchmarks only, GEO-A2)
 *    - aioPresence: bool — Google AI Overview source presence
 *    - llmsTxtPresent: bool — INFORMATIONAL ONLY, weight 0. Google's 2026 guide
 *      states llms.txt is NOT required for generative AI search, so it no longer
 *      contributes to the score; we still surface its presence as a neutral note.
 *    Formula: performance = clamp((
 *      schemaCoverage*0.30 +
 *      aiCrawlerAccess*0.25 +
 *      citationShareVsCompetitors*0.30 +
 *      (aioPresence ? 0.15 : 0)
 *    ) * 100)   // llms.txt removed from scoring 2026-06-10 (Google alignment)
 *
 *  AI (35% weight):
 *    - citationRate: fraction of probe queries where brand was mentioned (0–1)
 *    - avgPositionScore: inverse position score (0–1; position 1 = 1.0, position 5 = 0.2)
 *    - sentimentScore: 0–1 from sentiment distribution (positive=1, neutral=0.5, negative=0)
 *    Formula: ai = clamp((citationRate*0.50 + avgPositionScore*0.30 + sentimentScore*0.20) * 100)
 *
 *  OVERALL:
 *    overall = brand*0.30 + performance*0.35 + ai*0.35
 *    All scores rounded to nearest integer, clamped to [0, 100].
 *
 * GEO-A2 constraint enforcement:
 *  buildStrategyPromptInput() strips/forbids competitor brand names.
 *  Only anonymised numeric benchmarks are passed to strategy prompts.
 *  Any competitor brand name string triggers an error.
 *
 * Deterministic — no randomness, no I/O. Pure functions.
 */

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * BrandInputs — entity presence and citation volume data.
 * All values normalised 0–1 before passing in.
 */
export interface BrandInputs {
  /** Completeness fraction across 4 entity sources (0–1) */
  entityCompleteness: number;
  /** Normalised mention count across permitted providers (0–1) */
  citationVolume: number;
  /** E-E-A-T signal approximation from domain authority of citing sources (0–1) */
  eeaSignal: number;
}

/**
 * PerformanceInputs — schema/crawlability/SERP signal data.
 */
export interface PerformanceInputs {
  /** schema.org coverage on the client's domain (0–1) — standard SEO hygiene */
  schemaCoverage: number;
  /** llms.txt present — INFORMATIONAL ONLY (weight 0); Google states it is not
   *  required for generative AI search. Kept for display, not scored. */
  llmsTxtPresent: boolean;
  /** Fraction of AI crawlers (GPTBot, ClaudeBot, PerplexityBot) with HEAD access (0–1) */
  aiCrawlerAccess: number;
  /**
   * Share-of-voice versus competitor benchmark.
   * GEO-A2: this MUST be an anonymised numeric value (0–1), NOT a brand name.
   * Represents: client mentions / (client mentions + sum of competitor mentions),
   * where competitors are identified only by anonymised rank (competitor_1, competitor_2...).
   */
  citationShareVsCompetitors: number;
  /** Brand appears as a source in Google AI Overview (DataForSEO AIO signal) */
  aioPresence: boolean;
}

/**
 * AIInputs — citation probe results aggregated from ProbeResponse[].
 */
export interface AIInputs {
  /** Fraction of probe queries where brand was cited (0–1) */
  citationRate: number;
  /**
   * Average inverse position score across all probes where brand was cited.
   * position 1 → 1.0, position 2 → 0.5, position 3 → 0.33, etc.
   * 0 if brand was never cited.
   */
  avgPositionScore: number;
  /**
   * Sentiment distribution score (0–1).
   * Computed from: (positiveCount * 1.0 + neutralCount * 0.5 + negativeCount * 0.0)
   * divided by total classified citations.
   * 0.5 if no sentiment data available (neutral default).
   */
  sentimentScore: number;
}

/**
 * GeoScoreInputs — full input to computeGeoScore().
 */
export interface GeoScoreInputs {
  brand: BrandInputs;
  performance: PerformanceInputs;
  ai: AIInputs;
}

/**
 * GeoScoreResult — the 3-vector + overall GEO Score.
 * All values are integers in [0, 100].
 * Written to geo_score table (architecture §4.2).
 */
export interface GeoScoreResult {
  /** BRAND sub-score (0–100) — 30% weight in overall */
  brand: number;
  /** PERFORMANCE sub-score (0–100) — 35% weight in overall */
  performance: number;
  /** AI sub-score (0–100) — 35% weight in overall */
  ai: number;
  /** Overall GEO Score (0–100) — weighted average of three vectors */
  overall: number;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 100] and round to nearest integer */
function clamp100(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * computeGeoScore — deterministic GEO Score computation.
 *
 * Formula documented in file header. All inputs normalised 0–1.
 * All outputs integers in [0, 100].
 *
 * @param inputs  BrandInputs + PerformanceInputs + AIInputs
 * @returns       GeoScoreResult with brand, performance, ai, overall (all 0–100)
 */
export function computeGeoScore(inputs: GeoScoreInputs): GeoScoreResult {
  // BRAND sub-score (30% of overall)
  // Formula: (entityCompleteness*0.4 + citationVolume*0.4 + eeaSignal*0.2) * 100
  const brandRaw =
    inputs.brand.entityCompleteness * 0.4 +
    inputs.brand.citationVolume * 0.4 +
    inputs.brand.eeaSignal * 0.2;
  const brandScore = clamp100(brandRaw * 100);

  // PERFORMANCE sub-score (35% of overall)
  // Formula: (schemaCoverage*0.30 + aiCrawlerAccess*0.25 + citationShare*0.30
  //           + aioPresence*0.15) * 100
  // NOTE: llms.txt removed from scoring 2026-06-10 — Google's 2026 generative-AI
  // guide states it is NOT required. Its 0.05 weight moved to aiCrawlerAccess
  // (crawlability, which Google explicitly endorses). llmsTxtPresent is retained
  // on the input for informational display only.
  const performanceRaw =
    inputs.performance.schemaCoverage * 0.3 +
    inputs.performance.aiCrawlerAccess * 0.25 +
    inputs.performance.citationShareVsCompetitors * 0.3 +
    (inputs.performance.aioPresence ? 0.15 : 0);
  const performanceScore = clamp100(performanceRaw * 100);

  // AI sub-score (35% of overall)
  // Formula: (citationRate*0.50 + avgPositionScore*0.30 + sentimentScore*0.20) * 100
  const aiRaw =
    inputs.ai.citationRate * 0.5 +
    inputs.ai.avgPositionScore * 0.3 +
    inputs.ai.sentimentScore * 0.2;
  const aiScore = clamp100(aiRaw * 100);

  // OVERALL = brand*0.30 + performance*0.35 + ai*0.35
  const overallRaw =
    brandScore * 0.3 +
    performanceScore * 0.35 +
    aiScore * 0.35;
  const overallScore = clamp100(overallRaw);

  return {
    brand: brandScore,
    performance: performanceScore,
    ai: aiScore,
    overall: overallScore,
  };
}

// ---------------------------------------------------------------------------
// Three-score split — product-facing scores for the Ozvor AI Visibility Score
// ---------------------------------------------------------------------------

/**
 * ThreeScoreResult — the three product-facing scores for the Ozvor AI Visibility Score.
 * All values are integers in [0, 100] except executionProgress which may be null.
 *
 * Visibility = the AI vector (what AI engines actually observe: citation rate + position + sentiment).
 * CitationReadiness = weighted blend of performance (0.60) + brand (0.40) vectors —
 *   these measure what the brand CONTROLS (schema, crawlers, content, entity completeness,
 *   off-site presence, E-E-A-T). Weights: 0.60 performance + 0.40 brand.
 * ExecutionProgress = % of accepted plan_task rows marked done (null = no cards yet).
 */
export interface ThreeScoreResult {
  /** Visibility (0–100): what AI engines do with the brand — citation rate, position, sentiment. */
  visibility: number;
  /**
   * Citation Readiness (0–100): how ready the brand is to be cited.
   * Formula: round(clamp(performance * 0.60 + brand * 0.40))
   * Weights: performance 60% (schema, AI-crawler access, content, share-of-voice, AIO)
   *          brand 40% (entity completeness, E-E-A-T, off-site authority)
   */
  citationReadiness: number;
  /**
   * Execution Progress (0–100): % of action cards (plan_task) completed.
   * null when no cards have been created for this brand (not started, not 0%).
   * Computed live from plan_task — never stored as a snapshot.
   */
  executionProgress: number | null;
}

/**
 * computeThreeScores — derives the three product-facing scores from the
 * existing GeoScoreResult vectors + a live execution progress value.
 *
 * Citation Readiness weights:
 *   performance × 0.60 — schema coverage, AI-crawler access, content citation-worthiness,
 *                         share-of-voice, Google AIO presence. These are what brands can
 *                         directly fix via technical and content improvements.
 *   brand × 0.40 — entity completeness, E-E-A-T signal, off-site authority. These are
 *                   controllable (Wikidata edits, review-site presence) but slower to move.
 *
 * @param geoResult  Output of computeGeoScore() — the three raw vectors
 * @param executionProgress  Pre-computed execution % (0–100), or null if no cards exist
 * @returns ThreeScoreResult — the three product-facing scores
 */
export function computeThreeScores(
  geoResult: GeoScoreResult,
  executionProgress: number | null
): ThreeScoreResult {
  // Visibility = the AI sub-score (observed citations)
  const visibility = geoResult.ai;

  // Citation Readiness = performance × 0.60 + brand × 0.40 (both 0–100)
  const citationReadiness = clamp100(geoResult.performance * 0.6 + geoResult.brand * 0.4);

  return { visibility, citationReadiness, executionProgress };
}

// ---------------------------------------------------------------------------
// GEO-A2 — Strategy prompt input builder
// ---------------------------------------------------------------------------

/**
 * AnonymisedBenchmark — numeric competitor benchmark with NO brand name.
 *
 * GEO-A2 constraint: competitor brand names MUST NOT appear in strategy prompts.
 * Only rank-indexed numeric benchmarks are permitted.
 */
export interface AnonymisedBenchmark {
  /** Ordinal rank of the competitor (1 = highest scorer among competitors) */
  rank: number;
  /** Competitor's AI sub-score (0–100) — no brand name */
  aiScore: number;
  /** Competitor's PERFORMANCE sub-score (0–100) */
  performanceScore: number;
  /** Competitor's BRAND sub-score (0–100) */
  brandScore: number;
}

/**
 * StrategyPromptInput — the sanitised input object for the C3 Strategy Generator.
 *
 * GEO-A2 guarantee: this type contains NO brand name strings except the client's own.
 * Competitor data appears only as anonymised numeric benchmarks.
 */
export interface StrategyPromptInput {
  /** The client's own brand name (the entity being optimised) */
  clientBrandName: string;
  /** Client's current GEO scores */
  clientScores: GeoScoreResult;
  /**
   * Anonymised competitor benchmarks — numeric only, no competitor brand names.
   * GEO-A2: strategy prompt receives ONLY these anonymised percentiles.
   */
  competitorBenchmarks: AnonymisedBenchmark[];
  /** Score gaps: how far the client is below each competitor benchmark per vector */
  gaps: {
    brandGap: number;   // client brand - max competitor brand (negative = gap)
    performanceGap: number;
    aiGap: number;
  };
}

/**
 * RawCompetitorData — internal representation with brand names.
 * NEVER exposed to strategy prompts (GEO-A2).
 */
interface RawCompetitorData {
  brandName: string;
  scores: GeoScoreResult;
}

/**
 * buildStrategyPromptInput — build strategy prompt input with GEO-A2 enforcement.
 *
 * This function:
 *  1. Validates that no competitor brand name appears in the output
 *  2. Strips brand names and replaces with rank indices
 *  3. Throws if any competitor brand name matches the client brand name (misconfiguration)
 *
 * GEO-A2 guarantee: the returned object NEVER contains a competitor brand name string.
 *
 * @param clientBrandName  The client's brand name (included in output)
 * @param clientScores     Client's computed GeoScoreResult
 * @param competitors      Raw competitor data with names (stripped before output)
 * @returns                StrategyPromptInput safe for use in strategy generation prompts
 * @throws                 Error if competitor brand name found in sanitised output (invariant violation)
 */
export function buildStrategyPromptInput(
  clientBrandName: string,
  clientScores: GeoScoreResult,
  competitors: RawCompetitorData[]
): StrategyPromptInput {
  // Sort competitors by overall score descending before anonymising
  const sorted = [...competitors].sort((a, b) => b.scores.overall - a.scores.overall);

  // Build anonymised benchmarks — strip brand names
  const competitorBenchmarks: AnonymisedBenchmark[] = sorted.map((comp, index) => ({
    rank: index + 1,
    aiScore: comp.scores.ai,
    performanceScore: comp.scores.performance,
    brandScore: comp.scores.brand,
  }));

  // Compute gaps vs top competitor
  const topCompetitor = sorted[0];
  const gaps = {
    brandGap: topCompetitor
      ? clientScores.brand - topCompetitor.scores.brand
      : 0,
    performanceGap: topCompetitor
      ? clientScores.performance - topCompetitor.scores.performance
      : 0,
    aiGap: topCompetitor
      ? clientScores.ai - topCompetitor.scores.ai
      : 0,
  };

  const result: StrategyPromptInput = {
    clientBrandName,
    clientScores,
    competitorBenchmarks,
    gaps,
  };

  // GEO-A2 invariant check: verify NO competitor brand name appears in the serialised output
  // This catches any future code changes that accidentally leak brand names
  const serialised = JSON.stringify(result);
  for (const comp of competitors) {
    if (comp.brandName && comp.brandName.trim().length > 0) {
      // Check that neither the brand name nor any substring appears in competitor benchmarks
      // (clientBrandName is permitted to appear — it's the client's own brand)
      if (
        comp.brandName !== clientBrandName &&
        serialised.includes(comp.brandName)
      ) {
        throw new Error(
          `GEO-A2 violation: competitor brand name "${comp.brandName}" found in ` +
          `strategy prompt input. Competitor names must never appear in strategy prompts. ` +
          `Only anonymised numeric benchmarks are permitted.`
        );
      }
    }
  }

  return result;
}
