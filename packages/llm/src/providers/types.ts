/**
 * providers/types.ts — GEO Audit Engine provider type definitions
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1, §12 Provider Routing Gate (GEO-A3)
 *  - docs/03-architecture.md §11 Sub-Processors — Anthropic, OpenAI, Gemini, Perplexity, DataForSEO
 *  - docs/03-architecture.md §8 Cross-Region and Data Residency Strategy
 *  - docs/03-architecture.md §4.2 Entity Definitions — citation_check, geo_score
 *
 * GEO-A2: Competitor brand names MUST NOT appear in probe queries or strategy inputs.
 *         The scoring/strategy prompt builders enforce this via buildStrategyPromptInput()
 *         in scoring.ts — only anonymised numeric benchmarks are permitted.
 *
 * GEO-A3: Perplexity is BLOCKED for EU users by default until DPA/SCC confirmed.
 *         OpenAI and Gemini are BLOCKED for EU until EU-region/ZDR path confirmed.
 *         Routing gate is the single enforcement point (routing.ts).
 */

// ---------------------------------------------------------------------------
// Provider identifiers — extended for GEO platform
// ---------------------------------------------------------------------------

/**
 * LLMProvider — all providers supported in the GEO Audit Engine.
 *
 * 'serp' = DataForSEO (SERP/AIO signal — not a GPAI provider; same adapter interface).
 *
 * Sub-processor DPA status (architecture §11):
 *  - anthropic: CONFIRMED (carry-over Gate 3→4)
 *  - openai:    PENDING Gate 3→4 (EU BLOCKED until Azure EU + ZDR enterprise confirmed)
 *  - gemini:    PENDING Gate 3→4 (EU BLOCKED until Vertex AI EU region confirmed)
 *  - perplexity: UNCONFIRMED — EU BLOCKED (GEO-A3; feature flag lifts when legal confirms)
 *  - serp:      PENDING Gate 3→4 (DataForSEO; EU-hosted endpoint; not a GPAI system)
 */
export type LLMProvider = "anthropic" | "openai" | "gemini" | "perplexity" | "serp";

// ---------------------------------------------------------------------------
// User region — drives routing gate decisions
// ---------------------------------------------------------------------------

/**
 * UserRegion — set at signup from IP geo-detection + self-declaration.
 * Ambiguous / VPN cases default to 'EU' (architecture §8 fallback strategy).
 * Resolved from validated JWT claim; never from request body.
 */
export type UserRegion = "EU" | "US";

// ---------------------------------------------------------------------------
// Probe query / response shapes
// ---------------------------------------------------------------------------

/**
 * ProbeQuery — a single brand visibility probe sent to one or more providers.
 *
 * Data minimisation (hard rule 7): only brand name and query text sent.
 * No personal data, no raw competitor names (GEO-A2).
 */
export interface ProbeQuery {
  /** SHA-256 of query_text — stored in citation_check.query_hash (architecture §4.2) */
  queryHash: string;
  /** The probe question text, e.g., "What is the best CRM for SMBs?" */
  queryText: string;
  /** The brand name we are checking citation for */
  brandName: string;
}

/**
 * ProbeResponse — result of a single provider probe execution.
 *
 * Raw text is processed in worker memory only.
 * Only aggregate metrics (cited, position, sources) are written to citation_check.
 * Named-individual snippets from LLM responses MUST NOT be stored (architecture §4.3).
 */
export interface ProbeResponse {
  /** Which provider produced this response */
  provider: LLMProvider;
  /** The buyer prompt that produced this response (synthetic category question,
   *  NOT personal data). Attached by the gateway so callers can build a
   *  per-prompt evidence breakdown. */
  queryText?: string;
  /** SHA-256 of the prompt — stable id for the prompt across providers. */
  queryHash?: string;
  /** How many times this (prompt × provider) was run. 1 unless repeat>1. */
  runs?: number;
  /** Fraction of runs where the brand was mentioned (0–1). With runs=1 this is
   *  0 or 1; with repeat>1 it captures non-determinism (e.g. 0.6 = 3 of 5). */
  mentionRate?: number;
  /** Raw response text — processed in memory; discarded after parsing; NEVER written to DB */
  rawText: string;
  /** Whether the brand was mentioned in the response */
  mentioned: boolean;
  /**
   * 1-based position of the brand mention in the response (1 = first mention).
   * null if the brand was not mentioned.
   */
  position: number | null;
  /**
   * Source URLs cited by the provider (if available — e.g., Perplexity, SERP).
   * Empty array when the provider does not return inline citations.
   */
  sources: string[];
}

// ---------------------------------------------------------------------------
// Provider adapter interface
// ---------------------------------------------------------------------------

/**
 * ProviderAdapter — every GEO provider adapter must implement this interface.
 *
 * Critical mock mode: if the provider's key env var is absent, adapters return
 * a DETERMINISTIC mock response seeded by a hash of the query. This is the
 * primary test path. Live HTTP is a clearly-marked TODO stub.
 *
 * Error handling: classify errors as retryable vs permanent.
 * Wrap all calls in try/catch; never let uncaught errors escape (hard rule 10).
 */
export interface ProviderAdapter {
  /** Stable provider identifier */
  readonly id: LLMProvider;

  /**
   * Execute a single probe query against this provider.
   *
   * Retryable errors: network errors, 429, 5xx.
   * Permanent errors: 4xx (except 429), invalid API key.
   *
   * @param query  The probe query (brand name + question text)
   * @param opts   Optional per-call options (region, requestId for idempotency)
   * @returns      ProbeResponse with citation metrics
   * @throws       ProviderError (always — never raw fetch errors)
   */
  probe(
    query: ProbeQuery,
    opts?: ProbeCallOptions
  ): Promise<ProbeResponse>;
}

/**
 * ProbeCallOptions — per-call options for probe().
 */
export interface ProbeCallOptions {
  /** User region — used for routing decisions within adapters where applicable */
  region?: UserRegion;
  /** UUID for idempotency on providers that support idempotency keys */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ProviderErrorKind =
  | "retryable"   // network, 429, 5xx — eligible for exponential backoff
  | "permanent";  // 4xx (except 429), auth failure, quota hard-cap

export class ProviderError extends Error {
  constructor(
    public readonly provider: LLMProvider,
    public readonly kind: ProviderErrorKind,
    public readonly statusCode: number | undefined,
    message: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
