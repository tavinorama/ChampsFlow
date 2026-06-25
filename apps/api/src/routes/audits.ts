/**
 * C1 — GEO Audit Engine — Audit API routes (TrustIndex AI)
 *
 * Routes (architecture §5 API contracts; brand-package product modules):
 *   POST /api/brands                      — create a brand profile (Owner/Editor)
 *   POST /api/brands/:id/audit            — trigger an AI Visibility Audit (Owner/Editor)
 *   GET  /api/audits/:id                  — fetch audit status + scores (all roles)
 *   GET  /api/brands/:id/score            — latest TrustIndex Score + trend (all roles)
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
  // GET /api/brands — list this tenant's brands + latest TrustIndex Score
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
    });
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
          `INSERT INTO plan_task (tenant_id, plan_id, vector, gap, action, effort, impact, priority, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'proposed', NOW())`,
          [auth.tenantId, planId, r.vector, r.gap, r.action, r.effort, r.impact, r.priority]
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
    }>(
      `SELECT id, vector, gap, action, effort, impact, priority, status
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
      await db.query(`UPDATE plan_task SET status = $2 WHERE id = $1`, [taskId, status]);
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
  // GET /api/brands/:id/score — latest TrustIndex Score + 90-day trend
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
