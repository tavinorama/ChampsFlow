/**
 * providers/gateway.ts — GEO probe query fan-out gateway
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 inference path
 *  - docs/03-architecture.md §12 Provider Routing Gate (GEO-A3)
 *  - docs/03-architecture.md §13 R1 — circuit breaker, exponential backoff
 *
 * Responsibilities:
 *  1. Apply routing gate (permittedProviders) to filter requested providers by region
 *  2. Fan out probe queries to all permitted providers in parallel
 *  3. Collect results; log blocked providers (observability hook)
 *  4. Return all successful ProbeResponses; surface permanent failures separately
 *
 * This module is PURE ORCHESTRATION — no DB writes, no business logic.
 * All DB writes (citation_check, ai_generation_log) happen in the BullMQ worker.
 *
 * Circuit breaker state is intentionally kept simple here (per-request).
 * A production circuit breaker with Redis-backed state lives in the worker layer.
 *
 * Hard rules enforced:
 *  3. Exponential backoff on retryable errors (implemented via withRetry)
 *  5. Circuit breaker: if a provider returns 5xx for > 3 consecutive calls in 60s,
 *     open circuit (tracked in circuitBreakerState; worker layer should use Redis)
 *  6. Never log full request/response bodies
 *  10. All integration calls wrapped in try/catch; errors classified
 */

import type { ProbeQuery, ProbeResponse, UserRegion, LLMProvider } from "./types";
import { ProviderError } from "./types";
import { permittedProviders } from "./routing";
import { sanitizeUserPrompt } from "../prompt-sanitizer";
import { AnthropicProbeAdapter } from "./anthropic";
import { OpenAIProbeAdapter } from "./openai";
import { GeminiProbeAdapter } from "./gemini";
import { PerplexityProbeAdapter } from "./perplexity";
import { SerpProbeAdapter } from "./serp";

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const ADAPTERS = {
  anthropic: new AnthropicProbeAdapter(),
  openai: new OpenAIProbeAdapter(),
  gemini: new GeminiProbeAdapter(),
  perplexity: new PerplexityProbeAdapter(),
  serp: new SerpProbeAdapter(),
} as const satisfies Record<LLMProvider, { probe: InstanceType<typeof AnthropicProbeAdapter>["probe"] }>;

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff (hard rule 3)
// Initial: 1s, max: 32s, max retries: 5
// ---------------------------------------------------------------------------

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 32_000;
const MAX_RETRIES = 5;

function jitter(ms: number): number {
  // ±25% jitter to prevent thundering-herd
  return ms * (0.75 + Math.random() * 0.5);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  provider: LLMProvider
): Promise<T> {
  let attempt = 0;
  let delay = INITIAL_DELAY_MS;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ProviderError && err.kind === "retryable" && attempt < MAX_RETRIES) {
        attempt++;
        const waitMs = jitter(Math.min(delay, MAX_DELAY_MS));
        delay *= 2;
        // Log without PII (hard rule 6)
        console.warn(
          `[gateway] provider=${provider} retryable error; attempt=${attempt}/${MAX_RETRIES}; ` +
          `wait=${Math.round(waitMs)}ms; code=${err.statusCode ?? "none"}`
        );
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker state (in-memory; production should use Redis-backed state)
// Hard rule 5: open circuit if > 3 consecutive 5xx in 60s per provider
// ---------------------------------------------------------------------------

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number | null;
}

const circuitState: Record<string, CircuitState> = {};
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_DURATION_MS = 60_000;

function isCircuitOpen(provider: LLMProvider): boolean {
  const state = circuitState[provider];
  if (!state || state.openedAt === null) return false;
  if (Date.now() - state.openedAt > CIRCUIT_OPEN_DURATION_MS) {
    // Half-open: allow one attempt through
    state.openedAt = null;
    state.consecutiveFailures = 0;
    return false;
  }
  return state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD;
}

function recordSuccess(provider: LLMProvider): void {
  const state = circuitState[provider] ?? { consecutiveFailures: 0, openedAt: null };
  state.consecutiveFailures = 0;
  state.openedAt = null;
  circuitState[provider] = state;
}

function recordFailure(provider: LLMProvider): void {
  const state = circuitState[provider] ?? { consecutiveFailures: 0, openedAt: null };
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && state.openedAt === null) {
    state.openedAt = Date.now();
    console.error(
      `[gateway] circuit OPEN for provider=${provider}; ` +
      `consecutiveFailures=${state.consecutiveFailures}`
    );
  }
  circuitState[provider] = state;
}

// ---------------------------------------------------------------------------
// Gateway options
// ---------------------------------------------------------------------------

export interface RunProbesOptions {
  /** Tenant region — drives routing gate (architecture §8) */
  region: UserRegion;
  /** Providers the caller wants to use — routing gate filters to permitted subset */
  requestedProviders: LLMProvider[];
  /**
   * How many times to run each (prompt × provider). >1 captures the
   * non-determinism of AI answers as a mention RATE with confidence — the
   * basis of credible "accuracy". Default 1. Capped at 5 to bound cost.
   * Mock adapters are deterministic, so repeat only adds value in live mode.
   */
  repeat?: number;
}

export interface RunProbesResult {
  /** Successful probe responses */
  responses: ProbeResponse[];
  /**
   * Providers that were blocked by the routing gate (compliance — GEO-A3).
   * Written to geo_audit.providers_used jsonb for EU report explanation.
   */
  blockedProviders: LLMProvider[];
  /**
   * Providers that were attempted but failed (error recorded for observability).
   * These are dead-lettered at the worker level for the error table.
   */
  failedProviders: Array<{ provider: LLMProvider; error: string }>;
}

// ---------------------------------------------------------------------------
// Core function: runProbes
// ---------------------------------------------------------------------------

/**
 * runProbes — fan out probe queries to all permitted providers.
 *
 * Applies routing gate, fans out in parallel, returns results.
 * Pure orchestration — no DB writes.
 *
 * @param queries           One or more probe queries (typically 10+ per audit per AC-C1-1)
 * @param opts              Region + requested providers
 * @returns                 Responses, blocked providers, failed providers
 */
export async function runProbes(
  queries: ProbeQuery[],
  opts: RunProbesOptions
): Promise<RunProbesResult> {
  const { region, requestedProviders } = opts;

  // Step 1: Apply routing gate
  const allowed = permittedProviders(region, requestedProviders);
  const blocked = requestedProviders.filter((p) => !allowed.includes(p));

  if (blocked.length > 0) {
    // Log blocked providers without PII (hard rule 6)
    // Observability: provider_routing_gate_blocked_total counter (architecture §10)
    console.info(
      `[gateway] routing gate blocked providers=${blocked.join(",")} for region=${region}`
    );
  }

  // Step 1.5: GEO-SEC-2 — sanitize every query at the GATEWAY (the single
  // chokepoint), so no provider — present or future — can be reached with an
  // unsanitized, user-influenced prompt. queryText derives from user-supplied
  // brand name/category, so injection via those fields lands here. Rejected
  // queries are dropped (never sent); sanitized text replaces the original.
  const safeQueries: ProbeQuery[] = [];
  let rejectedQueries = 0;
  for (const q of queries) {
    const s = sanitizeUserPrompt(q.queryText);
    if (s.rejected) {
      rejectedQueries++;
      continue; // pattern already logged by the sanitizer (no prompt text)
    }
    safeQueries.push(s.sanitized === q.queryText ? q : { ...q, queryText: s.sanitized });
  }
  if (rejectedQueries > 0) {
    console.warn(`[gateway] GEO-SEC-2 sanitizer rejected ${rejectedQueries} probe quer${rejectedQueries === 1 ? "y" : "ies"}`);
  }
  queries = safeQueries;

  // Repetition count — captures non-determinism as a mention rate. Bounded [1,5].
  const repeat = Math.max(1, Math.min(5, Math.floor(opts.repeat ?? 1)));

  // Step 2: Fan out — for each (query × provider), run `repeat` times and
  // aggregate into ONE response carrying runs + mentionRate. This is where
  // credible accuracy lives: rate-with-confidence, not a single coin flip.
  const taskResults = await Promise.allSettled(
    queries.flatMap((query) =>
      allowed.map(async (provider) => {
        if (isCircuitOpen(provider)) {
          throw new ProviderError(provider, "retryable", 503, `circuit open for provider=${provider}`);
        }
        const adapter = ADAPTERS[provider];

        let mentions = 0;
        let positionSum = 0;
        let positionN = 0;
        const sourceSet = new Set<string>();
        let lastText = "";
        let lastResult: ProbeResponse | null = null;
        let okRuns = 0;

        for (let r = 0; r < repeat; r++) {
          try {
            const result = await withRetry(
              () => adapter.probe(query, { region, requestId: query.queryHash }),
              provider
            );
            recordSuccess(provider);
            okRuns += 1;
            lastResult = result;
            lastText = result.rawText;
            if (result.mentioned) {
              mentions += 1;
              if (result.position && result.position > 0) {
                positionSum += result.position;
                positionN += 1;
              }
            }
            for (const s of result.sources ?? []) sourceSet.add(s);
          } catch (err) {
            recordFailure(provider);
            // If the FIRST run fails, propagate (whole pair failed). If a later
            // run fails, keep the partial aggregate from successful runs.
            if (okRuns === 0) throw err;
          }
        }

        const mentionRate = okRuns > 0 ? mentions / okRuns : 0;
        // Aggregated mention = majority of runs (rate >= 0.5).
        const mentioned = mentionRate >= 0.5;
        const avgPosition = positionN > 0 ? Math.round(positionSum / positionN) : null;

        const aggregated: ProbeResponse = {
          provider,
          queryText: query.queryText,
          queryHash: query.queryHash,
          runs: okRuns,
          mentionRate,
          rawText: lastText,
          mentioned,
          position: mentioned ? avgPosition : null,
          sources: [...sourceSet],
        };
        // Preserve any extra provider fields from the last result (defensive).
        return { ...lastResult, ...aggregated };
      })
    )
  );

  // Step 3: Collect results
  const responses: ProbeResponse[] = [];
  const failedProviders: Array<{ provider: LLMProvider; error: string }> = [];

  for (const result of taskResults) {
    if (result.status === "fulfilled") {
      responses.push(result.value);
    } else {
      const err = result.reason;
      const provider: LLMProvider = err instanceof ProviderError ? err.provider : "anthropic";
      // Log without PII (hard rule 6)
      console.error(
        `[gateway] probe failed provider=${provider} ` +
        `kind=${err instanceof ProviderError ? err.kind : "unknown"} ` +
        `msg=${err instanceof Error ? err.message.slice(0, 100) : "unknown"}`
      );
      failedProviders.push({
        provider,
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return { responses, blockedProviders: blocked, failedProviders };
}
