/**
 * LLM Gateway — Provider-agnostic interface
 *
 * Architecture refs:
 *  - §12 AI/ML Components — LLM Gateway Internal Interface
 *  - FD-1: provider-agnostic abstraction with pluggable adapters
 *  - FD-3: v1 default = Anthropic Claude Sonnet
 *
 * This file defines the canonical types from §12 and exports a stub
 * Anthropic adapter (signature only — implementation in C1 AI Post Generation).
 *
 * Hard rule: No capability may call an LLM provider directly.
 * All calls MUST route through the gateway.
 *
 * Activating any provider other than Anthropic requires per-provider compliance
 * review (legal-privacy-officer + ai-ethics-reviewer signoff in gate-log).
 */

// ---------------------------------------------------------------------------
// Provider enum — matches architecture §12 exactly
// ---------------------------------------------------------------------------

export type LLMProvider = "anthropic" | "openai" | "google" | "mistral";

// ---------------------------------------------------------------------------
// Request shape — architecture §12
// ---------------------------------------------------------------------------

export interface LLMRequest {
  /** Hardcoded in gateway; not user-editable */
  system_prompt: string;
  /** User-supplied topic text */
  user_prompt: string;
  /** Platform-specific limit enforced by gateway */
  max_tokens: number;
  /** Default 0.7; configurable per use-case */
  temperature?: number;
  /** Optional override; defaults to configured v1 default (Anthropic) */
  provider?: LLMProvider;
  /** UUID for correlation and idempotency */
  request_id: string;
  /** Enable streaming response (architecture §12) */
  stream?: boolean;
  /**
   * Tenant region — used by AnthropicAdapter for EU/US routing (architecture §8 + FD-3).
   * 'eu' → Bedrock eu-central-1; 'us' → direct Anthropic API.
   * Resolved from JWT custom claim; never from request body.
   */
  tenant_region?: "eu" | "us";
}

// ---------------------------------------------------------------------------
// Response shape — architecture §12
// ---------------------------------------------------------------------------

export interface LLMResponse {
  /** Generated draft text */
  text: string;
  /** e.g., 'claude-sonnet-4-5', 'gpt-4o' */
  model_name: string;
  /** Provider-reported version/snapshot */
  model_version: string;
  provider: LLMProvider;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  /**
   * Gateway asserts ZDR mode was active for this call.
   * Must be TRUE for all EU tenant inferences.
   * Logged in generation_log.zdr_confirmed.
   */
  zdr_confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Error envelope — architecture §12
// ---------------------------------------------------------------------------

export interface LLMError {
  code:
    | "rate_limit"     // 429 / ThrottlingException — retryable
    | "context_length" // token limit exceeded — not retryable
    | "safety"         // content policy rejection — not retryable
    | "unavailable"    // generic provider error — retryable
    | "zdr_not_confirmed"; // ZDR assertion failure — not retryable
  provider: LLMProvider;
  retryable: boolean;
  message: string;
}

export class LLMGatewayError extends Error {
  constructor(public readonly error: LLMError) {
    super(error.message);
    this.name = "LLMGatewayError";
  }
}

// ---------------------------------------------------------------------------
// Provider adapter interface
// Every provider adapter must implement this interface.
// ---------------------------------------------------------------------------

export interface LLMProviderAdapter {
  readonly provider: LLMProvider;
  /**
   * Execute a single generation request.
   * Must assert ZDR is active before sending.
   * Must throw LLMGatewayError on error (never let raw provider errors escape).
   */
  generate(request: LLMRequest): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Anthropic adapter — real implementation in packages/llm/src/anthropic.ts
// ---------------------------------------------------------------------------
// Re-exported from the concrete module (C1 AI Post Generation).
// Also imported into scope below for the gateway singleton's use.
// ---------------------------------------------------------------------------
import { AnthropicAdapter } from "./anthropic";
export { AnthropicAdapter };

// ---------------------------------------------------------------------------
// GEO Audit Engine — packages/llm GEO layer (C1 implementation slice)
// Architecture ref: docs/03-architecture.md §12 GEO-1 through GEO-5
// ---------------------------------------------------------------------------

// Provider types (GEO — note: GEO uses extended LLMProvider including 'gemini', 'perplexity', 'serp')
export type {
  LLMProvider as GeoLLMProvider,
  UserRegion,
  ProbeQuery,
  ProbeResponse,
  ProbeUsage,
  ProviderAdapter,
  ProbeCallOptions,
  ProviderErrorKind,
} from "./providers/types";
export {
  ProviderError,
  mockAllowed,
  webSearchEnabled,
  providerSurface,
  mergeProbeUsage,
} from "./providers/types";

// #152 — list-price cost of measured usage (tokens × published price)
export {
  PROVIDER_PRICES,
  WEB_SEARCH_USD_PER_REQUEST,
  priceForModel,
  measuredCostCents,
  type ModelPrice,
  type MeasuredUsage,
} from "./cost";

// #152 — the one writer for api_spend (measured › rate › flat, legacy-schema tolerant)
export {
  recordSpend,
  execForPostgresJs,
  execForPg,
  type SpendExec,
  type SpendInput,
  type SpendResult,
  type SpendSource,
} from "./api-spend";

// Routing gate — single chokepoint for EU/US provider access control (GEO-A3)
export { routeProvider, permittedProviders } from "./providers/routing";

// Provider adapters — mock mode when key env var absent (CRITICAL requirement)
export { AnthropicProbeAdapter } from "./providers/anthropic";
export { OpenAIProbeAdapter } from "./providers/openai";
export { GeminiProbeAdapter } from "./providers/gemini";
export { PerplexityProbeAdapter } from "./providers/perplexity";
export { SerpProbeAdapter } from "./providers/serp";

// Gateway — fan-out orchestration
export type { RunProbesOptions, RunProbesResult } from "./providers/gateway";
export { runProbes } from "./providers/gateway";

// B1 — Wilson 95% intervals + intent×engine aggregation
export type { WilsonInterval, FormulationTally, IntentEngineStat } from "./wilson";
export { wilson95, aggregateIntentEngine } from "./wilson";

// B1 — intent-classified default prompt portfolio (single source of truth)
export type { PortfolioPrompt, PortfolioIntent } from "./prompt-portfolio";
export { buildIntentPortfolio, PORTFOLIO_INTENTS } from "./prompt-portfolio";

// P0-06 — Prompt Universe v2: versioned PromptDefinition, configurable cohort
// composition (60/20/20 is a DEFAULT, not a law) and prompt-set identity.
export type {
  PromptDefinition,
  PromptCohort,
  PromptIntent,
  PromptDemand,
  PromptOwnerType,
  FunnelStage,
  CohortMix,
  CohortMixResolution,
  ComposeOptions,
  ComposedUniverse,
} from "./prompt-universe";
export {
  PROMPT_UNIVERSE_VERSION,
  PROMPT_COHORTS,
  PROMPT_INTENTS,
  FUNNEL_STAGES,
  OWNER_TYPES,
  DEFAULT_COHORT_MIX,
  resolveCohortMix,
  parseCohortMixEnv,
  composeUniverse,
  largestRemainder,
  promptPriority,
  promptSetHash,
} from "./prompt-universe";

// P0-06 — the Ozvor workspace's own universe + the archive plan for the
// generic "best SaaS for SMBs" prompts it replaces.
export type { RetiredPrompt, ArchivePlan, ArchivePlanEntry } from "./prompt-universe-ozvor";
export {
  OZVOR_RETIRED_PROMPTS,
  OZVOR_UNIVERSE_APPROVED_AT,
  BENCHMARK_FREEZE_DAYS,
  buildOzvorUniverse,
  findRetirement,
  planOzvorArchive,
} from "./prompt-universe-ozvor";

// P0-06 — what may enter the universe (and therefore the score's denominator).
export type {
  Violation,
  ViolationCode,
  ViolationSeverity,
  PromptVerdict,
  QualityGateConfig,
  QualityGateContext,
  QualityGateResult,
} from "./prompt-quality-gate";
export {
  DEFAULT_QUALITY_GATE,
  evaluatePrompt,
  runQualityGate,
  mentionsBrand,
  normaliseTokens,
  jaccard,
  containment,
  promptSimilarity,
} from "./prompt-quality-gate";

// B1 — sequential sampling protocol (lean base + escalate-on-ambiguity)
export type {
  SamplingQuery,
  SequentialSamplingOptions,
  SequentialSamplingResult,
  SamplingEscalation,
} from "./sampling";
export {
  runProbesSequential,
  mergeProbeResponses,
  responseSuccesses,
  GEO_METHODOLOGY_VERSION,
} from "./sampling";

// B8 — 24h aggregated probe cache (store injected by the worker)
export type { ProbeCacheStore } from "./probe-cache";
export {
  probeCacheEnabled,
  probeCacheKey,
  getCachedProbe,
  setCachedProbe,
  PROBE_CACHE_TTL_SECONDS,
} from "./probe-cache";

// Citation parser — deterministic mention + position + source extraction
export type { CitationParseResult } from "./citation-parser";
export { parseCitation } from "./citation-parser";

// B4 — daily anti-drift control battery (positive + negative controls)
export type {
  DriftControl,
  DriftControlKind,
  DriftControlResult,
  DriftBatteryOutcome,
  DriftEvaluation,
  DriftStatus,
  DriftEngine,
  DriftCallInput,
  DriftLLMCaller,
  RunDriftBatteryOptions,
  VerifiedDetection,
} from "./drift-control";
export {
  DRIFT_CONTROLS,
  DRIFT_THRESHOLDS,
  DRIFT_BATTERY_VERSION,
  DRIFT_POSITIVE_EXPECTED_RATE,
  driftControlEnabled,
  detectMention,
  detectMentionVerified,
  runDriftBattery,
  evaluateDrift,
  estimateDriftCostCents,
} from "./drift-control";

// B3 — two-pass citation extraction (extractor + blind verifier). Removes the
// false positives single-pass matching produced (negation, homonym, source-only).
export type {
  Mention,
  VerifiedMention,
  ExtractionResult,
  ExtractionInput,
  ExtractionOptions,
  ExtractionLLM,
  ExtractionLLMRequest,
  ExtractionMode,
  MentionKind,
  MentionVerdict,
} from "./extraction";
export {
  extractMentions,
  extractMentionsBatch,
  twoPassExtractionEnabled,
  countsAsCitation,
  isBrandMention,
  defaultExtractionLLM,
  ExtractionUnavailableError,
  EXTRACTION_METHODOLOGY_VERSION,
  MAX_VERIFIED_MENTIONS,
} from "./extraction";

// Scoring engine — deterministic GEO Score computation (GEO-2)
export type {
  BrandInputs,
  PerformanceInputs,
  AIInputs,
  GeoScoreInputs,
  GeoScoreResult,
  AnonymisedBenchmark,
  StrategyPromptInput,
  ThreeScoreResult,
} from "./scoring";
export { computeGeoScore, buildStrategyPromptInput, computeThreeScores } from "./scoring";

// Site crawl — measures Brand + Performance inputs from the real website.
export type { SiteCrawlResult } from "./site-crawl";
export { crawlSite } from "./site-crawl";

// Competitor detection — "who AI recommends instead of you".
export { detectCompetitors, tallyCompetitors } from "./competitor-detect";
export type { CompetitorProbe, CompetitorTally } from "./competitor-detect";

// Off-site signal — presence on the high-authority sources AI cites most.
export type { OffsiteSignalResult, OffsitePresence } from "./offsite-signal";
export { measureOffsiteSignal, OFFSITE_SOURCES } from "./offsite-signal";

// Content GEO — multi-page citation-worthiness (Princeton GEO traits).
export type { ContentGeoResult } from "./content-geo";
export { analyzeContentGeo } from "./content-geo";

// Visibility Loop v2 — deterministic "Do Next" refresh from audit evidence.
export type {
  LoopProbe,
  LoopCandidate,
  LoopBuildResult,
  LoopTaskRow,
  PrevTask,
  ReconcileStats,
} from "./visibility-loop";
export type { OwnGap } from "./visibility-loop";
export {
  ownGapsBlock,
  isActionableSource,
  NON_ACTIONABLE_SOURCE_HOSTS,
  buildLoopCandidates,
  reconcileLoopTasks,
  sourceDomain,
  gapForUncited,
  gapForLowRank,
  gapForSource,
  LOOP_OPEN_CAP,
  LOOP_DONE_CARRY_CAP,
  VERIFIED_PREFIX,
} from "./visibility-loop";

// Strategy Generator — GEO Content Plan (C3).
export type { StrategyInputs, StrategyPlan, Recommendation, CalendarItem } from "./strategy-generator";
export { generateStrategy, toCalendarTopic } from "./strategy-generator";

// Content Studio — draft generation for blog/LinkedIn/FAQ (C4, GEO-A2).
export type { ContentType, ContentRequest, ContentDraft, ContentProvider } from "./content-studio";
export { generateContent, templateDraft, CONTENT_PROVIDER_LABELS } from "./content-studio";

// Sentiment — AI-vector brand perception classifier (removes last AI baseline).
export type { SentimentResult, SentimentProbeInput } from "./sentiment";
export { analyzeSentiment } from "./sentiment";

// SSRF guard — hardened fetch for user-supplied URLs (GEO-SEC-1/GEO-SEC-4).
export { guardedFetch, assertPublicUrl } from "./ssrf-guard";

// Reddit deep-dive (C5) — threads/subreddits/sentiment on the #1 cited source.
export type { RedditSignalResult } from "./reddit-signal";
export { analyzeRedditPresence, subredditFromUrl } from "./reddit-signal";

// Entity graph (C7) — cross-source consistency (Wikidata/Wikipedia); closes the
// last BRAND baseline (entityCompleteness).
export type { EntityGraphResult } from "./entity-graph";
export { analyzeEntityGraph, pickEntityCompleteness } from "./entity-graph";

// "The AI Invisibility Test" — free lead magnet (1 prompt × brand vs competitor).
export type {
  FreeTestResult,
  InvisibilityTestResult,
  EngineResult,
  FreeTestUsage,
  RunInvisibilityTestOptions,
} from "./invisibility-test";
export { runInvisibilityTest, buildTestPrompt } from "./invisibility-test";

// "The Get-Cited Kit" — $29 one-time deliverable (audit + top-3 + 3 drafts).
export type { KitDeliverable, KitInput } from "./kit-deliverable";
export { buildKitDeliverable, buildFallbackKitDeliverable } from "./kit-deliverable";

// Content GEO scoring primitives, exported for reuse (Ozvor Pages generator, #208).
export type { ContentTraitFlags } from "./content-geo";
export { scorePage, computeContentScoreFromTraits } from "./content-geo";

// Ozvor Pages — 5-page website bundle generator (#208 PR-4).
export type {
  LandingBusinessInput,
  LandingTestimonialInput,
  LandingReviewInput,
  LandingPhotoInput,
  LandingFaqInput,
  LandingCrawlSummary,
  LandingGenerateInput,
  LandingGenerateOptions,
  LandingSectionType,
  LandingSection,
  LandingPageSeo,
  LandingBundlePageType,
  LandingBundlePage,
  LandingBundle,
  LandingTheme,
} from "./landing-generate";
export {
  buildLandingBundle,
  deriveReviewThemes,
  deriveLandingTheme,
  buildLocalBusinessJsonLd,
  buildFaqPageJsonLd,
  LANDING_DEFAULT_BRAND,
  landingSlugify,
  renderSectionsForScoring,
  providerTextPort,
} from "./landing-generate";
export type { LandingTextPort } from "./landing-generate";
// Two-stage (Kimi draft → Claude refine) pipeline, D5.
export { buildLandingBundleStaged } from "./landing-stages";
export type { StagedLandingBundle, LandingStages, StageStatus, LandingStagePorts } from "./landing-stages";

// Static-site export (client downloads the pages for their own hosting).
export { buildLandingExport, escapeHtml } from "./landing-export";
export type { ExportSiteInput, ExportBusiness, ExportPage, ExportFile } from "./landing-export";

// ---------------------------------------------------------------------------
// OpenAI adapter — STUB (not activated for v1; compliance review required)
// ---------------------------------------------------------------------------
export class OpenAIAdapter implements LLMProviderAdapter {
  readonly provider: LLMProvider = "openai";

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    throw new LLMGatewayError({
      code: "unavailable",
      provider: "openai",
      retryable: false,
      message:
        "OpenAI provider is not activated for v1. " +
        "Activation requires per-provider compliance review " +
        "(legal-privacy-officer + ai-ethics-reviewer signoff in gate-log).",
    });
  }
}

// ---------------------------------------------------------------------------
// Google adapter — STUB (not activated for v1)
// ---------------------------------------------------------------------------
export class GoogleAdapter implements LLMProviderAdapter {
  readonly provider: LLMProvider = "google";

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    throw new LLMGatewayError({
      code: "unavailable",
      provider: "google",
      retryable: false,
      message:
        "Google provider is not activated for v1. " +
        "Activation requires per-provider compliance review.",
    });
  }
}

// ---------------------------------------------------------------------------
// Mistral adapter — STUB (not activated for v1)
// ---------------------------------------------------------------------------
export class MistralAdapter implements LLMProviderAdapter {
  readonly provider: LLMProvider = "mistral";

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    throw new LLMGatewayError({
      code: "unavailable",
      provider: "mistral",
      retryable: false,
      message:
        "Mistral provider is not activated for v1. " +
        "Activation requires per-provider compliance review.",
    });
  }
}

// ---------------------------------------------------------------------------
// Gateway — provider registry and routing
// ---------------------------------------------------------------------------

// Non-Anthropic stubs (not region-aware; not activated for v1)
const NON_ANTHROPIC_ADAPTERS: Partial<Record<LLMProvider, LLMProviderAdapter>> = {
  openai: new OpenAIAdapter(),
  google: new GoogleAdapter(),
  mistral: new MistralAdapter(),
};

/**
 * The LLM Gateway singleton.
 * All capabilities call gateway.generate() — never the adapter directly.
 *
 * For Anthropic (v1 default, FD-3): instantiates a region-aware AnthropicAdapter
 * per request using request.tenant_region ('eu' | 'us').
 */
export const llmGateway = {
  /**
   * Route a generation request to the appropriate provider adapter.
   * Defaults to Anthropic (FD-3) if request.provider is not specified.
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const providerName: LLMProvider = request.provider ?? "anthropic";

    if (providerName === "anthropic") {
      // Region-aware adapter instantiated per request
      const region = request.tenant_region ?? "us";
      const adapter = new AnthropicAdapter(region);
      return adapter.generate(request);
    }

    const adapter = NON_ANTHROPIC_ADAPTERS[providerName];
    if (!adapter) {
      throw new LLMGatewayError({
        code: "unavailable",
        provider: providerName,
        retryable: false,
        message: `Unknown LLM provider: ${providerName}`,
      });
    }

    return adapter.generate(request);
  },
};
