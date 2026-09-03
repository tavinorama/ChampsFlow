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
  type ProbeUsage,
  mergeProbeUsage,
  recordSpend,
  execForPostgresJs,
  buildLoopCandidates,
  reconcileLoopTasks,
  type LoopProbe,
  type PrevTask,
  providerSurface,
  permittedProviders,
  probeCacheEnabled,
  getCachedProbe,
  setCachedProbe,
} from "../../../../packages/llm/src/index";
import { logger } from "../../../../packages/shared/src/logger";
import {
  coverageNoticeNeeded,
  sendAuditCoverageNoticeEmail,
} from "../../../../packages/shared/src/emails/audit-coverage-notice";
import { driftVerdicts, hallucinatingEnginesToday } from "./drift-control";
import { runWithTenant } from "../../../api/src/db/tenant-context";
import { PLAN_LIMITS, type PlanTier } from "../../../api/src/integrations/stripe";
import { creditsForAudit } from "../../../api/src/lib/credits";
import { overagePackUsd } from "../../../../packages/shared/src/credits";
import { sendCreditsOutEmail } from "../../../../packages/shared/src/emails/credits-out";

/**
 * D1: one "You are out of credits" email per tenant per month, sent when a
 * debit crosses the balance to zero. The month guard is an audit_log row
 * (event_type credits_out_email); if that read fails we still send, because
 * the crossing rule already bounds it to one per crossing. Never throws.
 */
export async function notifyCreditsOut(
  sql: postgres.Sql,
  input: { tenantId: string; brandName?: string | null; balance: number; planTier: string }
): Promise<void> {
  const { tenantId } = input;
  try {
    try {
      const [already] = await sql<{ one: number }[]>`
        SELECT 1 AS one FROM audit_log
         WHERE event_type = 'credits_out_email' AND tenant_id = ${tenantId}::uuid
           AND created_at >= date_trunc('month', NOW())
         LIMIT 1
      `;
      if (already) {
        logger.info("credits_out_email_skipped_this_month", { tenant_id: tenantId });
        return;
      }
    } catch (err) {
      logger.warn("credits_out_email_month_check_failed", { tenant_id: tenantId, message: (err as Error).message?.slice(0, 120) });
    }
    const [owner] = await sql<{ email: string }[]>`
      SELECT email FROM users
       WHERE tenant_id = ${tenantId}::uuid AND role = 'owner' AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1
    `;
    if (!owner?.email) {
      logger.warn("credits_out_email_no_owner", { tenant_id: tenantId });
      return;
    }
    await sendCreditsOutEmail({
      to: owner.email,
      brand: input.brandName ?? null,
      balance: input.balance,
      packCredits: 1000,
      packUsd: overagePackUsd(1000),
      plan: input.planTier,
    });
    logger.info("credits_out_email_sent", { tenant_id: tenantId, balance: input.balance });
    try {
      await sql`
        INSERT INTO audit_log (event_type, tenant_id, target_entity, metadata, created_at)
        VALUES ('credits_out_email', ${tenantId}::uuid, 'credit_ledger', ${sql.json({ balance: input.balance, plan: input.planTier })}, NOW())
      `;
    } catch (err) {
      logger.warn("credits_out_email_log_failed", { tenant_id: tenantId, message: (err as Error).message?.slice(0, 120) });
    }
  } catch (err) {
    logger.warn("credits_out_email_failed", { tenant_id: tenantId, message: (err as Error).message?.slice(0, 160) });
  }
}

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
  /**
   * Answered, and counted — but its control battery says it is failing. Kept in
   * the panel deliberately via GEO_DRIFT_PAUSE_EXEMPT.
   *
   * This is the category that makes a FULL panel worth a warning. Without it, an
   * exempt engine reads as 5-of-5 with nothing to say, which is a worse claim
   * than an honest 4-of-5: the number looks complete and is quietly softer.
   */
  degraded: string[];
  /**
   * True only when the panel was complete AND every member was healthy.
   *
   * Degraded members break comparability just as absent ones do — a score built
   * on an engine that stopped naming brands it should name is not the same
   * measurement as last week's, whatever the engine count says.
   */
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
  paused: readonly string[],
  degraded: readonly string[] = []
): EngineCoverage {
  const absent = comparisonPanel.filter((p) => !answered.has(p));
  const answeredInPanel = comparisonPanel.filter((p) => answered.has(p)).length;
  // Only count a degraded engine if it actually answered — one that was kept in
  // the panel and then failed to respond is absent, not unreliable, and saying
  // both would double-count the same engine in two categories.
  const degradedAnswered = comparisonPanel.filter(
    (p) => degraded.includes(p) && answered.has(p)
  );
  return {
    requested: comparisonPanel.length,
    answered: answeredInPanel,
    missing: absent.filter((p) => !paused.includes(p)),
    paused: comparisonPanel.filter((p) => paused.includes(p)),
    degraded: degradedAnswered,
    comparable: absent.length === 0 && degradedAnswered.length === 0,
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
      // Any DB error: log and continue with defaults only — custom prompts
      // must never block the audit. (#139 decides if this should scream.)
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

    // Margin guard (cost-control). This branch handles SCHEDULED runs; manual
    // ones are rejected up front in apps/api/src/routes/audits.ts so the user
    // gets a message rather than a silent no-op.
    //
    // The COUNT, however, covers BOTH kinds — and that is the 2026-08-05 fix.
    // It used to filter `triggered_by = 'cron'`, which meant manual re-runs were
    // invisible to the ceiling. Since agency allows a manual re-audit per brand
    // per DAY, a customer using exactly what we sold could reach 343 audits in a
    // month and leave 2.5% margin. Counting only half the spend is not a spend
    // guard. Now: once a tenant has completed monthly_audits_total audits of any
    // origin this calendar month, further scheduled runs are skipped and their
    // (un-run) row deleted.
    //
    // Month window uses date_trunc('month', NOW()) — the DB server tz, same
    // convention as the api_spend monthly budget (products.ts). This is a SOFT
    // ceiling by design: fail-open on a count error, and count-then-act is not
    // atomic, so it bounds cost rather than hard-locking it. A few hours of
    // month-boundary drift is immaterial for a spend guard.
    if (!job.data.audit_id) {
      const cap = PLAN_LIMITS[planTier]?.monthly_audits_total;
      if (typeof cap === "number") {
        try {
          const capRows = await sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM geo_audit
             WHERE tenant_id = ${tenant_id}
               AND status = 'complete'
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
    // Failing engines the founder chose to KEEP in the panel. They probe and
    // count like any other; the customer is told, and told what they cost.
    let degradedProviders: GeoLLMProvider[] = [];

    // B4 — anti-drift pause. An engine whose latest control-battery verdict is
    // 'failing' (it stopped naming dominant brands, or it described entities
    // that do not exist) is dropped from this audit: a hallucinating engine
    // produces fiction, not citations, and folding that into a customer's score
    // would hand them a number we already know is wrong.
    //
    // Two guards, both deliberate:
    //   - fail-open: driftVerdicts() never throws and returns empty lists when
    //     the history is missing/stale/disabled (GEO_DRIFT_PAUSE=0 is the
    //     blunt override; GEO_DRIFT_PAUSE_EXEMPT keeps ONE named engine in the
    //     panel without switching the guard off for the other four).
    //   - never pause everything: if every requested engine is failing, the
    //     problem is almost certainly on OUR side. Keep them all and shout —
    //     a silently empty audit is worse than a loud suspicious one.
    // P7: today's negative-control hits, stamped into this audit's breakdown
    // at write time (the 03:30 backfill covers audits that ran earlier).
    let hallucinationFlags: string[] = [];
    try {
      hallucinationFlags = await hallucinatingEnginesToday(sql);
    } catch {
      /* fail-open — tomorrow's battery backfills */
    }
    try {
      const verdicts = await driftVerdicts(sql);
      const paused = verdicts.paused;
      // Failing but kept by GEO_DRIFT_PAUSE_EXEMPT: it probes normally, its
      // answers count, and coverage.degraded carries that to the customer.
      // Keeping it silent would be the one thing this battery exists to stop.
      degradedProviders = requestedProviders.filter((p) => verdicts.degraded.includes(p));
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
    const cov = computeEngineCoverage(comparisonPanel, answeredProviders, pausedProviders, degradedProviders);
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
      // B1 columns (intent_id / formulation_ix / methodology_version) are
      // guaranteed by boot-time migrations; a failed insert fails the audit.
      await sql`
        INSERT INTO citation_check
          (tenant_id, brand_id, audit_id, provider, query_hash, query_text, cited, citation_rank, sources,
           mention_rate, runs_count, raw_text_snippet, intent_id, formulation_ix, methodology_version,
           source_id, processed_at)
        VALUES
          (${tenant_id}, ${brand_id}, ${audit_id}, ${dbProvider(resp.provider)},
           ${resp.queryHash ?? sha256(brand.name + "|" + resp.provider)},
           ${resp.queryText ?? null},
           ${mentioned}, ${position ?? null}, ${sql.json(sanitizeSources(resp.sources))},
           ${resp.mentionRate ?? null}, ${resp.runs ?? null}, ${capText(resp.rawText)},
           ${intentMeta?.intentId ?? null}, ${intentMeta?.formulationIx ?? null},
           ${GEO_METHODOLOGY_VERSION},
           ${dbProvider(resp.provider) === "dataforseo" ? "serp_public_search" : "provider_answer"},
           NOW())
      `;

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

    // The same headline number, recomputed with every degraded engine removed.
    //
    // A warning that an engine is unreliable is worth something; a warning that
    // shows what it COST is worth more. "4 of 5 engines, one is drifting" leaves
    // the customer with no way to judge whether that mattered — this hands them
    // the two numbers and lets them decide. If they move together, the flagged
    // engine changed nothing and the score can be trusted as usual. If they
    // diverge, the flag was the story.
    //
    // Null when nothing was degraded, so the UI has an unambiguous "no caveat"
    // signal rather than two identical numbers it has to compare to find out.
    // Uses the same fractional mentionRate the headline uses, so the two numbers
    // are the same measurement on different panels — not two different maths
    // that happen to sit side by side.
    let citationRateWithoutDegraded: number | null = null;
    if (degradedProviders.length > 0) {
      const clean = responses.filter(
        (r) => !degradedProviders.includes(r.provider as GeoLLMProvider)
      );
      // Only meaningful if something survived the exclusion. With every engine
      // degraded there is no unflagged view to offer, and inventing one from an
      // empty set would be exactly the fabrication this guard exists to stop.
      if (clean.length > 0) {
        const cleanCited = clean.reduce(
          (sum, r) =>
            sum + (typeof r.mentionRate === "number" ? r.mentionRate : r.mentioned ? 1 : 0),
          0
        );
        citationRateWithoutDegraded = cleanCited / clean.length;
      }
    }
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
      // than new geo_audit columns — a historical choice from when nothing ran
      // db:migrate on deploy (both services now migrate at boot). Kept: moving
      // it to columns is schema churn with no reader benefit.
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
        // Answered and counted, but flagged by its own control battery. Carried
        // so the UI can name the engine rather than say "one of them".
        degraded: cov.degraded,
        comparable: cov.comparable,
        // The two numbers side by side: the headline as published, and the same
        // measurement with the flagged engines removed. Lets the customer check
        // our caveat instead of taking it on faith — and shows, in their own
        // data, whether the flag actually cost them anything.
        citationRate: round4(citationRate),
        citationRateWithoutDegraded:
          citationRateWithoutDegraded === null ? null : round4(citationRateWithoutDegraded),
      },
      // P7 (council verdict): engines that confirmed an invented brand in
      // today's control battery. Annotation only — the score above is exactly
      // what the panel measured; the UI names the engine and shows the
      // comparison so the caveat is checkable, never a silent adjustment.
      ...((): Record<string, unknown> => {
        const inPanel = hallucinationFlags.filter((e) =>
          (requestedProviders as readonly string[]).includes(e)
        );
        return inPanel.length > 0 ? { hallucinationFlags: inPanel } : {};
      })(),
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

    // B1 — stamp the sampling protocol version on the audit. Schema is
    // guaranteed at boot; an error here fails the audit loudly.
    await sql`
      UPDATE geo_audit
         SET methodology_version = ${GEO_METHODOLOGY_VERSION}
       WHERE id = ${audit_id}
    `;

    // -----------------------------------------------------------------------
    // Visibility Loop v2 (Phase 1): every COMPLETED audit refreshes the
    // client's "Do Next" cards, deterministically from the probe evidence that
    // was just measured — no LLM, no button. Root cause this fixes: plan_task
    // generation only ever ran from a manual button on the legacy brand page
    // (POST /api/audits/:id/plan); dashboard-v3 and the cron audits never
    // called it, so "Do Next" went dead after 2026-07-09.
    //
    // A FRESH strategy_plan row is written per audit (generated_by='loop') and
    // state is carried forward by stable gap key: re-runs refresh cards
    // instead of duplicating them; done stays done; a query that flipped to
    // cited flips its card to "Worked — verified in the audit of <date>".
    //
    // FAIL-SOFT: the audit is already complete and paid for — a loop error is
    // logged loudly and never fails the job.
    try {
      const loopProbes: LoopProbe[] = responses
        .filter((r) => typeof r.queryText === "string" && r.queryText.trim().length > 0)
        .map((r) => ({
          provider: dbProvider(r.provider),
          queryText: (r.queryText as string).trim(),
          cited: r.mentioned,
          rank: r.position ?? null,
          sources: sanitizeSources(r.sources),
          competitors:
            competitorNames.length > 0 ? detectCompetitors(r.rawText ?? "", competitorNames) : [],
        }));
      if (loopProbes.length > 0) {
        const build = buildLoopCandidates(loopProbes, { brandDomain: brand.domain ?? null });
        const prevPlanRows = await sql<{ id: string }[]>`
          SELECT id FROM strategy_plan
           WHERE brand_id = ${brand_id}
           ORDER BY created_at DESC LIMIT 1
        `;
        let prevTasks: PrevTask[] = [];
        if (prevPlanRows[0]) {
          prevTasks = await sql<PrevTask[]>`
            SELECT vector, gap, action, effort, impact, priority, status, evidence, metric, owner
              FROM plan_task
             WHERE plan_id = ${prevPlanRows[0].id}
             ORDER BY priority DESC, created_at ASC
          `;
        }
        const { rows: loopRows, stats } = reconcileLoopTasks(
          prevTasks,
          build,
          new Date().toISOString().slice(0, 10)
        );
        const [loopPlan] = await sql<{ id: string }[]>`
          INSERT INTO strategy_plan (tenant_id, brand_id, audit_id, generated_by, created_at)
          VALUES (${tenant_id}, ${brand_id}, ${audit_id}, 'loop', NOW())
          RETURNING id
        `;
        for (const t of loopRows) {
          await sql`
            INSERT INTO plan_task
              (tenant_id, plan_id, vector, gap, action, effort, impact, priority,
               status, evidence, metric, owner, created_at)
            VALUES
              (${tenant_id}, ${loopPlan.id}, ${t.vector}, ${t.gap}, ${t.action},
               ${t.effort}, ${t.impact}, ${t.priority}, ${t.status},
               ${t.evidence}, ${t.metric}, ${t.owner}, NOW())
          `;
        }
        logger.info("visibility_loop_refreshed", {
          audit_id,
          brand_id,
          plan_id: loopPlan.id,
          ...stats,
        });
      }
    } catch (err) {
      logger.error("visibility_loop_failed", {
        audit_id,
        brand_id,
        message: (err as Error).message?.slice(0, 200),
        effect: "audit delivered but Do Next cards NOT refreshed this run",
      });
    }

    // Record estimated audit spend in the monthly budget ledger (visibility only
    // — audits are NOT hard-capped, so paying customers are never cut off).
    try {
      // PER-ENGINE rates, calibrated against the 2026-08-05 controlled
      // experiment (one isolated audit, provider panels read before/after).
      // The old uniform 1.2¢ blend hid 3x errors in both directions — OpenAI
      // really costs 0.41¢/call and Gemini currently costs 0¢ (free tier) —
      // and an average of wrong numbers cannot stay right as the engine mix
      // shifts, which it does every time drift pauses one.
      //
      // These are still ESTIMATES pending invoice reconciliation (#152), but
      // they are per-engine measurements rather than one guessed blend:
      //   anthropic  1.64¢  measured ($0.36 delta / 22 calls)
      //   openai     0.41¢  measured ($0.09 / 22)
      //   perplexity 0.68¢  measured ($0.15 / 22)
      //   gemini     0¢     measured — FREE TIER today. Deliberately recorded
      //                     as 0 (this ledger reports actual spend, not
      //                     worst-case planning; planning lives in
      //                     credits.USD_PER_PROMPT_AUDIT). If Google starts
      //                     charging, this single line is a +52% audit-cost
      //                     jump — set AUDIT_COST_PER_GEN_CENTS_GEMINI.
      //   serp       0.40¢  DataForSEO list-derived (0.34¢/SERP measured on
      //                     the shared account + 0.06¢ load_async_ai_overview)
      // Per-engine override: AUDIT_COST_PER_GEN_CENTS_<ENGINE>. The legacy
      // uniform AUDIT_COST_PER_GEN_CENTS, if set, applies to engines without a
      // specific override; unknown engines fall back to 1.2¢.
      const MEASURED_GEN_CENTS: Record<string, number> = {
        anthropic: 1.64,
        openai: 0.41,
        perplexity: 0.68,
        gemini: 0,
        serp: 0.4,
      };
      const uniformRaw = Number(process.env["AUDIT_COST_PER_GEN_CENTS"] ?? NaN);
      const uniform = Number.isFinite(uniformRaw) && uniformRaw > 0 ? uniformRaw : null;
      const rateFor = (engine: string): number => {
        const specific = Number(
          process.env[`AUDIT_COST_PER_GEN_CENTS_${engine.toUpperCase()}`] ?? NaN
        );
        if (Number.isFinite(specific) && specific >= 0) return specific;
        if (uniform !== null) return uniform;
        return MEASURED_GEN_CENTS[engine] ?? 1.2;
      };

      // Live generations per engine, from the same accounting generationsUsed
      // uses: cached probes are frozen seed units and cost nothing this run.
      // #152: alongside the count, SUM the measured usage the adapters now
      // attach (tokens, model, searches). A cached response carries no usage
      // (the cache never stores it), so this cannot double-count.
      const gensByEngine: Record<string, number> = {};
      const usageByEngine: Record<string, ProbeUsage | undefined> = {};
      for (const resp of responses) {
        if (resp.fromCache) continue;
        const eng = String(resp.provider);
        gensByEngine[eng] = (gensByEngine[eng] ?? 0) + (resp.runs ?? 1);
        usageByEngine[eng] = mergeProbeUsage(usageByEngine[eng], resp.usage);
      }

      // B3: the extraction + verification passes are extra (cheap-tier) calls.
      // ≈0.2¢ each (haiku-4-5 / gpt-4o-mini, ~1k in + ~200 out, no web search).
      const perExtractionRaw = Number(process.env["AUDIT_COST_PER_EXTRACTION_CENTS"] ?? 0.2);
      const perExtractionCents =
        Number.isFinite(perExtractionRaw) && perExtractionRaw > 0 ? perExtractionRaw : 0.2;

      const genCost = Object.entries(gensByEngine).reduce(
        (sum, [eng, gens]) => sum + gens * rateFor(eng),
        0
      );
      const flatOverride = Number(process.env["AUDIT_COST_CENTS"] ?? NaN);
      const auditCostCents = Number.isFinite(flatOverride)
        ? flatOverride
        : Math.max(1, Math.round(genCost + extractionCalls * perExtractionCents));

      // #152 — MEASURE, not estimate. One api_spend row per live engine, with
      // engine/model/tokens and the list-price cost when the adapter reported
      // usage (source='measured'); the per-engine RATE estimate rides along in
      // est_cost_cents so the two can be compared. Engines whose adapter gave
      // no usage (serp, mock, provider omitted the block) stay 'rate'. The
      // extraction passes have no usage plumbing yet → one 'rate' row. With
      // AUDIT_COST_CENTS set (flat override) the whole audit is ONE 'flat'
      // row, exactly as before. Pre-migration the writer degrades to the
      // legacy (op, est_cost_cents) INSERT — never throws.
      const spendExec = execForPostgresJs(sql);
      const bySource: Record<string, number> = { measured: 0, rate: 0, flat: 0 };
      let measuredEngines = 0;
      let rateEngines = 0;
      if (Number.isFinite(flatOverride)) {
        const r = await recordSpend(spendExec, {
          op: "audit",
          estCents: flatOverride,
          estSource: "flat",
          ref: audit_id,
          tenantId: tenant_id,
        });
        bySource[r.source] = (bySource[r.source] ?? 0) + (r.measuredCents ?? r.estCents);
      } else {
        for (const [eng, gens] of Object.entries(gensByEngine)) {
          const u = usageByEngine[eng];
          const r = await recordSpend(spendExec, {
            op: "audit",
            engine: eng,
            model: u?.model ?? null,
            inputTokens: u?.inputTokens ?? null,
            outputTokens: u?.outputTokens ?? null,
            searchRequests: u?.searchRequests ?? null,
            requests: u?.requests ?? gens,
            estCents: gens * rateFor(eng),
            estSource: "rate",
            ref: audit_id,
            tenantId: tenant_id,
          });
          if (r.source === "measured") measuredEngines += 1;
          else rateEngines += 1;
          bySource[r.source] = (bySource[r.source] ?? 0) + (r.measuredCents ?? r.estCents);
        }
        if (extractionCalls > 0) {
          const r = await recordSpend(spendExec, {
            op: "audit",
            engine: "extraction",
            estCents: extractionCalls * perExtractionCents,
            estSource: "rate",
            ref: audit_id,
            tenantId: tenant_id,
          });
          bySource[r.source] = (bySource[r.source] ?? 0) + (r.measuredCents ?? r.estCents);
        }
      }
      // The split is the point of the change — surface it, so "the ledger says
      // $1.10" can always be decomposed into which engines that actually was,
      // and (now) which of those numbers were measured vs still a rate.
      logger.info("audit_spend_recorded", {
        audit_id,
        cents: auditCostCents,
        per_engine: gensByEngine,
        measured_engines: measuredEngines,
        rate_engines: rateEngines,
        by_source_cents: bySource,
      });
    } catch (err) {
      logger.warn("audit_spend_record_failed", { message: (err as Error).message });
    }

    // Charge the tenant's credit ledger for the audit that just completed (B5,
    // #144). api_spend above is OUR ledger — what the platform paid providers.
    // This is THEIRS — what the plan's allowance was spent on. Two different
    // questions that happen to move together, so they are recorded separately
    // and neither is derived from the other.
    //
    // Written here rather than in the API because this is the only point that
    // knows the audit finished: a run that fails, or that the margin guard
    // skips, must not consume a customer's credits. Charging at enqueue would
    // bill for work we never delivered.
    //
    // The amount comes from creditsForAudit(tier) — depth x the unit price, the
    // same arithmetic the balance and the grant use — so a plan change can never
    // leave the charge and the allowance disagreeing.
    //
    // Idempotent by uniq_credit_ref: BullMQ retries a job after a partial
    // failure, and ON CONFLICT DO NOTHING is what stops a retry becoming a
    // second charge. The guarantee lives in the database index, not in a check
    // here, because check-then-insert leaves the window open.
    //
    // FAILS OPEN, LOUDLY. The audit is finished and the customer can see it; a
    // ledger error must never undo that. But an audit that silently escapes
    // billing is money leaking, so the failure is logged at error level with the
    // ids needed to reconcile it by hand.
    try {
      const creditCost = creditsForAudit(planTier);
      const [row] = await sql<{ id: string; balance_after: number | string }[]>`
        INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)
        SELECT ${tenant_id}::uuid, ${-creditCost}, 'audit', 'geo_audit', ${audit_id}::uuid,
               COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = ${tenant_id}::uuid), 0) - ${creditCost}
          ON CONFLICT (tenant_id, ref_type, ref_id)
            WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING
          RETURNING id, balance_after
      `;
      if (!row) {
        // Expected on a retry, and only then. Worth a line either way: if this
        // shows up without a preceding failure, the idempotency key is wrong.
        logger.info("credit_debit_already_recorded", { audit_id, tenant_id, creditCost });
      } else {
        // D1: the moment the balance CROSSES to zero (or below) is the one time
        // we email "you are out of credits". Crossing = before > 0 and after
        // <= 0, which the ledger row itself tells us; a retry never gets here
        // (no row), so the rule is idempotent without a flag. audit_log adds
        // the once-per-month guard for the case where a top-up and a second
        // crossing happen inside the same month. Best-effort end to end: an
        // email failure never touches the audit or the charge.
        const after = Number(row.balance_after);
        const before = after + creditCost;
        if (Number.isFinite(after) && after <= 0 && before > 0) {
          void notifyCreditsOut(sql, { tenantId: tenant_id, brandName: brand.name, balance: after, planTier });
        }
      }
    } catch (err) {
      logger.error("credit_debit_failed", {
        audit_id,
        tenant_id,
        plan: planTier,
        message: (err as Error).message?.slice(0, 160),
        effect: "audit delivered but NOT charged — reconcile manually",
      });
    }

    // D8d — customer-facing coverage notice. When the panel was partial
    // (comparable=false) or an engine was held back for drift, tell the
    // owner ONCE what was and was not measured. Idempotent per audit_id: the
    // send is claimed atomically on geo_score.provider_breakdown
    // ('coverage_notice') so a BullMQ retry never emails twice. Best-effort —
    // never fails a delivered audit; failure is logged loudly.
    if (coverageNoticeNeeded(cov)) {
      try {
        const claimed = await sql<{ id: string }[]>`
          UPDATE geo_score
             SET provider_breakdown = provider_breakdown
               || ${sql.json({ coverage_notice: { status: "pending", claimed_at: new Date().toISOString() } })}
           WHERE audit_id = ${audit_id}
             AND (
               NOT (provider_breakdown ? 'coverage_notice')
               OR provider_breakdown->'coverage_notice'->>'status' = 'failed'
             )
          RETURNING id`;
        if (claimed.length > 0) {
          const ownerRows = await sql<{ email: string }[]>`
            SELECT email FROM users WHERE tenant_id = ${tenant_id} AND role = 'owner' LIMIT 1`;
          const ownerEmail = ownerRows[0]?.email;
          let status: "sent" | "failed" | "no_owner" = "no_owner";
          let messageId: string | null = null;
          if (ownerEmail) {
            try {
              const r = await sendAuditCoverageNoticeEmail({
                to: ownerEmail,
                brandName: brand.name,
                auditId: audit_id,
                answered: comparisonPanel.filter((p) => answeredProviders.has(p)),
                missing: cov.missing,
                paused: cov.paused,
                degraded: cov.degraded,
                comparable: cov.comparable,
              });
              status = "sent";
              messageId = r.id || null;
            } catch (err) {
              status = "failed";
              logger.error("audit_coverage_notice_send_failed", {
                audit_id,
                tenant_id,
                message: (err as Error).message?.slice(0, 200),
              });
            }
          }
          await sql`
            UPDATE geo_score
               SET provider_breakdown = provider_breakdown
                 || ${sql.json({ coverage_notice: { status, sent_at: new Date().toISOString(), resend_message_id: messageId } })}
             WHERE audit_id = ${audit_id}`;
          logger.info("audit_coverage_notice", { audit_id, tenant_id, status, comparable: cov.comparable, paused: cov.paused.length, missing: cov.missing.length });
        }
      } catch (err) {
        logger.error("audit_coverage_notice_failed", { audit_id, message: (err as Error).message?.slice(0, 200) });
      }
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
// Any DB error is logged at error level and the cycle skipped — the worker
// MUST NOT crash, and it never skips silently.
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
    // Any error: log loudly and return — loop MUST NOT crash the worker.
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
