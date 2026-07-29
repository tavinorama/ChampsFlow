/**
 * probe-cache.ts — 24h Redis cache for AGGREGATED probe results (B8).
 *
 * Key:   geoprobe:{query_hash}|{engine}|{methodology_version}
 * Value: the AGGREGATED multi-run probe result (rate, n, sources, snippet).
 * TTL:   24 hours.
 *
 * CRITICAL RULE — cache sits ABOVE the sampling protocol:
 *   A whole multi-run probe (all its runs, already aggregated into a mention
 *   rate) is cached as ONE unit. Individual generations inside a sampling
 *   round are NEVER cached — reusing a single generation across runs would
 *   fabricate agreement between "runs" and falsify the Wilson interval.
 *   A cache hit is returned with from_cache=true and is treated by the
 *   sampler as a frozen unit (never escalated, never re-run).
 *
 * The methodology_version in the key auto-invalidates entries when the
 * sampling protocol changes (aggregates from different protocols are not
 * comparable). GEO_PROBE_CACHE=0 disables the cache (default ON).
 *
 * Fail-open: every Redis error is swallowed (miss / no-op). A cache outage
 * must never fail or slow an audit beyond the live path.
 *
 * Privacy: values hold synthetic buyer-prompt aggregates (rate, runs, bare
 * source URLs, ≤2000-char answer snippet) — no PII, no tenant data. Keys are
 * content-addressed (query hash), so identical public questions share entries.
 *
 * The store is injected (worker passes its ioredis client) so this module
 * stays dependency-free and unit-testable with a Map-backed fake.
 */

import type { ProbeResponse, LLMProvider } from "./providers/types";

/** Minimal Redis surface required (ioredis-compatible). */
export interface ProbeCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
}

/** Default TTL: 24 hours. */
export const PROBE_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Max snippet length persisted in the cache value (bounds Redis memory). */
const MAX_SNIPPET_CHARS = 2000;

/** GEO_PROBE_CACHE default ON; "0" disables. */
export function probeCacheEnabled(): boolean {
  return process.env["GEO_PROBE_CACHE"] !== "0";
}

export function probeCacheKey(
  queryHash: string,
  engine: string,
  methodologyVersion: string
): string {
  return `geoprobe:${queryHash}|${engine}|${methodologyVersion}`;
}

/** Serialized cache value (versioned envelope for forward compatibility). */
interface CachedProbeV1 {
  v: 1;
  provider: LLMProvider;
  queryHash: string;
  queryText?: string;
  runs: number;
  mentionRate: number;
  mentioned: boolean;
  position: number | null;
  sources: string[];
  snippet: string;
}

/**
 * getCachedProbe — cache lookup. Returns the aggregated ProbeResponse with
 * fromCache=true, or null on miss / corrupt entry / Redis error (fail-open).
 */
export async function getCachedProbe(
  store: ProbeCacheStore,
  queryHash: string,
  engine: string,
  methodologyVersion: string
): Promise<ProbeResponse | null> {
  try {
    const raw = await store.get(probeCacheKey(queryHash, engine, methodologyVersion));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProbeV1>;
    // Validate the invariants the sampler depends on — a corrupt entry must
    // read as a miss, never as fabricated data.
    if (
      parsed.v !== 1 ||
      parsed.provider !== engine ||
      parsed.queryHash !== queryHash ||
      typeof parsed.runs !== "number" ||
      !Number.isFinite(parsed.runs) ||
      parsed.runs < 1 ||
      typeof parsed.mentionRate !== "number" ||
      parsed.mentionRate < 0 ||
      parsed.mentionRate > 1
    ) {
      return null;
    }
    return {
      provider: parsed.provider,
      queryHash: parsed.queryHash,
      queryText: parsed.queryText,
      runs: Math.floor(parsed.runs),
      mentionRate: parsed.mentionRate,
      mentioned: typeof parsed.mentioned === "boolean" ? parsed.mentioned : parsed.mentionRate >= 0.5,
      position: typeof parsed.position === "number" ? parsed.position : null,
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s): s is string => typeof s === "string") : [],
      rawText: typeof parsed.snippet === "string" ? parsed.snippet : "",
      fromCache: true,
    };
  } catch {
    return null; // fail-open: Redis/JSON errors are cache misses
  }
}

/**
 * setCachedProbe — store a COMPLETED aggregated probe (after the sampling
 * protocol finished for its pair, escalations included). Refuses to cache:
 *  - results that themselves came from the cache (no re-caching / TTL renewal)
 *  - results without a queryHash or with zero completed runs
 * Errors are swallowed (fail-open).
 */
export async function setCachedProbe(
  store: ProbeCacheStore,
  resp: ProbeResponse,
  methodologyVersion: string,
  ttlSeconds: number = PROBE_CACHE_TTL_SECONDS
): Promise<void> {
  try {
    if (resp.fromCache) return;
    if (!resp.queryHash) return;
    const runs = resp.runs ?? 1;
    if (!Number.isFinite(runs) || runs < 1) return;
    const value: CachedProbeV1 = {
      v: 1,
      provider: resp.provider,
      queryHash: resp.queryHash,
      queryText: resp.queryText,
      runs: Math.floor(runs),
      mentionRate:
        typeof resp.mentionRate === "number" ? resp.mentionRate : resp.mentioned ? 1 : 0,
      mentioned: resp.mentioned,
      position: resp.position ?? null,
      sources: (resp.sources ?? []).slice(0, 10),
      snippet: (resp.rawText ?? "").slice(0, MAX_SNIPPET_CHARS),
    };
    await store.set(
      probeCacheKey(resp.queryHash, resp.provider, methodologyVersion),
      JSON.stringify(value),
      "EX",
      ttlSeconds
    );
  } catch {
    // fail-open: cache write failures must never affect the audit
  }
}
