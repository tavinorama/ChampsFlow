/**
 * C1 — GEO Audit Engine — Audit API routes (Ozvor)
 *
 * Routes (architecture §5 API contracts; brand-package product modules):
 *   POST /api/brands                      — create a brand profile (Owner/Editor)
 *   POST /api/brands/:id/audit            — trigger an AI Visibility Audit (Owner/Editor)
 *   GET  /api/audits/:id                  — fetch audit status + scores (all roles)
 *   GET  /api/brands/:id/score            — latest Ozvor AI Visibility Score + trend (all roles)
 *   GET  /api/reports/:report_token       — PUBLIC shareable audit report (no auth)
 *
 * The audit run itself is executed by the worker (apps/worker/jobs/audit-run.ts):
 *  - probe fan-out across permitted providers (routing gate: EU excludes Perplexity)
 *  - citation parsing, scoring, geo_score + citation_check writes
 *  - ai_generation_log append per AI inference (GEO-A6)
 * This route only enqueues the job and reads results — no LLM calls here.
 *
 * Hard rules:
 *  - tenant_id resolved from JWT only — never from request body
 *  - All DB queries parameterized — no string interpolation
 *  - ai_generation_log / audit_log: INSERT only (append-only)
 *  - No PII in logs
 *  - Public report route enforces report_token AND expiry; never leaks other tenants
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { requireAuth, requireRole } from "../auth/middleware";
import { requireNotRestricted } from "./billing";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { generateStrategy, type StrategyInputs } from "../../../../packages/llm/src/index";
import { generateContent, type ContentType } from "../../../../packages/llm/src/index";
import { PLAN_LIMITS, type PlanTier } from "../integrations/stripe";
import { resolveProviderKey } from "./system";

// ---------------------------------------------------------------------------
// topSources helper — aggregates citation URLs from evidence rows and offsite
// source entries into a ranked list of domains. Used by both the breakdown
// endpoint and the export endpoint.
// ---------------------------------------------------------------------------

const DOMAIN_LABELS: Record<string, string> = {
  "reddit.com": "Reddit",
  "en.wikipedia.org": "Wikipedia",
  "wikipedia.org": "Wikipedia",
  "linkedin.com": "LinkedIn",
  "g2.com": "G2",
  "trustpilot.com": "Trustpilot",
  "crunchbase.com": "Crunchbase",
  "youtube.com": "YouTube",
  "github.com": "GitHub",
  "twitter.com": "X (Twitter)",
  "x.com": "X (Twitter)",
  "forbes.com": "Forbes",
  "techcrunch.com": "TechCrunch",
  "capterra.com": "Capterra",
  "producthunt.com": "Product Hunt",
};

interface TopSource {
  domain: string;
  label: string;
  type: "UGC" | "Review" | "Social" | "Reference" | "News" | "Web" | "You";
  usedPct: number;      // 0-100 rounded integer: % of total probes citing this domain
  avgCitations: number; // 1-decimal: avg occurrences per citing probe
  isYou: boolean;
}

interface OffsiteSource {
  id: string;
  label: string;
  domain: string;
  present: boolean;
  count: number;
}

/**
 * Deterministic source type classifier. Identifies the brand's own domain as
 * "You"; classifies third-party domains by category. Pure function — no I/O.
 */
function classifySourceType(domain: string, brandDomain: string | null): TopSource["type"] {
  if (brandDomain) {
    const clean = domain.replace(/^www\./, "");
    const cleanBrand = brandDomain.replace(/^www\./, "");
    if (
      clean === cleanBrand ||
      clean.endsWith(`.${cleanBrand}`) ||
      cleanBrand.endsWith(`.${clean}`)
    ) {
      return "You";
    }
  }
  // UGC
  if (
    ["reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com", "superuser.com", "askubuntu.com"].some(
      (d) => domain.includes(d)
    )
  )
    return "UGC";
  // Review
  if (
    ["g2.com", "capterra.com", "trustpilot.com", "getapp.com", "softwareadvice.com", "gartner.com", "trustradius.com"].some(
      (d) => domain.includes(d)
    )
  )
    return "Review";
  // Social
  if (
    ["linkedin.com", "twitter.com", "x.com", "youtube.com", "facebook.com", "instagram.com", "tiktok.com"].some(
      (d) => domain.includes(d)
    )
  )
    return "Social";
  // Reference
  if (
    ["wikipedia.org", "wikidata.org", "crunchbase.com", "dnb.com", "bloomberg.com", "pitchbook.com"].some(
      (d) => domain.includes(d)
    )
  )
    return "Reference";
  // News
  if (
    [
      "nytimes.com", "forbes.com", "techcrunch.com", "theverge.com", "wired.com",
      "businessinsider.com", "reuters.com", "apnews.com", "washingtonpost.com",
      "ft.com", "wsj.com", "cnbc.com", "bbc.com", "guardian.com", "cnn.com", "thenextweb.com",
    ].some((d) => domain.includes(d))
  )
    return "News";
  return "Web";
}

function computeTopSources(
  evidenceRows: Array<{ sources: unknown }>,
  providerBreakdown: Record<string, unknown>,
  brandDomain: string | null   // to identify "You" rows
): TopSource[] {
  const totalProbes = evidenceRows.length || 1;

  // Two maps: total citation count and count of distinct probes that cite this domain
  const domainCitations = new Map<string, number>();
  const domainProbeCiting = new Map<string, number>();

  // 1. Count domains from raw citation URLs in evidence[].sources
  for (const row of evidenceRows) {
    const sources = Array.isArray(row.sources) ? (row.sources as unknown[]) : [];
    // Track unique domains in THIS probe for domainProbeCiting
    const probeUniqueDomains = new Set<string>();
    for (const src of sources) {
      if (typeof src !== "string") continue;
      try {
        const hostname = new URL(src).hostname.replace(/^www\./, "");
        // Total citation count (raw occurrences)
        domainCitations.set(hostname, (domainCitations.get(hostname) ?? 0) + 1);
        probeUniqueDomains.add(hostname);
      } catch {
        // skip malformed URLs
      }
    }
    // Increment probe-citing count for each unique domain seen in this probe
    for (const hostname of probeUniqueDomains) {
      domainProbeCiting.set(hostname, (domainProbeCiting.get(hostname) ?? 0) + 1);
    }
  }

  // 2. Merge with offsite.sources (domain + label + count from provider_breakdown)
  const offsiteSources: OffsiteSource[] =
    (providerBreakdown as { offsite?: { sources?: OffsiteSource[] } }).offsite?.sources ?? [];

  for (const os of offsiteSources) {
    // Skip zero-count entries (present === false and count === 0)
    if (!os.count || os.count === 0) continue;
    const domain = (os.domain ?? "").replace(/^www\./, "");
    if (!domain) continue;
    domainCitations.set(domain, (domainCitations.get(domain) ?? 0) + os.count);
    // If present=true treat as 1 probe citing it (best we can do without per-probe data)
    if (os.present) {
      domainProbeCiting.set(domain, (domainProbeCiting.get(domain) ?? 0) + 1);
    }
  }

  // 3. Early-exit if no domains were found — prevents 100% usedPct entries on empty evidence.
  if (domainCitations.size === 0) return [];

  // 4. Build output array with enriched fields, sort descending, cap at 25
  const result: TopSource[] = [];
  for (const [domain, totalCitations] of domainCitations.entries()) {
    const probeCiting = domainProbeCiting.get(domain) ?? 0;
    const usedPct = Math.round((probeCiting / totalProbes) * 100);
    const avgCitations = +(totalCitations / (probeCiting || 1)).toFixed(1);
    const type = classifySourceType(domain, brandDomain);
    const isYou = type === "You";
    const label = DOMAIN_LABELS[domain] ?? domain;
    result.push({ domain, label, type, usedPct, avgCitations, isYou });
  }

  result.sort((a, b) => b.usedPct - a.usedPct || b.avgCitations - a.avgCitations);
  return result.slice(0, 25);
}

// ---------------------------------------------------------------------------
// CSV escaping helper — used by the export endpoint
// ---------------------------------------------------------------------------

function csvEsc(val: string | number | boolean | null | undefined): string {
  const s = String(val ?? "");
  // Prevent CSV formula injection (OWASP): prefix formula-trigger chars with '
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// ---------------------------------------------------------------------------
// extractBlockedCrawlers — parses site-crawl findings strings and extracts
// the names of known AI crawlers that are blocked in robots.txt.
// Pure function — no I/O, no side effects.
// ---------------------------------------------------------------------------

const KNOWN_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;

function extractBlockedCrawlers(findings: string[]): string[] {
  const blocked: string[] = [];
  for (const crawlerName of KNOWN_CRAWLERS) {
    for (const finding of findings) {
      if (
        finding.toLowerCase().includes("blocked") &&
        finding.toLowerCase().includes(crawlerName.toLowerCase())
      ) {
        blocked.push(crawlerName);
        break; // avoid duplicates — one finding is enough per crawler name
      }
    }
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Plan-limit helper — reads the tenant's denormalized plan_tier and returns
// its PLAN_LIMITS. Defaults to 'free' if unset/unknown. (Enforcement is by
// explicit COUNT vs limit at each create site; tenant_id filter is explicit so
// it holds regardless of RLS runtime state.)
// ---------------------------------------------------------------------------
async function planLimitsFor(db: PostgresClient, tenantId: string) {
  const res = await db.query<{ plan_tier: string | null }>(
    `SELECT plan_tier FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tier = (res.rows[0]?.plan_tier ?? "free") as PlanTier;
  return PLAN_LIMITS[tier] ?? PLAN_LIMITS.free;
}

// ---------------------------------------------------------------------------
// Audit job queue (BullMQ) — same Redis connection convention as schedules.ts
// ---------------------------------------------------------------------------

let _auditQueue: Queue | null = null;
let _ioRedis: IORedis | null = null;

function getAuditQueue(): Queue {
  if (_auditQueue) return _auditQueue;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  _ioRedis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  _ioRedis.on("error", (err: Error) => {
    logger.error("audit_queue_redis_connection_error", { message: err.message });
  });
  _auditQueue = new Queue("geo-audit", {
    connection: _ioRedis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  return _auditQueue;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REGIONS = new Set(["EU", "US"]);

async function writeAuditLog(
  db: PostgresClient,
  eventType: string,
  userId: string | null,
  tenantId: string,
  targetId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [eventType, userId, tenantId, "geo_audit", targetId, JSON.stringify(metadata)]
  );
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAuditRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/brands — create a brand profile
  // -------------------------------------------------------------------------
  app.post("/api/brands", requireAuth, requireRole(["owner", "editor"]), async (c) => {
    const auth = c.get("auth");
    const { tenantId, userId } = auth;

    let body: {
      name?: string;
      domain?: string;
      category?: string;
      market?: string;
      region?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }

    const name = (body.name ?? "").trim();
    if (!name) return c.json({ message: "Brand name is required." }, 400);

    const region = (body.region ?? "EU").toUpperCase();
    if (!VALID_REGIONS.has(region)) {
      return c.json({ message: "region must be 'EU' or 'US'." }, 400);
    }

    await db.setTenantId(tenantId);

    // Plan limit: max_brands per tenant.
    const limits = await planLimitsFor(db, tenantId);
    const brandCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM brands WHERE tenant_id = $1`,
      [tenantId]
    );
    if (parseInt(brandCount.rows[0]?.count ?? "0", 10) >= limits.max_brands) {
      return c.json(
        { message: `Your plan allows ${limits.max_brands} brand(s). Upgrade to add more.`, code: "PLAN_LIMIT_BRANDS" },
        403
      );
    }

    const id = randomUUID();
    await db.query(
      `INSERT INTO brands (id, tenant_id, name, domain, category, market, region, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        id,
        tenantId,
        name,
        body.domain ?? null,
        body.category ?? null,
        body.market ?? null,
        region,
      ]
    );

    await writeAuditLog(db, "brand_created", userId, tenantId, id, { region });
    return c.json({ id, name, region }, 201);
  });

  // -------------------------------------------------------------------------
  // Competitors — for the "who AI recommends instead of you" benchmark.
  // GET    /api/brands/:id/competitors
  // POST   /api/brands/:id/competitors   { name }
  // DELETE /api/brands/:id/competitors/:competitorId
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id/competitors", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const brandId = c.req.param("id");
    const res = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM competitor WHERE brand_id = $1 ORDER BY created_at ASC`,
      [brandId]
    );
    return c.json({ competitors: res.rows });
  });

  app.post(
    "/api/brands/:id/competitors",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const brandId = c.req.param("id");
      let body: { name?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const name = (body.name ?? "").trim();
      if (!name) return c.json({ message: "Competitor name is required." }, 400);

      await db.setTenantId(auth.tenantId);
      // Confirm the brand belongs to this tenant (RLS also enforces).
      const brandRes = await db.query<{ id: string }>(`SELECT id FROM brands WHERE id = $1`, [brandId]);
      if (!brandRes.rows[0]) return c.json({ message: "Brand not found." }, 404);

      // Plan limit: max_competitors per brand.
      const limits = await planLimitsFor(db, auth.tenantId);
      const compCount = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM competitor WHERE brand_id = $1`,
        [brandId]
      );
      if (parseInt(compCount.rows[0]?.count ?? "0", 10) >= limits.max_competitors) {
        return c.json(
          { message: `Your plan allows ${limits.max_competitors} competitors per brand. Upgrade to add more.`, code: "PLAN_LIMIT_COMPETITORS" },
          403
        );
      }

      const id = randomUUID();
      await db.query(
        `INSERT INTO competitor (id, tenant_id, brand_id, name, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (brand_id, name) DO NOTHING`,
        [id, auth.tenantId, brandId, name]
      );
      return c.json({ id, name }, 201);
    }
  );

  app.delete(
    "/api/brands/:id/competitors/:competitorId",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      await db.setTenantId(auth.tenantId);
      const competitorId = c.req.param("competitorId");
      await db.query(`DELETE FROM competitor WHERE id = $1`, [competitorId]);
      return c.json({ removed: true });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands — list this tenant's brands + latest Ozvor AI Visibility Score
  // -------------------------------------------------------------------------
  app.get("/api/brands", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const res = await db.query<{
      id: string;
      name: string;
      domain: string | null;
      category: string | null;
      region: string;
      monitoring_enabled: boolean;
      latest_score: number | null;
    }>(
      // geo_score stores the overall in provider_breakdown->>'overall' (applied
      // schema has no dedicated score_overall column on geo_score).
      `SELECT b.id, b.name, b.domain, b.category, b.region, b.monitoring_enabled,
              (s.provider_breakdown->>'overall')::int AS latest_score
         FROM brands b
         LEFT JOIN LATERAL (
           SELECT provider_breakdown
             FROM geo_score gs
            WHERE gs.brand_id = b.id
            ORDER BY gs.recorded_at DESC
            LIMIT 1
         ) s ON TRUE
        ORDER BY b.created_at DESC`,
      []
    );
    return c.json({ brands: res.rows });
  });

  // -------------------------------------------------------------------------
  // GET /api/brands/:id — fetch a single brand profile (settings included)
  // Returns tracked_models and tracking_frequency with graceful fallback if
  // the migration columns don't exist yet (42703 error → return without them).
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const brandId = c.req.param("id");

    // Attempt full query with new columns first.
    try {
      const res = await db.query<{
        id: string;
        name: string;
        domain: string | null;
        category: string | null;
        region: string;
        monitoring_enabled: boolean;
        tracked_models: unknown;
        tracking_frequency: string | null;
      }>(
        `SELECT id, name, domain, category, region, monitoring_enabled, tracked_models, tracking_frequency
           FROM brands WHERE id = $1`,
        [brandId]
      );
      const brand = res.rows[0];
      if (!brand) return c.json({ message: "Brand not found." }, 404);
      // tracked_models is already parsed by pg driver (JSONB → JS array). Return directly.
      return c.json(brand);
    } catch (err: unknown) {
      // If migration hasn't run yet (column doesn't exist), degrade gracefully.
      const pgCode = (err as { code?: string }).code;
      if (pgCode === "42703") {
        // Column missing — return brand without tracked_models / tracking_frequency
        const fallbackRes = await db.query<{
          id: string;
          name: string;
          domain: string | null;
          category: string | null;
          region: string;
          monitoring_enabled: boolean;
        }>(
          `SELECT id, name, domain, category, region, monitoring_enabled FROM brands WHERE id = $1`,
          [brandId]
        );
        const brand = fallbackRes.rows[0];
        if (!brand) return c.json({ message: "Brand not found." }, 404);
        return c.json(brand);
      }
      throw err;
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/brands/:id — update brand model tracking settings
  // Body: { tracked_models?: string[], tracking_frequency?: "weekly"|"daily" }
  // "daily" requires Agency plan.
  // -------------------------------------------------------------------------
  app.patch(
    "/api/brands/:id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      let body: { tracked_models?: unknown; tracking_frequency?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      const SUPPORTED_MODELS = new Set(["openai", "anthropic", "perplexity", "gemini", "serp"]);

      // Validate tracked_models (if provided)
      let trackedModels: string[] | undefined;
      if (body.tracked_models !== undefined) {
        if (!Array.isArray(body.tracked_models)) {
          return c.json({ message: "tracked_models must be an array." }, 400);
        }
        if ((body.tracked_models as unknown[]).length === 0) {
          return c.json({ message: "tracked_models must have at least one element." }, 400);
        }
        const unknownKeys = (body.tracked_models as unknown[]).filter(
          (m) => typeof m !== "string" || !SUPPORTED_MODELS.has(m)
        );
        if (unknownKeys.length > 0) {
          return c.json(
            {
              message: `Unknown model(s): ${unknownKeys.map(String).slice(0, 5).join(", ").slice(0, 200)}. Allowed values: openai, anthropic, perplexity, gemini, serp.`,
            },
            400
          );
        }
        trackedModels = body.tracked_models as string[];
      }

      await db.setTenantId(tenantId);

      // Validate tracking_frequency (if provided)
      let trackingFrequency: string | undefined;
      if (body.tracking_frequency !== undefined) {
        if (body.tracking_frequency !== "weekly" && body.tracking_frequency !== "daily") {
          return c.json({ message: "tracking_frequency must be 'weekly' or 'daily'." }, 400);
        }
        if (body.tracking_frequency === "daily") {
          // Agency plan only — check tenant's plan tier
          const tierRes = await db.query<{ plan_tier: string | null }>(
            `SELECT plan_tier FROM tenants WHERE id = $1`,
            [tenantId]
          );
          const planTier = tierRes.rows[0]?.plan_tier ?? "free";
          if (planTier !== "agency") {
            return c.json(
              {
                message:
                  "Daily tracking is an Agency-plan feature. Upgrade to Agency to enable daily monitoring.",
                code: "PLAN_LIMIT_DAILY",
              },
              403
            );
          }
        }
        trackingFrequency = body.tracking_frequency as string;
      }

      // At least one field must be provided
      if (trackedModels === undefined && trackingFrequency === undefined) {
        return c.json(
          { message: "At least one of tracked_models or tracking_frequency must be provided." },
          400
        );
      }

      // Confirm brand exists and belongs to this tenant (RLS also enforces)
      const brandCheck = await db.query<{ id: string }>(
        `SELECT id FROM brands WHERE id = $1`,
        [brandId]
      );
      if (!brandCheck.rows[0]) return c.json({ message: "Brand not found." }, 404);

      // Build a dynamic UPDATE with only provided fields
      try {
        let updatedTrackedModels: unknown = null;
        let updatedFrequency: string | null = null;

        if (trackedModels !== undefined && trackingFrequency !== undefined) {
          const res = await db.query<{ id: string; tracked_models: unknown; tracking_frequency: string }>(
            `UPDATE brands
                SET tracked_models = $2, tracking_frequency = $3, updated_at = NOW()
              WHERE id = $1
           RETURNING id, tracked_models, tracking_frequency`,
            [brandId, JSON.stringify(trackedModels), trackingFrequency]
          );
          const row = res.rows[0];
          updatedTrackedModels = row.tracked_models;
          updatedFrequency = row.tracking_frequency;
        } else if (trackedModels !== undefined) {
          const res = await db.query<{ id: string; tracked_models: unknown; tracking_frequency: string }>(
            `UPDATE brands
                SET tracked_models = $2, updated_at = NOW()
              WHERE id = $1
           RETURNING id, tracked_models, tracking_frequency`,
            [brandId, JSON.stringify(trackedModels)]
          );
          const row = res.rows[0];
          updatedTrackedModels = row.tracked_models;
          updatedFrequency = row.tracking_frequency;
        } else {
          // trackingFrequency only
          const res = await db.query<{ id: string; tracked_models: unknown; tracking_frequency: string }>(
            `UPDATE brands
                SET tracking_frequency = $2, updated_at = NOW()
              WHERE id = $1
           RETURNING id, tracked_models, tracking_frequency`,
            [brandId, trackingFrequency!]
          );
          const row = res.rows[0];
          updatedTrackedModels = row.tracked_models;
          updatedFrequency = row.tracking_frequency;
        }

        return c.json({ id: brandId, tracked_models: updatedTrackedModels, tracking_frequency: updatedFrequency });
      } catch (err: unknown) {
        const pgCode = (err as { code?: string }).code;
        if (pgCode === "42703") {
          // Column not yet present — migration pending
          return c.json(
            { message: "Settings schema is being migrated. Please try again in a moment." },
            503
          );
        }
        throw err;
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/audit — trigger an AI Visibility Audit
  // -------------------------------------------------------------------------
  app.post(
    "/api/brands/:id/audit",
    requireAuth,
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId, userId } = auth;
      const brandId = c.req.param("id");

      await db.setTenantId(tenantId);

      // Confirm the brand exists and belongs to this tenant (RLS also enforces).
      const brandRes = await db.query<{ id: string; region: string }>(
        `SELECT id, region FROM brands WHERE id = $1`,
        [brandId]
      );
      const brand = brandRes.rows[0];
      if (!brand) return c.json({ message: "Brand not found." }, 404);

      // Create the audit row in 'pending' state.
      const auditId = randomUUID();
      await db.query(
        `INSERT INTO geo_audit (id, tenant_id, brand_id, triggered_by, status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW())`,
        [auditId, tenantId, brandId, "paid"]
      );

      // Enqueue the worker job (no LLM work in the request path).
      try {
        const queue = getAuditQueue();
        await queue.add(
          "run-audit",
          { audit_id: auditId, tenant_id: tenantId, brand_id: brandId, region: brand.region },
          { jobId: auditId }
        );
      } catch (err) {
        // If enqueue fails, mark the audit failed so it isn't stuck pending.
        await db.query(`UPDATE geo_audit SET status = 'failed' WHERE id = $1`, [auditId]);
        logger.error("audit_enqueue_failed", { tenantId, auditId });
        return c.json({ message: "Could not start the audit. Please try again." }, 503);
      }

      await writeAuditLog(db, "audit_triggered", userId, tenantId, auditId, { brandId });
      return c.json({ audit_id: auditId, status: "pending" }, 202);
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/monitoring — enable/disable weekly monitoring (flywheel)
  // Body: { enabled: boolean }
  // Adds/removes a BullMQ repeatable job that re-runs the audit weekly.
  // -------------------------------------------------------------------------
  app.post(
    "/api/brands/:id/monitoring",
    requireAuth,
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId, userId } = auth;
      const brandId = c.req.param("id");

      let body: { enabled?: boolean };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const enabled = body.enabled === true;

      await db.setTenantId(tenantId);
      const brandRes = await db.query<{ id: string; region: string }>(
        `SELECT id, region FROM brands WHERE id = $1`,
        [brandId]
      );
      const brand = brandRes.rows[0];
      if (!brand) return c.json({ message: "Brand not found." }, 404);

      // Persist the flag.
      await db.query(`UPDATE brands SET monitoring_enabled = $2 WHERE id = $1`, [
        brandId,
        enabled,
      ]);

      // Manage the repeatable BullMQ job. jobId is stable per brand so toggling
      // on twice does not create duplicates; toggling off removes it.
      const queue = getAuditQueue();
      const repeatJobId = `monitor:${brandId}`;
      try {
        if (enabled) {
          await queue.add(
            "scheduled-audit",
            { tenant_id: tenantId, brand_id: brandId, region: brand.region },
            {
              jobId: repeatJobId,
              repeat: { pattern: "0 6 * * 1" }, // every Monday 06:00 UTC
            }
          );
        } else {
          // Remove the repeatable schedule.
          const repeatables = await queue.getRepeatableJobs();
          for (const r of repeatables) {
            if (r.id === repeatJobId || r.name === "scheduled-audit") {
              if (r.id === repeatJobId) await queue.removeRepeatableByKey(r.key);
            }
          }
        }
      } catch (err) {
        logger.error("monitoring_toggle_failed", { tenantId, brandId, enabled });
        return c.json({ message: "Could not update monitoring. Please try again." }, 503);
      }

      await writeAuditLog(db, "monitoring_toggled", userId, tenantId, brandId ?? null, { enabled });
      return c.json({ brand_id: brandId, monitoring_enabled: enabled });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/audits/:id — fetch audit status + scores
  // -------------------------------------------------------------------------
  app.get("/api/audits/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const auditId = c.req.param("id");

    const res = await db.query<{
      id: string;
      brand_id: string;
      status: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      providers_used: unknown;
      report_token: string;
      created_at: string;
    }>(
      `SELECT id, brand_id, status, score_brand, score_performance, score_ai,
              providers_used, report_token, created_at
         FROM geo_audit WHERE id = $1`,
      [auditId]
    );
    const audit = res.rows[0];
    if (!audit) return c.json({ message: "Audit not found." }, 404);
    return c.json(audit);
  });

  // -------------------------------------------------------------------------
  // GET /api/audits/:id/breakdown — deep explainability for the 3 vectors
  // Returns: the score components (with measured-vs-baseline labels) + the
  // per-prompt AI evidence (which prompt, which engine, cited?, position,
  // which sources) so the UI can answer "why 80 on AI?".
  // -------------------------------------------------------------------------
  app.get("/api/audits/:id/breakdown", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const auditId = c.req.param("id");

    // Score row holds the component inputs + measured/baseline labels.
    const scoreRes = await db.query<{
      score_brand: number;
      score_performance: number;
      score_ai: number;
      provider_breakdown: unknown;
    }>(
      `SELECT score_brand, score_performance, score_ai, provider_breakdown
         FROM geo_score WHERE audit_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [auditId]
    );
    const scoreRow = scoreRes.rows[0];

    // Per-prompt evidence: each probe (prompt × engine) with cited/position/sources.
    const evidenceRes = await db.query<{
      provider: string;
      query_text: string | null;
      cited: boolean;
      citation_rank: number | null;
      sources: unknown;
    }>(
      `SELECT provider, query_text, cited, citation_rank, sources
         FROM citation_check
        WHERE audit_id = $1
        ORDER BY cited DESC, provider ASC`,
      [auditId]
    );

    // provider_breakdown may be a jsonb object (already parsed by pg driver).
    const bd = (scoreRow?.provider_breakdown ?? {}) as Record<string, unknown>;

    // Load brand domain for "You" classification in key sources
    const auditBrandRes = await db.query<{ brand_id: string }>(
      `SELECT brand_id FROM geo_audit WHERE id = $1`,
      [auditId]
    );
    const auditBrandId = auditBrandRes.rows[0]?.brand_id ?? null;
    let brandDomainForSources: string | null = null;
    if (auditBrandId) {
      const bdRes = await db.query<{ domain: string | null }>(
        `SELECT domain FROM brands WHERE id = $1`,
        [auditBrandId]
      );
      brandDomainForSources = bdRes.rows[0]?.domain ?? null;
    }

    // Compute top cited sources — pure aggregation, no extra DB query.
    const topSources = computeTopSources(evidenceRes.rows, bd, brandDomainForSources);

    return c.json({
      scores: scoreRow
        ? {
            brand: scoreRow.score_brand,
            performance: scoreRow.score_performance,
            ai: scoreRow.score_ai,
            overall: (bd as { overall?: number }).overall ?? null,
          }
        : null,
      // The raw input vectors + which inputs are real vs placeholder.
      components: (bd as { inputs?: unknown }).inputs ?? null,
      measured: (bd as { measured?: unknown }).measured ?? null,
      baseline: (bd as { baseline?: unknown }).baseline ?? null,
      probes_total: (bd as { probesTotal?: number }).probesTotal ?? evidenceRes.rows.length,
      probes_cited: (bd as { probesCited?: number }).probesCited ?? null,
      // Site-crawl evidence shown under Brand/Performance.
      site_crawl: (bd as { siteCrawl?: unknown }).siteCrawl ?? null,
      // Competitor benchmark — who AI recommends instead of you (ranked).
      competitors: (bd as { competitors?: unknown }).competitors ?? [],
      // Off-site signal — presence on Reddit/Wikipedia/G2/etc. (shown under Brand).
      offsite: (bd as { offsite?: unknown }).offsite ?? null,
      // Content citation-worthiness (Princeton traits, shown under Performance).
      content: (bd as { content?: unknown }).content ?? null,
      // Sentiment — how the brand is portrayed in answers (shown under AI vector).
      sentiment: (bd as { sentiment?: unknown }).sentiment ?? null,
      // Reddit deep-dive (C5) + entity graph (C7) — shown under the Brand vector.
      reddit: (bd as { reddit?: unknown }).reddit ?? null,
      entity: (bd as { entity?: unknown }).entity ?? null,
      // The actual evidence — what the UI shows under the AI vector.
      evidence: evidenceRes.rows.map((r) => ({
        engine: r.provider,
        prompt: r.query_text,
        cited: r.cited,
        position: r.citation_rank,
        sources: Array.isArray(r.sources) ? r.sources : [],
      })),
      // Aggregated top citation domains (max 25, sorted by frequency).
      topSources,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/audits/:id/export?format=csv — download audit data as a file
  // Supports format=csv only for now; xlsx/json can be added via the switch.
  // -------------------------------------------------------------------------
  app.get("/api/audits/:id/export", requireAuth, async (c) => {
    const auth = c.get("auth");
    const auditId = c.req.param("id");
    const format = c.req.query("format");

    // Validate format before doing any DB work.
    switch (format) {
      case "csv":
        break;
      default:
        return c.json({ message: "Unsupported format. Use ?format=csv" }, 400);
    }

    await db.setTenantId(auth.tenantId);

    // Auth + ownership check — same pattern as breakdown endpoint.
    const auditRes = await db.query<{ brand_id: string; status: string }>(
      `SELECT brand_id, status FROM geo_audit WHERE id = $1`,
      [auditId]
    );
    const audit = auditRes.rows[0];
    if (!audit) return c.json({ message: "Audit not found." }, 404);

    // Fetch the brand name and domain for the filename and "You" classification.
    const brandRes = await db.query<{ name: string; domain: string | null }>(
      `SELECT name, domain FROM brands WHERE id = $1`,
      [audit.brand_id]
    );
    const brandName = brandRes.rows[0]?.name ?? "brand";
    const brandDomainForExport = brandRes.rows[0]?.domain ?? null;

    // Load scores + provider_breakdown.
    const scoreRes = await db.query<{
      score_brand: number;
      score_performance: number;
      score_ai: number;
      provider_breakdown: unknown;
      recorded_at: string;
    }>(
      `SELECT score_brand, score_performance, score_ai, provider_breakdown, recorded_at
         FROM geo_score WHERE audit_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [auditId]
    );
    const scoreRow = scoreRes.rows[0];

    // Load citation evidence rows.
    const evidenceRes = await db.query<{
      provider: string;
      query_text: string | null;
      cited: boolean;
      citation_rank: number | null;
      sources: unknown;
    }>(
      `SELECT provider, query_text, cited, citation_rank, sources
         FROM citation_check
        WHERE audit_id = $1
        ORDER BY cited DESC, provider ASC`,
      [auditId]
    );

    // Sanitise brand name for the filename.
    const sanitized = brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const safeBase = sanitized || "audit";
    const dateStr = scoreRow?.recorded_at
      ? scoreRow.recorded_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const safeFilename = `trustindex-${safeBase}-${dateStr}.csv`;

    if (format === "csv") {
      const bd = (scoreRow?.provider_breakdown ?? {}) as Record<string, unknown>;
      const overall = (bd as { overall?: number }).overall ?? null;

      const lines: string[] = [];

      // Section 1 — Summary header
      lines.push("Ozvor Audit Export");
      lines.push(`Brand,${csvEsc(brandName)}`);
      lines.push(`Date,${csvEsc(dateStr)}`);
      lines.push(`Overall Score,${csvEsc(overall)}`);
      lines.push(`Brand Score,${csvEsc(scoreRow?.score_brand ?? "")}`);
      lines.push(`Performance Score,${csvEsc(scoreRow?.score_performance ?? "")}`);
      lines.push(`AI Score,${csvEsc(scoreRow?.score_ai ?? "")}`);
      lines.push("");

      // Section 2 — Per-engine evidence
      lines.push("AI Evidence");
      lines.push("Engine,Prompt,Cited,Position");
      for (const row of evidenceRes.rows) {
        lines.push(
          [
            csvEsc(row.provider),
            csvEsc(row.query_text),
            csvEsc(row.cited),
            csvEsc(row.citation_rank),
          ].join(",")
        );
      }
      lines.push("");

      // Section 3 — Competitor benchmark
      lines.push("Competitor Benchmark");
      lines.push("Name,Mentions,Displacement");
      const competitors = (bd as { competitors?: Array<{ name?: string; mentions?: number; displacement?: number }> }).competitors ?? [];
      for (const comp of competitors) {
        lines.push(
          [
            csvEsc(comp.name),
            csvEsc(comp.mentions),
            csvEsc(comp.displacement),
          ].join(",")
        );
      }
      lines.push("");

      // Section 4 — Top cited sources (reuse helper — no extra DB query)
      const topSources = computeTopSources(evidenceRes.rows, bd, brandDomainForExport);
      lines.push("Top Cited Sources");
      lines.push("Domain,Label,Type,Used %,Avg Citations,Is You");
      for (const src of topSources) {
        lines.push(
          [
            csvEsc(src.domain),
            csvEsc(src.label),
            csvEsc(src.type),
            csvEsc(src.usedPct),
            csvEsc(src.avgCitations),
            csvEsc(src.isYou),
          ].join(",")
        );
      }

      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      );
      return c.text(lines.join("\r\n"));
    }

    // Unreachable — switch above already guards; satisfies TypeScript control flow.
    return c.json({ message: "Unsupported format. Use ?format=csv" }, 400);
  });

  // -------------------------------------------------------------------------
  // POST /api/audits/:id/plan — generate a GEO Content Plan from the audit (C3)
  // Reads the audit's breakdown, runs the deterministic strategy generator,
  // stores the plan + tasks (all proposed/draft). Idempotent-ish: creates a new
  // plan each call. Returns the plan with tasks.
  // -------------------------------------------------------------------------
  app.post(
    "/api/audits/:id/plan",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      await db.setTenantId(auth.tenantId);
      const auditId = c.req.param("id");

      // Load the audit + its score breakdown.
      const auditRes = await db.query<{ brand_id: string; status: string }>(
        `SELECT brand_id, status FROM geo_audit WHERE id = $1`,
        [auditId]
      );
      const audit = auditRes.rows[0];
      if (!audit) return c.json({ message: "Audit not found." }, 404);
      if (audit.status !== "complete") return c.json({ message: "Audit not complete yet." }, 409);

      const scoreRes = await db.query<{
        score_brand: number; score_performance: number; score_ai: number; provider_breakdown: unknown;
      }>(
        `SELECT score_brand, score_performance, score_ai, provider_breakdown
           FROM geo_score WHERE audit_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [auditId]
      );
      const sr = scoreRes.rows[0];
      const bd = (sr?.provider_breakdown ?? {}) as Record<string, unknown>;

      // Fetch absent prompts (verbatim query text where brand was NOT cited, capped at 5).
      const absentPromptsRes = await db.query<{ query_text: string }>(
        `SELECT DISTINCT query_text FROM citation_check
          WHERE audit_id = $1 AND cited = false AND query_text IS NOT NULL
          LIMIT 5`,
        [auditId]
      );

      // Fetch providers that did not cite the brand.
      const absentEngineRes = await db.query<{ provider: string }>(
        `SELECT DISTINCT provider FROM citation_check
          WHERE audit_id = $1 AND cited = false
          LIMIT 20`,
        [auditId]
      );

      // Parse blocked crawlers from site-crawl findings in provider_breakdown.
      const siteCrawlFindings = (
        (bd as { siteCrawl?: { findings?: unknown } }).siteCrawl?.findings
      );
      const findingsArr = Array.isArray(siteCrawlFindings)
        ? (siteCrawlFindings as unknown[]).filter((f): f is string => typeof f === "string")
        : [];
      const blockedCrawlers = extractBlockedCrawlers(findingsArr);

      // Parse missing off-site sources from provider_breakdown.
      type OffsiteSourceEntry = { label?: string; present?: boolean };
      const offsiteSourcesRaw = (
        (bd as { offsite?: { sources?: OffsiteSourceEntry[] } }).offsite?.sources ?? []
      );
      const missingSources = offsiteSourcesRaw
        .filter((s) => s.present === false && typeof s.label === "string")
        .map((s) => s.label as string);

      const inputs: StrategyInputs = {
        scores: {
          brand: sr?.score_brand ?? 50,
          performance: sr?.score_performance ?? 50,
          ai: sr?.score_ai ?? 50,
          overall: (bd as { overall?: number }).overall ?? null,
        },
        components: (bd as { inputs?: StrategyInputs["components"] }).inputs ?? null,
        offsiteSources: (bd as { offsite?: { sources?: Array<{ label: string; present: boolean }> } }).offsite?.sources,
        contentTraits: (bd as { content?: { traits?: Record<string, number> } }).content?.traits ?? null,
        displacedByCompetitors: ((bd as { competitors?: Array<{ displacement: number }> }).competitors ?? [])
          .filter((x) => x.displacement > 0).length,
        absentPrompts: absentPromptsRes.rows.map((r) => r.query_text).filter(Boolean),
        absentEngines: absentEngineRes.rows.map((r) => r.provider).filter(Boolean),
        missingSources,
        blockedCrawlers,
      };

      const plan = generateStrategy(inputs);

      const planId = randomUUID();
      await db.query(
        `INSERT INTO strategy_plan (id, tenant_id, brand_id, audit_id, calendar, generated_by, created_at)
         VALUES ($1, $2, $3, $4, $5, 'rules', NOW())`,
        [planId, auth.tenantId, audit.brand_id, auditId, JSON.stringify(plan.calendar)]
      );
      for (const r of plan.recommendations) {
        await db.query(
          `INSERT INTO plan_task (tenant_id, plan_id, vector, gap, action, effort, impact, priority, evidence, metric, owner, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'proposed', NOW())`,
          [auth.tenantId, planId, r.vector, r.gap, r.action, r.effort, r.impact, r.priority, r.evidence ?? null, r.metric ?? null, r.owner ?? "you"]
        );
      }

      return c.json({ plan_id: planId, recommendations: plan.recommendations.length, calendar: plan.calendar }, 201);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/plan — latest plan + its tasks
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id/plan", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const brandId = c.req.param("id");

    const planRes = await db.query<{ id: string; calendar: unknown; created_at: string }>(
      `SELECT id, calendar, created_at FROM strategy_plan
        WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [brandId]
    );
    const plan = planRes.rows[0];
    if (!plan) return c.json({ plan: null, tasks: [] });

    const taskRes = await db.query<{
      id: string; vector: string; gap: string; action: string;
      effort: string; impact: string; priority: number; status: string;
      evidence: string | null; metric: string | null; owner: string;
    }>(
      `SELECT id, vector, gap, action, effort, impact, priority, status, evidence, metric, owner
         FROM plan_task WHERE plan_id = $1 ORDER BY priority DESC`,
      [plan.id]
    );

    // calendar may come back as a JSON string (jsonb stored from a stringified
    // value) or already-parsed — normalise to an array either way.
    let calendar: unknown = plan.calendar;
    if (typeof calendar === "string") {
      try { calendar = JSON.parse(calendar); } catch { calendar = []; }
    }
    return c.json({
      plan: { id: plan.id, calendar, created_at: plan.created_at },
      tasks: taskRes.rows,
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/plan-tasks/:id — accept / reject / mark done a recommendation
  // -------------------------------------------------------------------------
  app.patch(
    "/api/plan-tasks/:id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const taskId = c.req.param("id");
      let body: { status?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const status = body.status ?? "";
      if (!["proposed", "accepted", "rejected", "done"].includes(status)) {
        return c.json({ message: "status must be proposed|accepted|rejected|done." }, 400);
      }
      await db.setTenantId(auth.tenantId);
      const result = await db.query<{ id: string }>(
        `UPDATE plan_task SET status = $2 WHERE id = $1 AND tenant_id = $3 RETURNING id`,
        [taskId, status, auth.tenantId]
      );
      if (result.rows.length === 0) {
        return c.json({ message: "Task not found." }, 404);
      }
      return c.json({ id: taskId, status });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/content — generate a content draft (C4)
  // Body: { content_type: 'blog'|'linkedin'|'faq', topic, plan_task_id?, source_url? }
  // -------------------------------------------------------------------------
  app.post(
    "/api/brands/:id/content",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const brandId = c.req.param("id");
      let body: { content_type?: string; topic?: string; plan_task_id?: string; source_url?: string; instructions?: string; tone?: string; length?: string; };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const ct = body.content_type ?? "";
      if (!["blog", "linkedin", "faq"].includes(ct)) {
        return c.json({ message: "content_type must be blog|linkedin|faq." }, 400);
      }
      const topic = (body.topic ?? "").trim();
      if (!topic) return c.json({ message: "topic is required." }, 400);

      await db.setTenantId(auth.tenantId);
      const brandRes = await db.query<{ name: string; category: string | null }>(
        `SELECT name, category FROM brands WHERE id = $1`,
        [brandId]
      );
      const brand = brandRes.rows[0];
      if (!brand) return c.json({ message: "Brand not found." }, 404);

      // BYOK cost model: client-internal content generation runs on the CLIENT's
      // own Anthropic key when connected (they pay their AI cost); falls back to
      // the platform key otherwise. The free audit/test always uses platform.
      const clientKey = await resolveProviderKey(db, auth.tenantId, "anthropic");
      const draft = await generateContent(
        {
          contentType: ct as ContentType,
          brandName: brand.name,
          category: brand.category,
          topic,
          sourceUrl: body.source_url ?? null,
          instructions: body.instructions ? body.instructions.slice(0, 500) : undefined,
          tone: body.tone ? body.tone.slice(0, 50) : undefined,
          length: (["short", "medium", "long"] as const).includes(body.length as "short" | "medium" | "long")
            ? (body.length as "short" | "medium" | "long")
            : undefined,
        },
        { apiKey: clientKey ?? undefined }
      );

      const id = randomUUID();
      await db.query(
        `INSERT INTO content_piece
           (id, tenant_id, brand_id, plan_task_id, content_type, title, body, schema_markup,
            ai_generated, status, generated_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, TRUE, 'draft', $9, NOW())`,
        [id, auth.tenantId, brandId, body.plan_task_id ?? null, ct, draft.title, draft.body, draft.schemaMarkup, draft.generatedBy]
      );
      return c.json({ id, ...draft, ai_generated: true, status: "draft" }, 201);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/content — list content drafts/history
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id/content", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const brandId = c.req.param("id");
    const res = await db.query<{
      id: string; content_type: string; title: string | null; body: string;
      schema_markup: string | null; ai_generated: boolean; status: string; created_at: string;
    }>(
      `SELECT id, content_type, title, body, schema_markup, ai_generated, status, created_at
         FROM content_piece WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [brandId]
    );
    return c.json({ content: res.rows });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/content/:id — approve / discard (AC-C4-4/5: logged w/ user)
  // -------------------------------------------------------------------------
  app.patch(
    "/api/content/:id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const contentId = c.req.param("id");
      let body: { status?: string; body?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      await db.setTenantId(auth.tenantId);

      // Allow inline edit of the body (client refines the draft) + status change.
      if (typeof body.body === "string") {
        await db.query(`UPDATE content_piece SET body = $2 WHERE id = $1`, [contentId, body.body]);
      }
      const status = body.status;
      if (status) {
        if (!["draft", "approved", "published", "discarded"].includes(status)) {
          return c.json({ message: "Invalid status." }, 400);
        }
        if (status === "approved" || status === "published") {
          await db.query(
            `UPDATE content_piece SET status = $2, approved_at = NOW(), approved_by = $3 WHERE id = $1`,
            [contentId, status, auth.userId]
          );
        } else {
          await db.query(`UPDATE content_piece SET status = $2 WHERE id = $1`, [contentId, status]);
        }
      }
      return c.json({ id: contentId, status: status ?? "draft" });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/brands/:id/score — latest Ozvor AI Visibility Score + 90-day trend
  // -------------------------------------------------------------------------
  app.get("/api/brands/:id/score", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const brandId = c.req.param("id");

    const trend = await db.query<{
      recorded_at: string;
      audit_id: string | null;
      score_brand: number;
      score_performance: number;
      score_ai: number;
      score_overall: number | null;
    }>(
      // geo_score has no score_overall column — derive it from provider_breakdown.
      `SELECT recorded_at, audit_id, score_brand, score_performance, score_ai,
              (provider_breakdown->>'overall')::int AS score_overall
         FROM geo_score
        WHERE brand_id = $1
        ORDER BY recorded_at DESC
        LIMIT 90`,
      [brandId]
    );

    const latest = trend.rows[0] ?? null;
    return c.json({ brand_id: brandId, latest, trend: trend.rows });
  });

  // -------------------------------------------------------------------------
  // GET /api/reports/:report_token — PUBLIC shareable report (no auth)
  // The token is an unguessable UUID; expiry enforced. RLS is bypassed here
  // by design for the public report, so we scope strictly by token + expiry
  // and return only non-sensitive aggregate fields.
  // -------------------------------------------------------------------------
  app.get("/api/reports/:report_token", async (c) => {
    const token = c.req.param("report_token");

    // Public read: a dedicated query that does NOT set a tenant context and
    // matches only on the unguessable token, with expiry check.
    const res = await db.query<{
      status: string;
      score_brand: number | null;
      score_performance: number | null;
      score_ai: number | null;
      created_at: string;
      report_expires_at: string | null;
    }>(
      `SELECT status, score_brand, score_performance, score_ai,
              created_at, report_expires_at
         FROM geo_audit
        WHERE report_token = $1
          AND status = 'complete'
          AND (report_expires_at IS NULL OR report_expires_at > NOW())`,
      [token]
    );
    const report = res.rows[0];
    if (!report) return c.json({ message: "Report not found or expired." }, 404);

    // Derive overall from the three vectors (30/35/35 weights) — geo_audit
    // has no dedicated overall column in the applied schema.
    const overall =
      report.score_brand != null && report.score_performance != null && report.score_ai != null
        ? Math.round(
            report.score_brand * 0.3 +
              report.score_performance * 0.35 +
              report.score_ai * 0.35
          )
        : null;

    // Only aggregate scores are exposed publicly — no tenant identifiers,
    // no competitor names, no raw probe text.
    return c.json({
      trustindex_score: overall,
      vectors: {
        brand: report.score_brand,
        performance: report.score_performance,
        ai: report.score_ai,
      },
      generated_at: report.created_at,
    });
  });
}
