/**
 * BullMQ audit-run job processor — C1 GEO Audit Engine (TrustIndex AI)
 *
 * Job payload: { audit_id, tenant_id, brand_id, region }  — no PII.
 *
 * Flow:
 *   1. Set RLS tenant context; load the brand + a buyer-prompt portfolio.
 *   2. runProbes() across permitted providers (routing gate: EU excludes Perplexity).
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
  runProbes,
  computeGeoScore,
  parseCitation,
  crawlSite,
  tallyCompetitors,
  type CompetitorProbe,
  measureOffsiteSignal,
  analyzeContentGeo,
  analyzeSentiment,
  analyzeRedditPresence,
  analyzeEntityGraph,
  type SentimentProbeInput,
  type ProbeQuery,
  type GeoLLMProvider,
} from "../../../../packages/llm/src/index";
import { logger } from "../../../../packages/shared/src/logger";
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

// Default buyer-prompt portfolio. A later slice generates these per brand/category;
// for now a representative set so the audit produces a real signal.
function buildPromptPortfolio(brandName: string, category: string | null): string[] {
  const cat = category && category.trim() ? category.trim() : "solution";
  return [
    `What is the best ${cat} for small businesses?`,
    `Top ${cat} providers in 2026`,
    `${cat} alternatives worth considering`,
    `Which ${cat} do experts recommend?`,
    `Most trusted ${cat} companies`,
    `Best ${cat} for SMBs on a budget`,
    `${brandName} vs competitors`,
    `Is ${brandName} a good choice?`,
    `Pros and cons of leading ${cat} options`,
    `How to choose a ${cat} vendor`,
  ];
}

const REQUESTED_PROVIDERS: GeoLLMProvider[] = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serp",
];

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

    // Build probe portfolio.
    const prompts = buildPromptPortfolio(brand.name, brand.category);

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
        const defaultsNorm = new Set(prompts.map((p) => p.toLowerCase().trim()));
        let added = 0;
        for (const row of customRows) {
          if (added >= 10) break;
          const norm = row.text.toLowerCase().trim();
          if (!defaultsNorm.has(norm)) {
            prompts.push(row.text);
            added += 1;
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
    const promptCap = PLAN_LIMITS[planTier]?.prompts_per_audit ?? PLAN_LIMITS.free.prompts_per_audit;
    if (prompts.length > promptCap) prompts.length = promptCap;

    const queries: ProbeQuery[] = prompts.map((t) => ({
      queryHash: sha256(t),
      queryText: t,
      brandName: brand.name,
    }));

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

    // In LIVE mode, repeat each probe to capture AI non-determinism as a mention
    // RATE with confidence. Mock adapters are deterministic, so repeat=1 there.
    const liveMode =
      !!process.env["ANTHROPIC_API_KEY"] ||
      !!process.env["OPENAI_API_KEY"] ||
      !!process.env["PERPLEXITY_API_KEY"] ||
      !!process.env["GEMINI_API_KEY"];
    const repeat = liveMode ? Number(process.env["GEO_PROBE_REPEAT"] ?? 3) : 1;

    // Fan out across permitted providers (routing gate applied inside).
    // requestedProviders respects brand's tracked_models setting (filtered above).
    const result = await runProbes(queries, {
      region: userRegion,
      requestedProviders,
      repeat,
    });

    // INTEGRITY: if EVERY provider returned nothing (all keys out of
    // credits/quota, all errored, or none permitted), we measured zero AI
    // answers. Do NOT compute a score from no data — a 0 citation rate would
    // read as "you're invisible" when the truth is "we couldn't run the audit".
    // Mark the run failed so the UI honestly says so (and the user re-runs once
    // credits are available) instead of persisting a misleading score.
    if (result.responses.length === 0) {
      logger.warn("audit_all_providers_failed", {
        audit_id,
        requested: requestedProviders.length,
        failed: result.failedProviders.length,
        blocked: result.blockedProviders.length,
      });
      await sql`UPDATE geo_audit SET status = 'failed' WHERE id = ${audit_id}`;
      throw new Error("all_providers_failed");
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

    // Persist citation_check rows + ai_generation_log (append-only). Aggregate only.
    // citedCount uses the mention RATE (fractional in live repeat mode) so the AI
    // score reflects confidence, not a single coin flip.
    let citedCount = 0;     // sum of mention rates (fractional) — the "expected" cite count
    let citedAnyCount = 0;  // count of probes cited in >=1 run (for probes_cited display)
    let positionScoreSum = 0;
    let positionScoreN = 0;
    // Sentiment inputs — answer text + mention flag per probe (analysed after loop).
    const sentimentProbes: SentimentProbeInput[] = [];

    for (const resp of result.responses) {
      const rate = typeof resp.mentionRate === "number" ? resp.mentionRate : (resp.mentioned ? 1 : 0);
      const mentioned = resp.mentioned; // majority-of-runs (rate >= 0.5)
      const position = resp.position;
      citedCount += rate;
      if (rate > 0) citedAnyCount += 1;
      if (mentioned && position && position > 0) {
        positionScoreSum += 1 / position;
        positionScoreN += 1;
      }

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

      // citation_check stores the buyer prompt + cited sources as audit evidence
      // (the prompt is a synthetic category question, not PII; purged after 90d).
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

      await sql`
        INSERT INTO ai_generation_log
          (tenant_id, feature_id, input_hash, provider, model_version, output_hash, zdr_confirmed, latency_ms, timestamp)
        VALUES
          (${tenant_id}, 'GEO-1', ${sha256(resp.provider + "|" + brand.name)},
           ${dbProvider(resp.provider)}, ${"mock-or-live"}, ${sha256(resp.rawText ?? "")},
           ${userRegion === "EU"}, ${0}, NOW())
      `;
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
    const totalProbes = result.responses.length || 1;
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

    const aioPresence = result.responses.some((r) => r.provider === "serp" && r.mentioned);

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

    // entityCompleteness now comes from the cross-source entity graph (C7) when an
    // entity was resolved — this is the measured signal that closes the last Brand
    // baseline. Falls back to the on-site crawl estimate otherwise.
    const entityCompleteness = entity.found ? entity.entityCompleteness : crawl.brand.entityCompleteness;

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
      inputs: scoreInputs,
      measured,
      baseline,
      probesTotal: result.responses.length,
      probesCited: citedAnyCount,
      probeRepeat: repeat,
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

    // Record estimated audit spend in the monthly budget ledger (visibility only
    // — audits are NOT hard-capped, so paying customers are never cut off).
    try {
      const auditCostCents = Number(process.env["AUDIT_COST_CENTS"] ?? 80);
      await sql`INSERT INTO api_spend (op, est_cost_cents) VALUES ('audit', ${auditCostCents})`;
    } catch (err) {
      logger.warn("audit_spend_record_failed", { message: (err as Error).message });
    }

    logger.info("audit_completed", {
      audit_id,
      overall: score.overall,
      providers_used: providersUsed.length,
      blocked: result.blockedProviders.length,
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
