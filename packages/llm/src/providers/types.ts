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
  /**
   * True when the surface produced NO answer at all — as opposed to an answer
   * that simply did not name the brand. Today only the SERP adapter sets it,
   * for the case where Google showed no AI Overview block for the query.
   *
   * The distinction is not pedantry, and getting it wrong had a live cost. That
   * adapter returns a human-readable sentinel ("no AI Overview block returned in
   * this snapshot") rather than an empty string, and every downstream emptiness
   * check is `rawText.trim().length === 0`. So "Google chose not to show an AI
   * Overview" was scored identically to "the engine saw the question and did not
   * name the brand" — and the drift battery, which exists to catch engines that
   * stop naming brands they should name, read Google's editorial choice as our
   * engine degrading. It paused the engine over our own measurement error.
   *
   * For an AUDIT the old behaviour is still right: no AI Overview means the
   * customer is genuinely not cited in one, and that is a true answer to give
   * them. It is only the control battery, asking "is this engine still behaving",
   * for which an absent surface says nothing either way.
   */
  absent?: boolean;
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
  /**
   * Raw response text from the provider. A capped excerpt (≤2000 chars) is
   * persisted as citation_check.raw_text_snippet to power the "see the actual
   * answer" UI in the audit breakdown. The full text is NOT stored.
   * Adapters must not include user-submitted PII in this field.
   */
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
  /**
   * B8: true when this AGGREGATED multi-run result was served from the 24h
   * probe cache instead of live provider calls. Cached results are frozen
   * units — the sampler never escalates them and the worker never re-caches
   * them or logs an ai_generation for them.
   */
  fromCache?: boolean;
  /**
   * #152 — measured provider usage for THIS response, straight from the
   * provider's usage block. Aggregated responses (gateway repeat, sampling
   * merge) SUM it across the calls they fold. Absent when the adapter is in
   * mock mode, when the provider returned no usage, or when the response was
   * served from the probe cache (cached = no live cost). The worker's spend
   * ledger prices it with packages/llm/src/cost.ts; when absent it falls back
   * to the per-call rate. Never used for scoring.
   */
  usage?: ProbeUsage;
}

/** Measured provider usage attached to a ProbeResponse (see above). */
export interface ProbeUsage {
  /** Provider model id as sent (e.g. "claude-haiku-4-5", "gpt-4o-mini", "sonar"). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Provider-side web searches, when the provider reports them (Anthropic). */
  searchRequests?: number;
  /** Number of API requests this usage aggregates. 1 for a single call. */
  requests: number;
}

/**
 * mergeProbeUsage — sum two usages (or pass through the one that exists).
 * Model: keep the first's; a mixed-model aggregate is a bug upstream, not
 * something to average.
 */
export function mergeProbeUsage(
  a: ProbeUsage | undefined,
  b: ProbeUsage | undefined
): ProbeUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const searches = (a.searchRequests ?? 0) + (b.searchRequests ?? 0);
  return {
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    requests: a.requests + b.requests,
    ...(searches > 0 ? { searchRequests: searches } : {}),
  };
}

/**
 * usageFromCounts — build a single-call ProbeUsage from raw provider counts.
 * Returns undefined unless BOTH token counts are finite non-negative numbers:
 * a response without a usage block is not a measurement, and half a
 * measurement would price as if the missing half were free.
 */
export function usageFromCounts(
  model: string,
  inputTokens: unknown,
  outputTokens: unknown,
  searchRequests?: unknown
): ProbeUsage | undefined {
  const ok = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (!ok(inputTokens) || !ok(outputTokens)) return undefined;
  const u: ProbeUsage = {
    model,
    inputTokens: Math.floor(inputTokens),
    outputTokens: Math.floor(outputTokens),
    requests: 1,
  };
  if (ok(searchRequests) && searchRequests > 0) u.searchRequests = Math.floor(searchRequests);
  return u;
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

// ---------------------------------------------------------------------------
// Integrity guard — NEVER fabricate data in production
// ---------------------------------------------------------------------------

/**
 * mockAllowed — whether keyless deterministic mock probe answers are permitted.
 *
 * HARD INTEGRITY RULE: a real audit must reflect what AI engines actually say.
 * In production we NEVER synthesise a probe answer. If a provider's key is
 * absent in production, the adapter throws a permanent ProviderError so the
 * audit fails honestly (that provider is dropped, or the whole run errors)
 * instead of returning a fabricated "brand cited #1" answer that would inflate
 * the score with data no engine ever produced.
 *
 * Mock stays available ONLY for local/dev/test (NODE_ENV !== "production") and
 * for an explicit, deliberate opt-in (GEO_ALLOW_MOCK=true) used by seeded demos
 * — never on the customer-facing production stack.
 */
export function mockAllowed(): boolean {
  return (
    process.env["GEO_ALLOW_MOCK"] === "true" ||
    process.env["NODE_ENV"] !== "production"
  );
}

/**
 * assertLiveOrThrow — call from an adapter's keyless branch BEFORE returning a
 * mock. Throws a permanent ProviderError when mock is not allowed (production),
 * so fabricated answers can never reach a customer audit.
 */
export function assertLiveOrThrow(provider: LLMProvider): void {
  if (!mockAllowed()) {
    throw new ProviderError(
      provider,
      "permanent",
      undefined,
      `${provider}: API key absent in production — refusing to fabricate a probe answer`
    );
  }
}

// ---------------------------------------------------------------------------
// Web-search surfaces (B2) — probe what the consumer actually sees
// ---------------------------------------------------------------------------

/**
 * webSearchEnabled — B2 rollback flag for the web-search surfaces.
 *
 * Default ON: OpenAI/Anthropic/Gemini probes run with web search / grounding
 * enabled, so the audit measures the REAL consumer surface (ChatGPT with
 * browsing, Claude with web search, Gemini with Google Search grounding) —
 * not the models' parametric memory. Perplexity (sonar) and SERP/DataForSEO
 * are search-native and unaffected by this flag.
 *
 * Set GEO_WEB_SEARCH=0 to fall back to the pre-B2 behavior (no tools —
 * parametric memory only) if search breaks or costs spike. Founder decision:
 * all 5 search-enabled engines run everywhere, including the free test —
 * "we sell this and we have to deliver this".
 */
export function webSearchEnabled(): boolean {
  return process.env["GEO_WEB_SEARCH"] !== "0";
}

/**
 * providerSurface — human-readable description of the surface a probe actually
 * tested. Written into audit reports (breakdown.surfaces) so a reader can see
 * whether a score was measured against the search-enabled consumer surface or
 * the no-search fallback (GEO_WEB_SEARCH=0).
 */
export function providerSurface(provider: LLMProvider): string {
  const ws = webSearchEnabled();
  switch (provider) {
    case "openai":
      return ws
        ? "OpenAI Responses API + web_search tool (live web results)"
        : "OpenAI Chat Completions — no search (parametric memory only)";
    case "anthropic":
      return ws
        ? "Claude Messages API + web search tool (live web results)"
        : "Claude Messages API — no search (parametric memory only)";
    case "gemini":
      return ws
        ? "Gemini generateContent + Google Search grounding (live web results)"
        : "Gemini generateContent — no grounding (parametric memory only)";
    case "perplexity":
      return "Perplexity Sonar (search-native)";
    case "serp":
      return "Google AI Overview via DataForSEO SERP (search-native)";
  }
}
