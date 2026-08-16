/**
 * sampling.ts — sequential statistical sampling for GEO probes (B1).
 *
 * Approved protocol (product restructuring, 2026-07):
 *  - LEAN BASE: 2 runs per formulation (was a flat 3 everywhere). With 2
 *    formulations per intent that gives n = 4 runs per intent×engine.
 *  - SEQUENTIAL ESCALATION: runs are added ONLY where the signal is AMBIGUOUS —
 *    an intent×engine whose citation rate falls in [0.25, 0.75] with n < 6 gets
 *    +1 run per live formulation per round (max 2 rounds) until n >= 6 or the
 *    ambiguity band is left.
 *  - GLOBAL GENERATION CEILING: GEO_MAX_GENS (default 220) bounds total
 *    generations per audit. When the ceiling would be crossed, escalation
 *    LOGS AND STOPS (fail-safe) — the base protocol always completes.
 *  - HONESTY: every aggregate carries its Wilson 95% interval (wilson.ts);
 *    the width is never hidden downstream.
 *
 * Cache interaction (B8): cached probe results enter as `seedResponses`. A
 * cached probe is a FROZEN multi-run unit — it counts toward n in the
 * ambiguity check but is NEVER re-run or escalated (escalation only adds runs
 * to formulations probed live in this audit). Individual generations inside a
 * sampling round are never cached — only whole aggregated probes are (see
 * probe-cache.ts) — otherwise the confidence interval would be a lie.
 *
 * Pure orchestration over runProbes(); the runner is injectable for tests.
 * No DB writes, no Redis — the worker owns persistence and caching.
 */

import type { ProbeResponse, UserRegion, LLMProvider } from "./providers/types";
import type { ProbeQuery } from "./providers/types";
import { mergeProbeUsage } from "./providers/types";
import { runProbes, type RunProbesResult } from "./providers/gateway";
import { permittedProviders } from "./providers/routing";
import {
  aggregateIntentEngine,
  type IntentEngineStat,
  type FormulationTally,
} from "./wilson";

/**
 * Methodology version written to geo_audit / citation_check and baked into the
 * probe-cache key. Bump when the sampling protocol changes in a way that makes
 * results non-comparable (and stale cache entries invalid).
 *  - "1.0": flat repeat (GEO_PROBE_REPEAT, default 3) per prompt×engine.
 *  - "2.0": intent-classified portfolio, 2-run base, sequential escalation,
 *           Wilson 95% intervals per intent×engine (B1).
 *  - "2.1": B3 two-pass citation extraction. A citation now REQUIRES a mention
 *           that survives a blind verifier AND is a direct recommendation or a
 *           cited source. Neutral mentions, negative mentions ("I would not
 *           recommend X"), homonyms and hallucinated mentions no longer count.
 *           Rates from 2.0 and 2.1 are NOT comparable (2.1 is strictly stricter),
 *           so the bump also invalidates every 2.0 probe-cache entry.
 *           GEO_TWO_PASS_EXTRACTION=0 rolls the behaviour back to 2.0 semantics.
 */
export const GEO_METHODOLOGY_VERSION = "2.1";

/** A probe query carrying its intent classification. */
export interface SamplingQuery extends ProbeQuery {
  intentId?: string;
  formulationIx?: number;
}

export interface SequentialSamplingOptions {
  region: UserRegion;
  requestedProviders: LLMProvider[];
  /** Runs per formulation in the base round. Default 2 (approved protocol). */
  baseRuns?: number;
  /** Global generation ceiling for this audit. Default 220 (GEO_MAX_GENS). */
  maxGenerations?: number;
  /** Ambiguity band (inclusive). Defaults [0.25, 0.75]. */
  ambiguousLow?: number;
  ambiguousHigh?: number;
  /** Escalate until the intent×engine reaches this n. Default 6. */
  targetN?: number;
  /** Max escalation rounds (each adds 1 run per live formulation). Default 2. */
  maxEscalationRounds?: number;
  /** Disable escalation entirely (mock/deterministic mode). Default true. */
  escalate?: boolean;
  /**
   * Pre-existing aggregated probe results (B8 cache hits). Counted in the
   * intent aggregates and returned in `responses`, but never re-run.
   */
  seedResponses?: ProbeResponse[];
  /** Injectable probe runner (tests). Defaults to the real gateway runProbes. */
  runner?: (queries: ProbeQuery[], opts: {
    region: UserRegion;
    requestedProviders: LLMProvider[];
    repeat?: number;
  }) => Promise<RunProbesResult>;
}

export interface SamplingEscalation {
  intentId: string;
  provider: LLMProvider;
  extraRuns: number;
}

export interface SequentialSamplingResult {
  /** Merged responses — one per (query × engine), seeds included. */
  responses: ProbeResponse[];
  blockedProviders: LLMProvider[];
  failedProviders: Array<{ provider: LLMProvider; error: string }>;
  /** Estimated generations consumed by THIS audit (excludes cache seeds). */
  generationsUsed: number;
  /** True when the GEO_MAX_GENS ceiling stopped further escalation. */
  capReached: boolean;
  escalations: SamplingEscalation[];
  /** Per intent×engine aggregates with Wilson 95% intervals. */
  intentStats: IntentEngineStat[];
  baseRuns: number;
  maxGenerations: number;
}

/** Integer mention count reconstructed from an aggregated response. */
export function responseSuccesses(r: ProbeResponse): number {
  const runs = r.runs ?? 1;
  const rate = typeof r.mentionRate === "number" ? r.mentionRate : r.mentioned ? 1 : 0;
  return Math.round(rate * runs);
}

/**
 * mergeProbeResponses — fold an additional round's aggregate into an existing
 * one for the same (query × engine). Mention counts and runs are summed and
 * the rate recomputed; sources are unioned; the freshest rawText wins.
 * Position is approximated as the mention-weighted average of the two
 * aggregates' positions (per-run positions are not retained by the gateway).
 */
export function mergeProbeResponses(a: ProbeResponse, b: ProbeResponse): ProbeResponse {
  const runsA = a.runs ?? 1;
  const runsB = b.runs ?? 1;
  const runs = runsA + runsB;
  const mentions = responseSuccesses(a) + responseSuccesses(b);
  const mentionRate = runs > 0 ? mentions / runs : 0;
  const mentioned = mentionRate >= 0.5;

  const sources = [...new Set([...(a.sources ?? []), ...(b.sources ?? [])])];

  let position: number | null = null;
  if (mentioned) {
    const pa = a.position;
    const pb = b.position;
    const wa = responseSuccesses(a);
    const wb = responseSuccesses(b);
    if (pa != null && pb != null && wa + wb > 0) {
      position = Math.round((pa * wa + pb * wb) / (wa + wb));
    } else {
      position = pb ?? pa ?? null;
    }
  }

  const usage = mergeProbeUsage(a.usage, b.usage);
  return {
    ...a,
    rawText: b.rawText || a.rawText,
    runs,
    mentionRate,
    mentioned,
    position,
    sources,
    ...(usage ? { usage } : {}),
  };
}

function pairKey(queryHash: string | undefined, provider: string): string {
  return `${queryHash ?? ""}|${provider}`;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * runProbesSequential — the B1 sequential sampling protocol.
 *
 * 1. Base round: every (pending query × permitted engine) runs `baseRuns`
 *    times (cache seeds skip the live run entirely).
 * 2. Aggregate per intent×engine (runs summed across formulations).
 * 3. While an intent×engine is AMBIGUOUS (rate in [0.25, 0.75] AND n < 6):
 *    add 1 run per live formulation of that pair, respecting GEO_MAX_GENS.
 * 4. Return merged responses + intent aggregates with Wilson 95% intervals.
 */
export async function runProbesSequential(
  queries: SamplingQuery[],
  opts: SequentialSamplingOptions
): Promise<SequentialSamplingResult> {
  const runner = opts.runner ?? runProbes;
  const baseRuns = Math.max(1, Math.min(5, Math.floor(opts.baseRuns ?? 2)));
  const maxGenerations = Math.max(1, Math.floor(opts.maxGenerations ?? envInt("GEO_MAX_GENS", 220)));
  const ambiguousLow = opts.ambiguousLow ?? 0.25;
  const ambiguousHigh = opts.ambiguousHigh ?? 0.75;
  const targetN = opts.targetN ?? 6;
  const maxRounds = opts.maxEscalationRounds ?? 2;
  const escalate = opts.escalate ?? true;

  // Routing gate applied up front so cache seeds can't smuggle in a provider
  // the region forbids, and so blocked reporting doesn't depend on runner calls.
  const allowed = permittedProviders(opts.region, opts.requestedProviders);
  const blockedProviders = opts.requestedProviders.filter((p) => !allowed.includes(p));

  // Classification lookup for responses (gateway echoes queryHash).
  const metaByHash = new Map<string, { intentId?: string; formulationIx?: number }>();
  for (const q of queries) {
    metaByHash.set(q.queryHash, { intentId: q.intentId, formulationIx: q.formulationIx });
  }

  // Seed (cached) pairs are frozen units: excluded from live runs + escalation.
  const merged = new Map<string, ProbeResponse>();
  const seededPairs = new Set<string>();
  for (const seed of opts.seedResponses ?? []) {
    if (!allowed.includes(seed.provider)) continue; // routing gate wins over cache
    const key = pairKey(seed.queryHash, seed.provider);
    merged.set(key, seed);
    seededPairs.add(key);
  }

  let generationsUsed = 0;
  let capReached = false;
  const failedProviders: Array<{ provider: LLMProvider; error: string }> = [];
  const escalations: SamplingEscalation[] = [];

  // countGens=false when the caller already reserved the round's budget
  // up front (escalation rounds) — avoids double counting.
  const absorb = (result: RunProbesResult, countGens: boolean): void => {
    for (const resp of result.responses) {
      if (countGens) generationsUsed += resp.runs ?? 1;
      const key = pairKey(resp.queryHash, resp.provider);
      const existing = merged.get(key);
      merged.set(key, existing ? mergeProbeResponses(existing, resp) : resp);
    }
    for (const f of result.failedProviders) failedProviders.push(f);
  };

  // ---- Base round: per provider, only the pairs not served from cache. ----
  const baseCalls: Array<Promise<RunProbesResult>> = [];
  for (const provider of allowed) {
    const pending = queries.filter((q) => !seededPairs.has(pairKey(q.queryHash, provider)));
    if (pending.length === 0) continue;
    baseCalls.push(
      runner(pending, { region: opts.region, requestedProviders: [provider], repeat: baseRuns })
    );
  }
  for (const result of await Promise.all(baseCalls)) absorb(result, true);

  // ---- Aggregation helper (recomputed after every round). ----
  const computeStats = (): IntentEngineStat[] => {
    const tallies: FormulationTally[] = [];
    for (const resp of merged.values()) {
      const meta = resp.queryHash ? metaByHash.get(resp.queryHash) : undefined;
      tallies.push({
        intentId: meta?.intentId ?? null,
        provider: resp.provider,
        successes: responseSuccesses(resp),
        runs: resp.runs ?? 1,
      });
    }
    return aggregateIntentEngine(tallies);
  };

  // ---- Sequential escalation: ambiguous intent×engine pairs only. ----
  if (escalate) {
    for (let round = 0; round < maxRounds; round++) {
      const stats = computeStats();
      const ambiguous = stats.filter(
        (s) =>
          s.n < targetN &&
          s.citationRate >= ambiguousLow &&
          s.citationRate <= ambiguousHigh
      );
      if (ambiguous.length === 0) break;

      const roundCalls: Array<Promise<RunProbesResult>> = [];
      let escalatedAny = false;
      for (const stat of ambiguous) {
        const provider = stat.provider as LLMProvider;
        if (!allowed.includes(provider)) continue;
        // Only formulations probed LIVE this audit may gain runs — cached
        // pairs are frozen units (see module header).
        const liveFormulations = queries.filter(
          (q) =>
            q.intentId === stat.intentId &&
            !seededPairs.has(pairKey(q.queryHash, provider))
        );
        if (liveFormulations.length === 0) continue;

        if (generationsUsed + liveFormulations.length > maxGenerations) {
          // Fail-safe: log and STOP escalating. Base data is already complete.
          console.warn(
            `[sampling] GEO_MAX_GENS ceiling reached (used=${generationsUsed}, ` +
              `cap=${maxGenerations}) — stopping escalation for remaining ambiguous pairs`
          );
          capReached = true;
          break;
        }

        escalatedAny = true;
        escalations.push({
          intentId: stat.intentId,
          provider,
          extraRuns: liveFormulations.length,
        });
        // Reserve the budget BEFORE the async call so the escalations queued
        // in this round can't collectively overshoot the ceiling. Conservative:
        // a failed extra run still counts against the ceiling (it likely
        // consumed an API call), so absorb() below does NOT re-count.
        generationsUsed += liveFormulations.length;
        roundCalls.push(
          runner(liveFormulations, {
            region: opts.region,
            requestedProviders: [provider],
            repeat: 1,
          })
        );
      }

      for (const result of await Promise.all(roundCalls)) absorb(result, false);
      if (capReached || !escalatedAny) break;
    }
  }

  return {
    responses: [...merged.values()],
    blockedProviders,
    failedProviders,
    generationsUsed,
    capReached,
    escalations,
    intentStats: computeStats(),
    baseRuns,
    maxGenerations,
  };
}
