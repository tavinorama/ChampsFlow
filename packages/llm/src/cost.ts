/**
 * cost.ts — list-price cost of a measured LLM call (#152).
 *
 * api_spend used to be an ESTIMATE: one number per operation, computed as
 * calls × a per-engine rate from a 2026-08-05 experiment. The providers
 * return real token usage on every response and the adapters dropped it.
 * This module is the missing arithmetic: tokens × published list price.
 *
 * Rules:
 *  - Only models the repo actually calls, and only prices we are confident
 *    about (public list price at time of writing, USD per 1M tokens). A model
 *    that is not here returns null and the CALLER falls back to the rate —
 *    an unknown price is a "don't know", never a guess.
 *  - Search-native / search-enabled surfaces charge per REQUEST on top of
 *    tokens (Perplexity sonar per-request fee, Anthropic web_search per
 *    search). Where that surcharge is known it is included; where it is not
 *    (OpenAI web_search tool, Gemini grounding beyond the free tier) the
 *    measured number is TOKENS ONLY and the docs say so. Measured can still
 *    undercount those two engines by the search fee.
 *  - Pure module: no I/O, no env. Prices are data, not config — if they
 *    change, change them here with the date.
 *
 * Model ids are matched by exact id first, then by longest known prefix, so
 * a dated snapshot ("claude-haiku-4-5-20251001") prices as its alias.
 */

export interface ModelPrice {
  /** USD per 1M input tokens */
  inputUsdPerM: number;
  /** USD per 1M output tokens */
  outputUsdPerM: number;
  /** USD per request, on top of tokens (search-native surfaces). */
  perRequestUsd?: number;
  /** ISO date the price was last checked against the provider's list. */
  asOf: string;
}

/**
 * Prices verified 2026-08-16.
 *  - anthropic: platform.claude.com pricing (Haiku 4.5 $1/$5, Sonnet 4.5/4.6
 *    $3/$15, Opus 4.x/5 $5/$25). Web search: $10 per 1,000 searches
 *    (WEB_SEARCH_USD_PER_REQUEST below, keyed by provider not model).
 *  - openai: gpt-4o-mini $0.15/$0.60, gpt-4o $2.50/$10.
 *  - gemini: gemini-2.5-flash-lite $0.10/$0.40, gemini-2.5-flash $0.30/$2.50.
 *  - perplexity: sonar $1/$1 per M + $5 per 1,000 requests (low search
 *    context — the default when no search_context_size is sent).
 */
export const PROVIDER_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  // Anthropic
  "claude-haiku-4-5": { inputUsdPerM: 1, outputUsdPerM: 5, asOf: "2026-08-16" },
  "claude-sonnet-4-5": { inputUsdPerM: 3, outputUsdPerM: 15, asOf: "2026-08-16" },
  "claude-sonnet-4-6": { inputUsdPerM: 3, outputUsdPerM: 15, asOf: "2026-08-16" },
  "claude-opus-4-6": { inputUsdPerM: 5, outputUsdPerM: 25, asOf: "2026-08-16" },
  "claude-opus-4-7": { inputUsdPerM: 5, outputUsdPerM: 25, asOf: "2026-08-16" },
  "claude-opus-4-8": { inputUsdPerM: 5, outputUsdPerM: 25, asOf: "2026-08-16" },
  "claude-opus-5": { inputUsdPerM: 5, outputUsdPerM: 25, asOf: "2026-08-16" },
  // OpenAI
  "gpt-4o-mini": { inputUsdPerM: 0.15, outputUsdPerM: 0.6, asOf: "2026-08-16" },
  "gpt-4o": { inputUsdPerM: 2.5, outputUsdPerM: 10, asOf: "2026-08-16" },
  // Google
  "gemini-2.5-flash-lite": { inputUsdPerM: 0.1, outputUsdPerM: 0.4, asOf: "2026-08-16" },
  "gemini-2.5-flash": { inputUsdPerM: 0.3, outputUsdPerM: 2.5, asOf: "2026-08-16" },
  // Perplexity (search-native: per-request fee is part of the list price)
  sonar: { inputUsdPerM: 1, outputUsdPerM: 1, perRequestUsd: 0.005, asOf: "2026-08-16" },
});

/**
 * Per-search surcharge for search-ENABLED surfaces, keyed by provider. Only
 * providers whose per-search list price we are sure of. OpenAI web_search
 * and Gemini grounding are deliberately absent (their fee is not in the
 * measured number; see module header).
 */
export const WEB_SEARCH_USD_PER_REQUEST: Readonly<Record<string, number>> = Object.freeze({
  anthropic: 0.01, // $10 per 1,000 searches
});

export interface MeasuredUsage {
  model: string | null | undefined;
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
  /** Provider id, only needed to price web-search requests. */
  provider?: string | null;
  /** Number of provider-side web searches performed (Anthropic reports it). */
  searchRequests?: number | null;
  /** Number of API requests this usage aggregates (default 1). Used for per-request fees. */
  requests?: number | null;
}

/** Longest-prefix lookup so dated snapshots price as their alias. */
export function priceForModel(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  const id = model.trim().toLowerCase();
  if (PROVIDER_PRICES[id]) return PROVIDER_PRICES[id]!;
  let best: string | null = null;
  for (const key of Object.keys(PROVIDER_PRICES)) {
    if (id.startsWith(key + "-") || id.startsWith(key + "@")) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  return best ? PROVIDER_PRICES[best]! : null;
}

function nonNegInt(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * measuredCostCents — tokens × list price, in cents with 4 decimals.
 * Returns null when the model is unknown or the token counts are not usable
 * numbers (both must be present — a response with no usage block is not a
 * measurement). Zero tokens on a known model is a valid 0.
 */
export function measuredCostCents(u: MeasuredUsage): number | null {
  const price = priceForModel(u.model);
  if (!price) return null;
  const inTok = nonNegInt(u.inputTokens);
  const outTok = nonNegInt(u.outputTokens);
  if (inTok === null || outTok === null) return null;

  const requests = Math.max(1, nonNegInt(u.requests) ?? 1);
  let usd = (inTok * price.inputUsdPerM + outTok * price.outputUsdPerM) / 1_000_000;
  if (price.perRequestUsd) usd += price.perRequestUsd * requests;
  const searches = nonNegInt(u.searchRequests) ?? 0;
  const perSearch = u.provider ? WEB_SEARCH_USD_PER_REQUEST[u.provider] : undefined;
  if (searches > 0 && perSearch) usd += perSearch * searches;

  return Math.round(usd * 100 * 10_000) / 10_000;
}
