/**
 * BullMQ audit-run job processor — C1 GEO Audit Engine (Ozvor)
 *
 * Job payload: { audit_id, tenant_id, brand_id, region }  — no PII.
 *
 * Flow:
 *   1. Set RLS tenant context; load the brand + the intent-classified
 *      buyer-prompt portfolio (B1: 5 intents × 2 formulations).
 *   2. Probe-cache read (B8: whole aggregated probes only, 24h TTL), then
 *      runProbesSequential() across permitted providers (routing gate: EU
 *      excludes Perplexity): 2-run base, escalate ONLY ambiguous intent×engine
 *      pairs, GEO_MAX_GENS ceiling. Wilson 95% CIs per intent×engine.
 *      Mock-mode adapters return deterministic results when API keys are absent.
 *   3. Parse each probe → citation_check rows (aggregate only; raw text discarded).
 *   4. Derive AI sub-score inputs from probe aggregates; brand/performance use
 *      neutral baselines until the site-crawl slice lands.
 *   5. computeGeoScore() → write geo_score (time series) + geo_audit scores.
 *   6. ai_generation_log append per probe (GEO-A6).
 *   7. Mark geo_audit 'complete' (+ 30-day report expiry).
 *
 * Hard rules: parameterized SQL only; ai_generation_log / citation_check INSERT-only;
 * no raw probe text or PII persisted; no secrets in logs.
 */

import type { Job } from "bullmq";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import postgres from "postgres";
import { createHash } from "crypto";
import {
  runProbesSequential,
  responseSuccesses,
  GEO_METHODOLOGY_VERSION,
  buildIntentPortfolio,
  type PortfolioPrompt,
  wilson95,
  aggregateIntentEngine,
  computeGeoScore,
  parseCitation,
  extractMentionsBatch,
  twoPassExtractionEnabled,
  countsAsCitation,
  isBrandMention,
  type ExtractionResult,
  type MentionKind,
  crawlSite,
  tallyCompetitors,
  detectCompetitors,
  type CompetitorProbe,
  measureOffsiteSignal,
  analyzeContentGeo,
  analyzeSentiment,
  analyzeRedditPresence,
  analyzeEntityGraph,
  pickEntityCompleteness,
  type SentimentProbeInput,
  type SamplingQuery,
  type GeoLLMProvider,
  type ProbeResponse,
  providerSurface,
  permittedProviders,
  probeCacheEnabled,
  getCachedProbe,
  setCachedProbe,
} from "../../../../packages/llm/src/index";
import { logger } from "../../../../packages/shared/src/logger";
import { pausedDriftEngines } from "./drift-control";
import { runWithTenant } from "../../../api/src/db/tenant-context";
import { PLAN_LIMITS, type PlanTier } from "../../../api/src/integrations/stripe";

export interface AuditJobData {
  /** Present for on-demand audits (row pre-created by the API).
   *  Absent for scheduled-audit (weekly flywheel) jobs — the worker creates
   *  the geo_audit row itself in that case. */
  audit_id?: string;
  tenant_id: string;
  brand_id: string;
  region: string; // 'EU' | 'US'
}

function randomUuid(): string {
  // Node 20 has global crypto.randomUUID.
  return (globalThis.crypto as Crypto).randomUUID();
}

// Default buyer-prompt portfolio — B1: the canonical, intent-classified list
// now lives in packages/llm/src/prompt-portfolio.ts (same texts, same order;
// shared with the API's Prompt Library route). 5 intents × 2 formulations.

// ---------------------------------------------------------------------------
// B8 — probe-cache Redis client (lazy singleton, same pattern as the daily
// monitor queue below). The cache is fail-open everywhere: any Redis error is
// a cache miss / no-op, never an audit failure.
// ---------------------------------------------------------------------------
let _probeCacheRedis: IORedis | null = null;

function getProbeCacheRedis(): IORedis {
  if (_probeCacheRedis) return _probeCacheRedis;
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  _probeCacheRedis = new IORedis(redisUrl, { maxRetriesPerRequest: 2 });
  _probeCacheRedis.on("error", (err: Error) => {
    logger.warn("probe_cache_redis_error", { message: err.message?.slice(0, 160) });
  });
  return _probeCacheRedis;
}

/** Round to 4 decimals for breakdown JSON readability. */
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

const REQUESTED_PROVIDERS: GeoLLMProvider[] = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serp",
];

/**
 * Smallest share of the requested engines that has to actually answer before we
 * are willing to publish a score. Half: on the default 5-engine panel that
 * means 3 must answer, and a run that gets 2 or fewer is reported as failed
 * rather than scored.
 *
 * The number is a judgement, not a derivation — the principle behind it is not.
 * Engines disagree with each other far more than a brand changes week to week,
 * so a score built on a different subset than the one before it is a different
 * measurement wearing the same label. See the integrity guard below.
 */
const MIN_ENGINE_COVERAGE = 0.5;

export interface EngineCoverage {
  requested: number;
  answered: number;
  /** Asked, gave nothing back — key, quota, outage. */
  missing: string[];
  /** Withheld by us: the engine's control battery says it is drifting. */
  paused: string[];
  /** True only when every engine in the comparison panel answered. */
  comparable: boolean;
  /** Share of the comparison panel that answered, for the publish gate. */
  ratio: number;
}

/**
 * Coverage of one audit against the panel it is compared to.
 *
 * Pure and exported so the rule can be tested directly. The bug it prevents is
 * subtle and was live: the caller shrinks its routing list when an engine is
 * drift-paused, and computing coverage from that shrunken list makes a
 * one-engine run look like a complete one (1 of 1, nothing missing). The panel
 * passed here must therefore be the ORIGINAL request, never the routing set.
 *
 * `paused` and `missing` are kept apart because they are different claims: one
 * is an outage on the engine's side, the other is our own decision to withhold
 * it. Folding them together would hide ours behind theirs.
 */
export function computeEngineCoverage(
  comparisonPanel: readonly string[],
  answered: ReadonlySet<string>,
  paused: readonly string[]
): EngineCoverage {
  const absent = comparisonPanel.filter((p) => !answered.has(p));
  const answeredInPanel = comparisonPanel.filter((p) => answered.has(p)).length;
  return {
    requested: comparisonPanel.length,
    answered: answeredInPanel,
    missing: absent.filter((p) => !paused.includes(p)),
    paused: comparisonPanel.filter((p) => paused.includes(p)),
    comparable: absent.length === 0,
    ratio: comparisonPanel.length ? answeredInPanel / comparisonPanel.length : 0,
  };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * GEO-D2 (DPIA condition): citation evidence is persisted as bare URLs only.
 * Query strings + fragments are stripped (they can carry emails/tokens/PII),
 * length is capped, and at most 10 sources are kept per probe. Response text
 * itself is never stored (architecture §4.3).
 */
/**
 * Cap LLM-generated text for storage. The raw answer text is synthetic brand-
 * visibility output — not PII — but we cap it at 2000 chars to control storage
 * growth. Never log this value; never expose it in error messages.
 */
function capText(s: string | undefined): string | null {
  if (!s) return null;
  return s.slice(0, 2000);
}

function sanitizeSources(sources: string[] | undefined): string[] {
  return (sources ?? []).slice(0, 10).map((u) => {
    try {
      const url = new URL(u);
      return `${url.origin}${url.pathname}`.slice(0, 200);
    } catch {
      return u.replace(/[?#].*$/, "").slice(0, 200);
    }
  });
}

/**
 * Map the LLM layer's provider id to the DB's canonical provider name.
 * The packages/llm layer uses 'gemini'/'serp'; the DB constraint uses
 * 'google'/'dataforseo'. This boundary mapping keeps both consistent.
 */
function dbProvider(p: string): string {
  if (p === "gemini") return "google";
  if (p === "serp") return "dataforseo";
  return p;
}

/**
 * Process one audit job. `sql` is a postgres-js client created by the worker.
 */
export async function processAuditJob(
  job: Job<AuditJobData>,
  sql: postgres.Sql
): Promise<{ audit_id: string; overall: number }> {
  const { tenant_id, brand_id, region } = job.data;
  // UserRegion is uppercase ("EU" | "US") — must match the routing gate's
  // `region === "US"` comparison exactly. Default unknown values to EU (safest:
  // EU excludes Perplexity).
  const userRegion: "EU" | "US" = region === "US" ? "US" : "EU";

  // Run the entire job inside this tenant's RLS scope. Every query through `sql`
  // (the RLS-aware worker client — see apps/worker/src/db/rls-client.ts) now runs
  // as app_user with app.current_tenant_id set, so isolation is enforced by
  // Row-Level Security rather than relying on the WHERE clauses below. This
  // replaces the previous bare `set_config(..., is_local=true)`, which was INERT:
  // outside a transaction it reset on autocommit and never reached the next query
  // (so the worker had been running fully privileged with RLS bypassed).
  return runWithTenant(tenant_id, async () => {
    // For scheduled (weekly flywheel) jobs there is no pre-created audit row —
    // create one now. For on-demand jobs the API already created it.
    let audit_id = job.data.audit_id;
    if (!audit_id) {
      audit_id = randomUuid();
      await sql`
        INSERT INTO geo_audit (id, tenant_id, brand_id, triggered_by, status, created_at)
        VALUES (${audit_id}, ${tenant_id}, ${brand_id}, 'cron', 'pending', NOW())
      `;
    }

    // Mark running.
    await sql`UPDATE geo_audit SET status = 'running' WHERE id = ${audit_id}`;

    // Load the brand (with model tracking settings and profile URLs if available).
    const brandRows = await sql<
      {
        name: string;
        category: string | null;
        domain: string | null;
        tracked_models: unknown;
        tracking_frequency: string | null;
        linkedin_url: string | null;
        reddit_url: string | null;
        wikipedia_url: string | null;
        g2_url: string | null;
        trustpilot_url: string | null;
        crunchbase_url: string | null;
        youtube_url: string | null;
      }[]
    >`SELECT name, category, domain, tracked_models, tracking_frequency,
             linkedin_url, reddit_url, wikipedia_url, g2_url, trustpilot_url, crunchbase_url, youtube_url
        FROM brands WHERE id = ${brand_id}`;
    const brand = brandRows[0];
    if (!brand) {
      await sql`UPDATE geo_audit SET status = 'failed' WHERE id = ${audit_id}`;
      throw new Error("brand_not_found");
    }

    // Build probe portfolio (B1: intent-classified — 5 intents × 2 formulations,
    // texts unchanged from the legacy portfolio; shared with the API's Prompt
    // Library route via packages/llm/src/prompt-portfolio.ts).
    const prompts: PortfolioPrompt[] = buildIntentPortfolio(brand.name, brand.category);

    // Append custom prompts from the audit_prompt table (Prompt Library capability).
    // CRITICAL: any error here MUST NOT propagate — the audit must always complete
    // even if the audit_prompt table is missing or the query fails for any reason.
    try {
      const customRows = await sql<{ text: string }[]>`
        SELECT text
          FROM audit_prompt
         WHERE brand_id = ${brand_id}
           AND is_custom = TRUE
         ORDER BY sort_order ASC
      `;
      if (customRows.length > 0) {
        // Normalise defaults for dedup comparison (lowercase trim).
        const defaultsNorm = new Set(prompts.map((p) => p.text.toLowerCase().trim()));
        let added = 0;
        for (const row of customRows) {
          if (added >= 10) break;
          const norm = row.text.toLowerCase().trim();
          if (!defaultsNorm.has(norm)) {
            added += 1;
            // B1: each custom prompt is its OWN single-formulation intent
            // (custom_1, custom_2, …). Grouping unrelated custom questions
            // under one shared intent would sum runs of different questions
            // and fabricate a tighter confidence interval than the data has.
            prompts.push({ text: row.text, intentId: `custom_${added}`, formulationIx: 0 });
          }
        }
      }
    } catch (err) {
      // Table not yet migrated (42P01) or any other DB error — log and continue
      // with defaults only. Never let this block the audit.
      logger.warn("custom_prompts_load_failed", {
        brand_id,
        message: (err as Error).message,
      });
    }

    // Enforce the plan's prompt depth (single source of truth: PLAN_LIMITS).
    // Free = a shallow snapshot (10 prompts); paid tiers get the full portfolio.
    // This is what makes the Free plan a taste, not a usable tier.
    let planTier: PlanTier = "free";
    try {
      const tRows = await sql<{ plan_tier: string | null }[]>`SELECT plan_tier FROM tenants WHERE id = ${tenant_id}`;
      const pt = tRows[0]?.plan_tier;
      if (pt === "growth" || pt === "agency") planTier = pt;
    } catch {
      // plan_tier unreadable → default to free (most conservative).
    }

    // Margin guard (cost-control): SCHEDULED (cron/monitor) audits only. Each full
    // audit costs ~$5 of platform API (see api_spend); without a ceiling a
    // high-brand-count Agency can run its plan negative. Once the tenant reaches
    // its plan's monthly_audit_cap of COMPLETED cron audits this calendar month,
    // skip this run and delete its (un-run) row. Manual audits the user triggers
    // are unaffected (auditId present + their own manual_audit_interval / backstop).
    // Month window uses date_trunc('month', NOW()) — the DB server tz, same
    // convention as the api_spend monthly budget (products.ts). This is a SOFT
    // ceiling by design: fail-open on a count error, and count-then-act is not
    // atomic, so it bounds cost rather than hard-locking it. A few hours of
    // month-boundary drift is immaterial for a spend guard.
    if (!job.data.audit_id) {
      const cap = PLAN_LIMITS[planTier]?.monthly_audit_cap;
      if (typeof cap === "number") {
        try {
          const capRows = await sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM geo_audit
             WHERE tenant_id = ${tenant_id}
               AND status = 'complete'
               AND triggered_by = 'cron'
               AND created_at >= date_trunc('month', NOW())
          `;
          const completed = capRows[0]?.n ?? 0;
          if (completed >= cap) {
            logger.warn("audit_monthly_cap_reached", { tenant_id, plan: planTier, cap, completed });
            await sql`DELETE FROM geo_audit WHERE id = ${audit_id}`;
            return { audit_id, overall: 0 };
          }
        } catch (err: unknown) {
          // Never let the guard block a legitimate audit on a count error.
          logger.warn("audit_monthly_cap_check_failed", {
            tenant_id,
            message: (err as Error).message?.slice(0, 160),
          });
        }
      }
    }

    const promptCap = PLAN_LIMITS[planTier]?.prompts_per_audit ?? PLAN_LIMITS.free.prompts_per_audit;
    if (prompts.length > promptCap) prompts.length = promptCap;

    const queries: SamplingQuery[] = prompts.map((p) => ({
      queryHash: sha256(p.text),
      queryText: p.text,
      brandName: brand.name,
      intentId: p.intentId,
      formulationIx: p.formulationIx,
    }));
    // Intent classification lookup for evidence rows + breakdown (by hash so
    // sanitizer rewrites inside the gateway can't break the join).
    const intentByHash = new Map(
      queries.map((q) => [
        q.queryHash,
        { intentId: q.intentId ?? null, formulationIx: q.formulationIx ?? null },
      ])
    );

    // Filter probes to brand's tracked models (graceful fallback if column missing or empty).
    // Any error here MUST NOT propagate — fall back to all supported providers.
    const ALL_SUPPORTED: GeoLLMProvider[] = ["openai", "anthropic", "perplexity", "gemini", "serp"];
    let requestedProviders: GeoLLMProvider[] = REQUESTED_PROVIDERS; // default = all 5
    try {
      const rawModels = brand.tracked_models;
      const trackedArr = Array.isArray(rawModels) ? (rawModels as string[]) : [];
      const filtered = trackedArr.filter((m): m is GeoLLMProvider =>
        ALL_SUPPORTED.includes(m as GeoLLMProvider)
      );
      if (filtered.length > 0) {
        requestedProviders = filtered;
      }
      // else: empty/null → fall back to all supported (already set above)
    } catch {
      // Column missing or parse error → fall back to all (current behavior)
    }

    // The panel this run is COMPARED against — frozen here, before the drift
    // pause below can shrink what we actually probe.
    //
    // Hermes caught the bug this prevents: coverage used to be computed from
    // `requestedProviders` AFTER drift pause mutated it, so pausing 4 of 5
    // engines left requested=1, answered=1, missing=[], comparable=true — a
    // one-engine score published as comparable, which is precisely the failure
    // this guard exists to stop. Routing may shrink; the yardstick may not.
    const comparisonPanel: GeoLLMProvider[] = [...requestedProviders];
    let pausedProviders: GeoLLMProvider[] = [];

    // B4 — anti-drift pause. An engine whose latest control-battery verdict is
    // 'failing' (it stopped naming dominant brands, or it described entities
    // that do not exist) is dropped from this audit: a hallucinating engine
    // produces fiction, not citations, and folding that into a customer's score
    // would hand them a number we already know is wrong.
    //
    // Two guards, both deliberate:
    //   - fail-open: pausedDriftEngines() never throws and returns [] when the
    //     history is missing/stale/disabled (GEO_DRIFT_PAUSE=0 is the override).
    //   - never pause everything: if every requested engine is failing, the
    //     problem is almost certainly on OUR side. Keep them all and shout —
    //     a silently empty audit is worse than a loud suspicious one.
    try {
      const paused = await pausedDriftEngines(sql);
      if (paused.length > 0) {
        const kept = requestedProviders.filter((p) => !paused.includes(p));
        if (kept.length === 0) {
          logger.error("audit_drift_pause_all_engines", {
            audit_id,
            paused: paused.join(","),
            note: "every requested engine is drift-failing — running anyway; investigate our side first",
          });
        } else if (kept.length < requestedProviders.length) {
          logger.warn("audit_drift_engines_paused", {
            audit_id,
            paused: requestedProviders.filter((p) => paused.includes(p)).join(","),
            remaining: kept.length,
          });
          pausedProviders = requestedProviders.filter((p) => paused.includes(p));
          requestedProviders = kept;
        }
      }
    } catch (err) {
      // Belt and braces — the pause check must never fail an audit.
      logger.warn("audit_drift_pause_check_error", {
        message: (err as Error).message?.slice(0, 160),
      });
    }

    // In LIVE mode, repeat each probe to capture AI non-determinism as a mention
    // RATE with confidence. B1 lean protocol: base = 2 runs per formulation
    // (GEO_PROBE_REPEAT still overrides, clamped 1–5), then SEQUENTIAL
    // escalation adds runs only where the intent×engine signal is ambiguous.
    // Mock adapters are deterministic, so 1 run and no escalation there.
    const liveMode =
      !!process.env["ANTHROPIC_API_KEY"] ||
      !!process.env["OPENAI_API_KEY"] ||
      !!process.env["PERPLEXITY_API_KEY"] ||
      !!process.env["GEMINI_API_KEY"];
    const envBaseRuns = Number(process.env["GEO_PROBE_REPEAT"] ?? 2);
    const baseRuns = liveMode
      ? Math.max(1, Math.min(5, Number.isFinite(envBaseRuns) ? Math.floor(envBaseRuns) : 2))
      : 1;

    // B8 — probe cache read. A cache entry is a WHOLE aggregated multi-run
    // probe (never individual generations — that would falsify the Wilson
    // interval). Only providers permitted for this region are looked up, so a
    // routing-gate-blocked provider can never be served from cache. Disabled
    // in mock mode (deterministic fabricated answers must not persist) and by
    // GEO_PROBE_CACHE=0. Fail-open: any Redis error is a miss.
    const cacheEnabled = probeCacheEnabled() && liveMode;
    const cachedResponses: ProbeResponse[] = [];
    let cacheLookups = 0;
    if (cacheEnabled) {
      try {
        const redis = getProbeCacheRedis();
        const allowedForCache = permittedProviders(userRegion, requestedProviders);
        const lookups: Array<Promise<void>> = [];
        for (const q of queries) {
          for (const p of allowedForCache) {
            cacheLookups += 1;
            lookups.push(
              getCachedProbe(redis, q.queryHash, p, GEO_METHODOLOGY_VERSION).then((hit) => {
                if (hit) cachedResponses.push(hit);
              })
            );
          }
        }
        await Promise.all(lookups);
      } catch (err) {
        logger.warn("probe_cache_read_failed", {
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // B1 — sequential sampling across permitted providers (routing gate applied
    // inside). Cached pairs are frozen seed units; escalation (max +2 runs per
    // ambiguous intent×engine) respects the GEO_MAX_GENS ceiling (default 220).
    const result = await runProbesSequential(queries, {
      region: userRegion,
      requestedProviders,
      baseRuns,
      escalate: liveMode,
      seedResponses: cachedResponses,
    });

    // B8 — cache write: persist each LIVE aggregated probe (escalations already
    // folded in) as one unit for 24h. Cached hits are never re-cached (no TTL
    // renewal — data older than 24h must be re-measured). Fail-open.
    if (cacheEnabled) {
      try {
        const redis = getProbeCacheRedis();
        await Promise.all(
          result.responses
            .filter((r) => !r.fromCache)
            .map((r) => setCachedProbe(redis, r, GEO_METHODOLOGY_VERSION))
        );
      } catch (err) {
        logger.warn("probe_cache_write_failed", {
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // INTEGRITY: a score is only meaningful against the engine set it was
    // measured on. The citation rate's denominator is "probes that ran", so an
    // engine that never answers silently leaves the average — and the score
    // moves for a reason that has nothing to do with the brand.
    //
    // This is not hypothetical. On 2026-07-29 an Ozvor audit ran with only
    // `dataforseo` reachable. That engine had returned 0/11 citations on every
    // previous run too, but the four engines that DO cite Ozvor were absent, so
    // the visibility score fell 48 → 10 and read as "you went invisible". The
    // brand had not changed at all; the engine mix had.
    //
    // The old guard only fired when EVERY provider failed, so 4-of-5 sailed
    // through and published. Coverage is now what decides:
    //   - nothing answered            → failed, as before
    //   - under half of what we asked → failed. Too little of the panel to
    //     compare against a full-panel baseline, and a wrong number is worse
    //     than no number.
    //   - partial but over the bar    → runs, and records what was missing so
    //     the UI can say the run is not comparable instead of implying it is.
    const answeredProviders = new Set(result.responses.map((r) => r.provider));

    // Measured against comparisonPanel, never against the post-pause routing
    // set — see the note where the panel is frozen. Two ways an engine can be
    // absent, kept apart because they mean different things to the client:
    //   silent — we asked and got nothing (key, quota, outage)
    //   paused — we withheld it because its control battery says it is drifting
    // Both make the run non-comparable; only one is our doing.
    const cov = computeEngineCoverage(comparisonPanel, answeredProviders, pausedProviders);
    if (result.responses.length === 0 || cov.ratio < MIN_ENGINE_COVERAGE) {
      logger.warn("audit_insufficient_engine_coverage", {
        audit_id,
        requested: cov.requested,
        answered: cov.answered,
        silent: cov.missing.join(","),
        paused: cov.paused.join(","),
        failed: result.failedProviders.length,
        blocked: result.blockedProviders.length,
        note: "refusing to publish a score measured on too few engines",
      });
      await sql`
        UPDATE geo_audit
           SET status = 'failed',
               error_message = ${
                 `Only ${cov.answered} of ${cov.requested} AI engines answered ` +
                 `(no answer: ${cov.missing.join(", ") || "none"}` +
                 `${cov.paused.length ? `; held back for drift: ${cov.paused.join(", ")}` : ""}). ` +
                 `We did not score this run — a partial panel is not comparable to your history.`
               }
         WHERE id = ${audit_id}`;
      throw new Error("insufficient_engine_coverage");
    }

    if (!cov.comparable) {
      // Above the bar, so the run continues — but it is NOT comparable to a
      // full-panel run, and the client has to be told that, not left to read a
      // dip that we caused.
      logger.warn("audit_partial_engine_coverage", {
        audit_id,
        answered: cov.answered,
        requested: cov.requested,
        silent: cov.missing.join(","),
        paused: cov.paused.join(","),
      });
    }

    const providersUsed = Array.from(new Set(result.responses.map((r) => dbProvider(r.provider))));

    // Site crawl — measures Brand + Performance from the real website (if a domain
    // is set). Reachable=false falls back to neutral baselines. Runs in parallel
    // conceptually with the probe loop below but awaited here for the score.
    const crawl = await crawlSite(brand.domain);

    // Build profile URL map from brand-supplied profile URLs (capability #79).
    // Only non-null values are included; null means "not provided" (no override).
    const profileUrls: Partial<Record<string, string>> = {};
    if (brand.linkedin_url)   profileUrls["linkedin"]   = brand.linkedin_url;
    if (brand.reddit_url)     profileUrls["reddit"]     = brand.reddit_url;
    if (brand.wikipedia_url)  profileUrls["wikipedia"]  = brand.wikipedia_url;
    if (brand.g2_url)         profileUrls["g2"]         = brand.g2_url;
    if (brand.trustpilot_url) profileUrls["trustpilot"] = brand.trustpilot_url;
    if (brand.crunchbase_url) profileUrls["crunchbase"] = brand.crunchbase_url;
    if (brand.youtube_url)    profileUrls["youtube"]    = brand.youtube_url;

    // Off-site signal — presence on Reddit/Wikipedia/G2/etc. (where AI cites most).
    // Pass profile URLs so provided ones skip SERP lookup and are verified directly.
    const offsite = await measureOffsiteSignal(brand.name, Object.keys(profileUrls).length > 0 ? profileUrls : undefined);

    // Reddit deep-dive (C5) — threads/subreddits/sentiment on the #1 cited source.
    // GEO-A2: own brand only. Live via SERP; mock fallback when keyless.
    const reddit = await analyzeRedditPresence(brand.name);

    // Entity graph (C7) — Wikidata/Wikipedia consistency. Key-free public APIs in
    // live mode; deterministic mock when running the keyless demo stack.
    const entity = await analyzeEntityGraph(brand.name, brand.domain, { mockMode: !liveMode });

    // Content GEO — multi-page citation-worthiness (Princeton traits).
    const content = await analyzeContentGeo(brand.domain);

    // Load competitors for the benchmark ("who AI recommends instead of you").
    const competitorRows = await sql<
      { name: string }[]
    >`SELECT name FROM competitor WHERE brand_id = ${brand_id}`;
    const competitorNames = competitorRows.map((r) => r.name);
    // Collect per-probe competitor inputs (engine + answer text + whether the
    // client was absent). tallyCompetitors() folds these into the benchmark with
    // a per-engine split after the loop — one pure, unit-tested function so the
    // "who AI recommends instead of you, and on which engine" data is verifiable.
    const competitorProbes: CompetitorProbe[] = [];

    // -----------------------------------------------------------------------
    // B3 — TWO-PASS CITATION EXTRACTION (extractor + blind verifier).
    //
    // Single-pass matching counted a citation whenever the brand token appeared
    // in the answer, so "I would not recommend Acme", a homonym company, or the
    // brand buried in a URL all scored the same as a real recommendation. The
    // two-pass protocol re-reads each retained answer: pass 1 extracts candidate
    // mentions, pass 2 (blind — it never sees pass 1's verdict) confirms or
    // rejects each one. Only VERIFIED/unverifiable mentions whose kind is
    // direct_recommendation or cited_source count as a citation.
    //
    // CONSERVATIVE BY DESIGN: extraction can only REMOVE a citation, never add
    // one. The measured mention RATE (which spans every run of the probe) is
    // zeroed when the retained answer text carries no surviving citing mention;
    // a rate that survives is left exactly as measured. Extraction sees only the
    // retained answer of a multi-run probe, so promoting a rate from it would
    // invent agreement between runs that was never observed.
    //
    // Rollback: GEO_TWO_PASS_EXTRACTION=0 → responses pass through untouched.
    // -----------------------------------------------------------------------
    const extractionEnabled = twoPassExtractionEnabled();
    let extractionMode: string = extractionEnabled ? "two_pass" : "disabled";
    let extractionVerified = 0;
    let extractionRejected = 0;
    let extractionCalls = 0;
    let extractionAdjusted = 0;
    const extractionByKind: Record<string, number> = {};
    const extractionRejections: Array<{ text: string; reason: string }> = [];
    // Index-aligned with result.responses.
    let extractions: ExtractionResult[] = [];

    if (extractionEnabled) {
      try {
        extractions = await extractMentionsBatch(
          result.responses.map((r) => ({
            rawText: r.rawText ?? "",
            brandName: brand.name,
            competitors: competitorNames,
          })),
          { concurrency: 4 }
        );
        const modes = new Set(extractions.map((e) => e.extraction_mode));
        extractionMode =
          modes.size === 1 ? [...modes][0] ?? "two_pass" : `mixed(${[...modes].sort().join("+")})`;
        for (const e of extractions) {
          extractionVerified += e.verified_count;
          extractionRejected += e.rejected_count;
          extractionCalls += e.llm_calls;
          for (const m of e.mentions) {
            const k: MentionKind = m.kind_confirmed;
            extractionByKind[k] = (extractionByKind[k] ?? 0) + 1;
            if (m.verdict === "REJECTED" && extractionRejections.length < 3) {
              extractionRejections.push({
                // Bounded excerpt of the model's own answer — no PII, no tenant data.
                text: m.text_exact.slice(0, 120),
                reason: m.reason.slice(0, 160),
              });
            }
          }
        }
      } catch (err) {
        // extractMentions() is already non-throwing; this is the last-resort net
        // so a citation-extraction problem can NEVER fail a paid audit.
        extractionMode = "fallback_single_pass";
        extractions = [];
        logger.warn("citation_extraction_failed", {
          audit_id,
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // Apply the verified result to the probe aggregates (removal only).
    const responses: ProbeResponse[] = result.responses.map((r, ix) => {
      const e = extractions[ix];
      if (!e || e.extraction_mode !== "two_pass") return r;
      const rate = typeof r.mentionRate === "number" ? r.mentionRate : r.mentioned ? 1 : 0;
      if (rate <= 0) return r;
      const survives =
        e.brand_cited ||
        // Defensive: brand_cited already encodes this, kept explicit for readers.
        e.mentions.some((m) => isBrandMention(m, brand.name) && countsAsCitation(m));
      if (survives) return r;
      extractionAdjusted += 1;
      return { ...r, mentionRate: 0, mentioned: false, position: null };
    });

    // Wilson aggregates must be recomputed from the SAME numbers the score uses,
    // otherwise the per-intent panel would contradict the headline rate.
    const intentStats =
      extractionAdjusted > 0
        ? aggregateIntentEngine(
            responses.map((r) => ({
              intentId: (r.queryHash ? intentByHash.get(r.queryHash)?.intentId : null) ?? null,
              provider: r.provider,
              successes: responseSuccesses(r),
              runs: r.runs ?? 1,
            }))
          )
        : result.intentStats;

    // Persist citation_check rows + ai_generation_log (append-only). Aggregate only.
    // citedCount uses the mention RATE (fractional in live repeat mode) so the AI
    // score reflects confidence, not a single coin flip.
    let citedCount = 0;     // sum of mention rates (fractional) — the "expected" cite count
    let citedAnyCount = 0;  // count of probes cited in >=1 run (for probes_cited display)
    let positionScoreSum = 0;
    let positionScoreN = 0;
    // Sentiment inputs — answer text + mention flag per probe (analysed after loop).
    const sentimentProbes: SentimentProbeInput[] = [];
    // B1 — per intent×engine share-of-voice accumulator (client mention mass vs
    // competitor mentions, mirroring the audit-level shareOfVoice formula).
    const sovAcc = new Map<
      string, // `${intentId}|${dbEngine}`
      { client: number; comp: number; byComp: Map<string, number> }
    >();
    // B8 — cache accounting for the breakdown.
    let cacheHits = 0;
    // Graceful degradation: if the B1 migration hasn't been applied yet
    // (42703 undefined_column), fall back to the legacy citation_check insert
    // so an old-schema deploy never fails audits.
    let citationSchemaHasB1 = true;

    for (const resp of responses) {
      const rate = typeof resp.mentionRate === "number" ? resp.mentionRate : (resp.mentioned ? 1 : 0);
      const mentioned = resp.mentioned; // majority-of-runs (rate >= 0.5)
      const position = resp.position;
      citedCount += rate;
      if (rate > 0) citedAnyCount += 1;
      if (mentioned && position && position > 0) {
        positionScoreSum += 1 / position;
        positionScoreN += 1;
      }
      if (resp.fromCache) cacheHits += 1;

      const intentMeta = resp.queryHash ? intentByHash.get(resp.queryHash) : undefined;

      // Collect for sentiment classification (how the brand is portrayed).
      sentimentProbes.push({ text: resp.rawText ?? "", mentioned });

      // Competitor benchmark: which competitors appeared in THIS probe answer,
      // and was the client absent here (displacement)?
      if (competitorNames.length > 0) {
        competitorProbes.push({
          provider: dbProvider(resp.provider),
          text: resp.rawText ?? "",
          clientAbsent: !mentioned,
        });
      }

      // B1 — per intent×engine share-of-voice inputs. Client side uses the
      // mention RATE (expected cited answers); competitor side counts mentions
      // detected in this answer's text (same units as the audit-level formula).
      if (intentMeta?.intentId) {
        const key = `${intentMeta.intentId}|${dbProvider(resp.provider)}`;
        const acc = sovAcc.get(key) ?? { client: 0, comp: 0, byComp: new Map<string, number>() };
        acc.client += rate;
        if (competitorNames.length > 0) {
          for (const cName of detectCompetitors(resp.rawText ?? "", competitorNames)) {
            acc.comp += 1;
            acc.byComp.set(cName, (acc.byComp.get(cName) ?? 0) + 1);
          }
        }
        sovAcc.set(key, acc);
      }

      // citation_check stores the buyer prompt + cited sources as audit evidence
      // (the prompt is a synthetic category question, not PII; purged after 90d).
      // B1 adds intent_id / formulation_ix / methodology_version (migration
      // 20260728000001); on an old schema we fall back to the legacy insert.
      let citationInserted = false;
      if (citationSchemaHasB1) {
        try {
          await sql`
            INSERT INTO citation_check
              (tenant_id, brand_id, audit_id, provider, query_hash, query_text, cited, citation_rank, sources,
               mention_rate, runs_count, raw_text_snippet, intent_id, formulation_ix, methodology_version, processed_at)
            VALUES
              (${tenant_id}, ${brand_id}, ${audit_id}, ${dbProvider(resp.provider)},
               ${resp.queryHash ?? sha256(brand.name + "|" + resp.provider)},
               ${resp.queryText ?? null},
               ${mentioned}, ${position ?? null}, ${sql.json(sanitizeSources(resp.sources))},
               ${resp.mentionRate ?? null}, ${resp.runs ?? null}, ${capText(resp.rawText)},
               ${intentMeta?.intentId ?? null}, ${intentMeta?.formulationIx ?? null},
               ${GEO_METHODOLOGY_VERSION}, NOW())
          `;
          citationInserted = true;
        } catch (err: unknown) {
          if ((err as { code?: string }).code === "42703") {
            citationSchemaHasB1 = false;
            logger.warn("citation_check_b1_columns_missing", {
              message: "intent/methodology columns absent — migration 20260728000001 pending; using legacy insert",
            });
          } else {
            throw err;
          }
        }
      }
      if (!citationInserted) {
        await sql`
          INSERT INTO citation_check
            (tenant_id, brand_id, audit_id, provider, query_hash, query_text, cited, citation_rank, sources,
             mention_rate, runs_count, raw_text_snippet, processed_at)
          VALUES
            (${tenant_id}, ${brand_id}, ${audit_id}, ${dbProvider(resp.provider)},
             ${resp.queryHash ?? sha256(brand.name + "|" + resp.provider)},
             ${resp.queryText ?? null},
             ${mentioned}, ${position ?? null}, ${sql.json(sanitizeSources(resp.sources))},
             ${resp.mentionRate ?? null}, ${resp.runs ?? null}, ${capText(resp.rawText)}, NOW())
        `;
      }

      // B8: a cached probe made NO generation calls — logging one would
      // fabricate an inference event (ai_generation_log is an audit trail of
      // real provider calls, GEO-A6). Skip it; the citation evidence row above
      // still records the (cached) measurement.
      if (!resp.fromCache) {
        await sql`
          INSERT INTO ai_generation_log
            (tenant_id, feature_id, input_hash, provider, model_version, output_hash, zdr_confirmed, latency_ms, timestamp)
          VALUES
            (${tenant_id}, 'GEO-1', ${sha256(resp.provider + "|" + brand.name)},
             ${dbProvider(resp.provider)}, ${"mock-or-live"}, ${sha256(resp.rawText ?? "")},
             ${userRegion === "EU"}, ${0}, NOW())
        `;
      }
    }

    // Persist the competitor benchmark + build a ranked list for the breakdown.
    // Fold the per-probe inputs into the ranked benchmark (aggregate + per-engine
    // split). Already sorted most-displacing first by the helper.
    const competitorBenchmark = tallyCompetitors(competitorProbes, competitorNames);
    for (const c of competitorBenchmark) {
      // The table stores only the aggregate (unchanged schema); the per-engine
      // providers[] lives in the breakdown JSON below.
      await sql`
        INSERT INTO competitor_citation
          (tenant_id, audit_id, competitor_name, mention_count, displacement_count, recorded_at)
        VALUES (${tenant_id}, ${audit_id}, ${c.name}, ${c.mentions}, ${c.displacement}, NOW())
      `;
    }

    // Derive AI sub-score inputs from probe aggregates.
    const totalProbes = responses.length || 1;
    const citationRate = citedCount / totalProbes;
    const avgPositionScore = positionScoreN > 0 ? positionScoreSum / positionScoreN : 0;

    // Real share-of-voice vs competitors — the worker already tallied competitor
    // mentions, so use them. Honest: if competitors out-mention you, your share
    // drops; if neither is cited it's 0; with no competitors configured, fall back
    // to your own citation rate (best signal available). This replaces the raw
    // citationRate that was being mislabelled as "share vs competitors".
    const totalCompetitorMentions = competitorBenchmark.reduce((s, c) => s + c.mentions, 0);
    const shareOfVoice =
      competitorNames.length === 0
        ? citationRate
        : citedCount + totalCompetitorMentions > 0
          ? citedCount / (citedCount + totalCompetitorMentions)
          : 0;

    const aioPresence = responses.some((r) => r.provider === "serp" && r.mentioned);

    // -----------------------------------------------------------------------
    // B1 — intent×engine aggregates with Wilson 95% intervals.
    // HONESTY RULE: the interval width ships with every rate ("cited in 12%
    // ± 9%") — a rate is never surfaced without its n and CI.
    // -----------------------------------------------------------------------
    const totalRunsAll = responses.reduce((s, r) => s + (r.runs ?? 1), 0);
    const totalSuccessesAll = responses.reduce((s, r) => s + responseSuccesses(r), 0);
    // Audit-level run-weighted citation rate + CI (basis of the scorecard "±").
    const citationCI = wilson95(totalSuccessesAll, totalRunsAll);

    const intentGroups = new Map<
      string,
      {
        engines: Array<{
          engine: string;
          n: number;
          successes: number;
          formulations: number;
          citationRate: number;
          ciLow: number;
          ciHigh: number;
          shareOfVoice: number;
          topCompetitors: Array<{ name: string; mentions: number }>;
        }>;
        successes: number;
        n: number;
      }
    >();
    for (const s of intentStats) {
      const engine = dbProvider(s.provider);
      const sov = sovAcc.get(`${s.intentId}|${engine}`);
      // Same semantics as the audit-level shareOfVoice: no competitors
      // configured → your own citation rate; nobody cited → 0.
      const shareOfVoiceIntent =
        competitorNames.length === 0
          ? round4(s.citationRate)
          : sov && sov.client + sov.comp > 0
            ? round4(sov.client / (sov.client + sov.comp))
            : 0;
      const topCompetitors = sov
        ? [...sov.byComp.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, mentions]) => ({ name, mentions }))
        : [];
      const g = intentGroups.get(s.intentId) ?? { engines: [], successes: 0, n: 0 };
      g.engines.push({
        engine,
        n: s.n,
        successes: s.successes,
        formulations: s.formulations,
        citationRate: round4(s.citationRate),
        ciLow: round4(s.ciLow),
        ciHigh: round4(s.ciHigh),
        shareOfVoice: shareOfVoiceIntent,
        topCompetitors,
      });
      g.successes += s.successes;
      g.n += s.n;
      intentGroups.set(s.intentId, g);
    }
    const intentBreakdown = [...intentGroups.entries()].map(([intentId, g]) => {
      const w = wilson95(g.successes, g.n);
      return {
        intent: intentId,
        overall: {
          citationRate: round4(w.rate),
          ciLow: round4(w.low),
          ciHigh: round4(w.high),
          n: w.n,
        },
        engines: g.engines,
      };
    });

    // Sentiment — how the brand is PORTRAYED in answers where it is mentioned.
    // analyzed=false (no mentions) → neutral 0.5 (honest baseline).
    const sentiment = analyzeSentiment(sentimentProbes, brand.name);

    // Brand + Performance now come from the live site crawl when the site was
    // reachable; otherwise they fall back to neutral baselines (crawl returns 0.5).
    // eeaSignal blends on-site E-E-A-T (crawl) with off-site authority (presence
    // on Reddit/Wikipedia/G2/etc.) — 50/50. Off-site is a major real GEO lever.
    // eeaSignal blends on-site E-E-A-T, off-site authority, and the Reddit
    // deep-dive (the single highest-value AI-citation source — C5).
    // HONESTY GUARD: only blend signals we actually MEASURED live. A mock/keyless
    // fallback (reddit-signal/offsite-signal fabricate brand-specific data when
    // their key is absent) must NEVER feed the score as if it were real. If a
    // signal isn't live, it's excluded and the remaining weights re-normalise;
    // if nothing is measurable, eeaSignal is a neutral 0.5 baseline — not invented.
    const eeaParts: Array<{ v: number; w: number }> = [];
    if (crawl.reachable) eeaParts.push({ v: crawl.brand.eeaSignal, w: 0.4 });
    if (offsite.live) eeaParts.push({ v: offsite.offsiteScore, w: 0.4 });
    if (reddit.live) eeaParts.push({ v: reddit.redditScore, w: 0.2 });
    const eeaWeight = eeaParts.reduce((s, p) => s + p.w, 0);
    const eeaBlended =
      eeaWeight > 0 ? eeaParts.reduce((s, p) => s + p.v * p.w, 0) / eeaWeight : 0.5;

    // entityCompleteness from the cross-source entity graph (C7) when usable, else
    // the on-site crawl estimate — see pickEntityCompleteness. Previously keyed on
    // entity.found alone, which let a brand with NO Wikidata entity but a well-
    // marked-up site keep the on-site estimate (often 1.0), inflating Brand and
    // contradicting the audit's own "AI can't resolve you as an entity" finding.
    const entityCompleteness = pickEntityCompleteness(entity, crawl.brand.entityCompleteness);

    const scoreInputs = {
      brand: {
        entityCompleteness,
        // Real competitive standing, NOT an amplified copy of citationRate.
        // (Was Math.min(1, citationRate*1.5) — a 50% inflation. Removed.)
        citationVolume: shareOfVoice,
        eeaSignal: eeaBlended,
      },
      performance: {
        // schemaCoverage now blends raw schema.org coverage with multi-page
        // content citation-worthiness (Princeton GEO traits) — both measure
        // "is your content AI-ready". 50/50 when content was analyzed.
        schemaCoverage: content.analyzed
          ? crawl.performance.schemaCoverage * 0.5 + content.contentScore * 0.5
          : crawl.performance.schemaCoverage,
        llmsTxtPresent: crawl.performance.llmsTxtPresent,
        aiCrawlerAccess: crawl.performance.aiCrawlerAccess,
        citationShareVsCompetitors: shareOfVoice,
        aioPresence,
      },
      ai: { citationRate, avgPositionScore, sentimentScore: sentiment.sentimentScore },
    };
    const score = computeGeoScore(scoreInputs);

    // Crawl-derived inputs are "measured" only when the site was actually reached.
    const crawlMeasured = crawl.reachable;
    const measured = {
      ai: sentiment.analyzed
        ? ["citationRate", "avgPositionScore", "sentimentScore"]
        : ["citationRate", "avgPositionScore"],
      // llms.txt is no longer a scored input (Google 2026 alignment) — surfaced as
      // an informational crawl finding only, not listed among measured score inputs.
      performance: crawlMeasured
        ? ["citationShareVsCompetitors", "aioPresence", "schemaCoverage", "aiCrawlerAccess"]
        : ["citationShareVsCompetitors", "aioPresence"],
      // eeaSignal is always measured (off-site + Reddit always run). entity
      // completeness is measured when the entity graph resolved an entity (C7) OR
      // the on-site crawl reached the site.
      brand: (entity.found || crawlMeasured)
        ? ["citationVolume", "entityCompleteness", "eeaSignal"]
        : ["citationVolume", "eeaSignal"],
    };
    const baseline = {
      ai: sentiment.analyzed ? [] : ["sentimentScore"],
      performance: crawlMeasured ? [] : ["schemaCoverage", "aiCrawlerAccess"],
      // entityCompleteness is a baseline only when NEITHER the entity graph nor
      // the crawl produced a measure.
      brand: (entity.found || crawlMeasured) ? [] : ["entityCompleteness"],
    };

    const breakdown = {
      overall: score.overall,
      providers: providersUsed,
      // Engine coverage for THIS run. Persisted in provider_breakdown rather
      // than new geo_audit columns on purpose: nothing runs db:migrate on
      // deploy, so a new column would be missing in production and this would
      // ship dead — which is the exact failure this field exists to expose.
      //
      // `comparable` is false when any requested engine went unanswered. A
      // score is a rate over the probes that ran, so a smaller panel is a
      // different measurement, not a lower one, and the UI must not draw it on
      // the same trend line as a full-panel run without saying so.
      coverage: {
        requested: cov.requested,
        answered: cov.answered,
        missing: cov.missing,
        paused: cov.paused,
        comparable: cov.comparable,
      },
      inputs: scoreInputs,
      measured,
      baseline,
      probesTotal: responses.length,
      probesCited: citedAnyCount,
      probeRepeat: result.baseRuns,
      // B1 — protocol identity + audit-level citation rate with Wilson 95% CI.
      methodologyVersion: GEO_METHODOLOGY_VERSION,
      citationCI: {
        rate: round4(citationCI.rate),
        low: round4(citationCI.low),
        high: round4(citationCI.high),
        n: citationCI.n,
      },
      // B1 — per-intent breakdown: rate ± CI and share of voice per engine.
      intents: intentBreakdown,
      // B1/B8 — sampling telemetry: what was escalated, what the ceiling did,
      // and how the 24h probe cache behaved. All additive (old readers ignore).
      sampling: {
        baseRuns: result.baseRuns,
        maxGenerations: result.maxGenerations,
        generationsUsed: result.generationsUsed,
        capReached: result.capReached,
        escalations: result.escalations.map((e) => ({
          intent: e.intentId,
          engine: dbProvider(e.provider),
          extraRuns: e.extraRuns,
        })),
        cache: {
          enabled: cacheEnabled,
          hits: cacheHits,
          misses: Math.max(0, cacheLookups - cacheHits),
        },
      },
      // B3 — two-pass citation extraction telemetry. ADDITIVE: old readers that
      // don't know this key keep working. `mode` says which path ran
      // (two_pass / fallback_single_pass / disabled / mixed), by_kind counts
      // every extracted mention by its FINAL kind, and sample_rejections shows
      // (up to 3) concrete false positives this audit refused to count.
      extraction: {
        mode: extractionMode,
        verified_count: extractionVerified,
        rejected_count: extractionRejected,
        by_kind: extractionByKind,
        sample_rejections: extractionRejections,
        // How many probe aggregates lost their citation because no verified
        // recommendation/source mention survived (the false positives B3 kills).
        probes_adjusted: extractionAdjusted,
        llm_calls: extractionCalls,
      },
      // B2 surface note — which surface each engine was actually probed on
      // (search-enabled consumer surface vs no-search fallback GEO_WEB_SEARCH=0).
      // Keyed by DB provider name, matching providers_used.
      surfaces: Object.fromEntries(
        Array.from(new Set(responses.map((r) => r.provider))).map((p) => [
          dbProvider(p),
          providerSurface(p),
        ])
      ),
      // Site-crawl evidence shown under Brand/Performance in the breakdown UI.
      siteCrawl: {
        reachable: crawl.reachable,
        domain: brand.domain ?? null,
        findings: crawl.findings,
      },
      // Competitor benchmark — "who AI recommends instead of you" (ranked).
      competitors: competitorBenchmark,
      // Off-site signal — presence on the high-authority sources AI cites most.
      offsite: {
        live: offsite.live,
        score: offsite.offsiteScore,
        sources: offsite.sources,
        findings: offsite.findings,
      },
      // Content GEO — multi-page citation-worthiness (Princeton traits).
      content: {
        analyzed: content.analyzed,
        pagesAnalyzed: content.pagesAnalyzed,
        score: content.contentScore,
        traits: content.traits,
        findings: content.findings,
      },
      // Sentiment — how the brand is portrayed in AI answers (AI vector).
      sentiment: {
        analyzed: sentiment.analyzed,
        score: sentiment.sentimentScore,
        positive: sentiment.positive,
        neutral: sentiment.neutral,
        negative: sentiment.negative,
        mentionsClassified: sentiment.mentionsClassified,
        findings: sentiment.findings,
      },
      // Reddit deep-dive (C5) — the #1 AI-cited source, under the Brand vector.
      reddit: {
        live: reddit.live,
        score: reddit.redditScore,
        threadCount: reddit.threadCount,
        subreddits: reddit.subreddits,
        sentiment: reddit.sentiment,
        findings: reddit.findings,
      },
      // Entity graph (C7) — cross-source consistency, under the Brand vector.
      entity: {
        live: entity.live,
        found: entity.found,
        wikidataId: entity.wikidataId,
        hasWikipedia: entity.hasWikipedia,
        properties: entity.properties,
        domainConsistent: entity.domainConsistent,
        completeness: entity.entityCompleteness,
        findings: entity.findings,
      },
    };

    // Write the time-series score row.
    await sql`
      INSERT INTO geo_score
        (tenant_id, brand_id, audit_id, score_brand, score_performance, score_ai, provider_breakdown, recorded_at)
      VALUES
        (${tenant_id}, ${brand_id}, ${audit_id}, ${score.brand}, ${score.performance},
         ${score.ai}, ${sql.json(JSON.parse(JSON.stringify(breakdown)))}, NOW())
    `;

    // Finalize the audit: scores, providers used, completion time.
    await sql`
      UPDATE geo_audit
         SET status = 'complete',
             score_brand = ${score.brand},
             score_performance = ${score.performance},
             score_ai = ${score.ai},
             providers_used = ${sql.json(providersUsed)},
             completed_at = NOW()
       WHERE id = ${audit_id}
    `;

    // B1 — stamp the sampling protocol version on the audit. Separate,
    // fault-tolerant statement so an old schema (migration 20260728000001
    // pending → 42703) can never fail the audit finalize above.
    try {
      await sql`
        UPDATE geo_audit
           SET methodology_version = ${GEO_METHODOLOGY_VERSION}
         WHERE id = ${audit_id}
      `;
    } catch (err: unknown) {
      logger.warn("geo_audit_methodology_version_skipped", {
        message: (err as Error).message?.slice(0, 160),
      });
    }

    // Record estimated audit spend in the monthly budget ledger (visibility only
    // — audits are NOT hard-capped, so paying customers are never cut off).
    try {
      // B1/B8: the estimate now scales with the generations ACTUALLY consumed
      // by this run (sequential sampling shrinks it, escalation grows it, cache
      // hits remove it) instead of a flat per-audit constant. Rate ≈ 1.2¢ per
      // generation — the B2 search-enabled blend across the 5 engines (OpenAI
      // 1.3¢ + Claude 1.8¢ + Gemini 1.7¢ + Perplexity 0.6¢ + SERP 0.5¢ ≈ 5.9¢
      // per prompt-round / 5 engines). AUDIT_COST_CENTS still overrides with a
      // flat per-audit value; AUDIT_COST_PER_GEN_CENTS tunes the rate.
      const perGenRaw = Number(process.env["AUDIT_COST_PER_GEN_CENTS"] ?? 1.2);
      const perGenCents = Number.isFinite(perGenRaw) && perGenRaw > 0 ? perGenRaw : 1.2;
      // B3: the extraction + verification passes are extra (cheap-tier) calls.
      // ≈0.2¢ each (haiku-4-5 / gpt-4o-mini, ~1k in + ~200 out, no web search).
      // Counting them keeps the spend ledger honest instead of hiding the new
      // cost inside the per-generation blend. AUDIT_COST_PER_EXTRACTION_CENTS tunes it.
      const perExtractionRaw = Number(process.env["AUDIT_COST_PER_EXTRACTION_CENTS"] ?? 0.2);
      const perExtractionCents =
        Number.isFinite(perExtractionRaw) && perExtractionRaw > 0 ? perExtractionRaw : 0.2;
      const flatOverride = Number(process.env["AUDIT_COST_CENTS"] ?? NaN);
      const auditCostCents = Number.isFinite(flatOverride)
        ? flatOverride
        : Math.max(
            1,
            Math.round(
              result.generationsUsed * perGenCents + extractionCalls * perExtractionCents
            )
          );
      await sql`INSERT INTO api_spend (op, est_cost_cents) VALUES ('audit', ${auditCostCents})`;
    } catch (err) {
      logger.warn("audit_spend_record_failed", { message: (err as Error).message });
    }

    logger.info("audit_completed", {
      audit_id,
      overall: score.overall,
      providers_used: providersUsed.length,
      blocked: result.blockedProviders.length,
      methodology: GEO_METHODOLOGY_VERSION,
      generations_used: result.generationsUsed,
      gens_cap_reached: result.capReached,
      escalations: result.escalations.length,
      cache_hits: cacheHits,
      extraction_mode: extractionMode,
      extraction_rejected: extractionRejected,
      extraction_adjusted: extractionAdjusted,
    });

    return { audit_id, overall: score.overall };
  });
}

// ---------------------------------------------------------------------------
// processDailyMonitoredBrands — enqueues scheduled-audit BullMQ jobs for all
// brands that have monitoring_enabled=TRUE and tracking_frequency='daily'.
//
// Graceful fallback: if the tracking_frequency column doesn't exist yet (42703),
// the function logs a warning and returns early — the worker MUST NOT crash.
// Called by the daily interval loop in apps/worker/src/index.ts.
// ---------------------------------------------------------------------------

let _dailyAuditQueue: Queue | null = null;

function getDailyAuditQueue(): Queue {
  if (_dailyAuditQueue) return _dailyAuditQueue;
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  redis.on("error", (err: Error) => {
    logger.error("daily_monitor_redis_error", { message: err.message });
  });
  _dailyAuditQueue = new Queue("geo-audit", { connection: redis });
  return _dailyAuditQueue;
}

export async function processDailyMonitoredBrands(sql: postgres.Sql): Promise<void> {
  let rows: Array<{ id: string; tenant_id: string; region: string }>;

  try {
    rows = await sql<Array<{ id: string; tenant_id: string; region: string }>>`
      SELECT id, tenant_id, region
        FROM brands
       WHERE monitoring_enabled = TRUE
         AND tracking_frequency = 'daily'
    `;
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42703") {
      // Column tracking_frequency not yet in schema — migration pending. Non-fatal.
      logger.warn("daily_monitor_column_missing", {
        message: "tracking_frequency column not found; skipping daily monitor loop",
      });
      return;
    }
    // Any other error: log and return — loop MUST NOT crash the worker.
    logger.error("daily_monitor_query_failed", {
      message: (err as Error).message?.slice(0, 200),
    });
    return;
  }

  if (rows.length === 0) {
    logger.info("daily_monitor_no_brands", { count: 0 });
    return;
  }

  const queue = getDailyAuditQueue();
  let enqueued = 0;

  for (const brand of rows) {
    try {
      // Unique jobId per dispatch (includes timestamp) to avoid dedup conflicts
      // with the weekly monitor:${brandId} repeatable jobs.
      const jobId = `daily-monitor:${brand.id}:${Date.now()}`;
      await queue.add(
        "scheduled-audit",
        { tenant_id: brand.tenant_id, brand_id: brand.id, region: brand.region },
        { jobId }
      );
      enqueued += 1;
    } catch (err: unknown) {
      logger.error("daily_monitor_enqueue_failed", {
        brand_id: brand.id,
        message: (err as Error).message?.slice(0, 200),
      });
      // Continue — one failure must not block others
    }
  }

  logger.info("daily_monitor_dispatched", { enqueued, total: rows.length });
}
