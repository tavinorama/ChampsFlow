/**
 * C1 — AI Post Generation — Draft API routes
 *
 * Routes (architecture §5 API contracts):
 *   POST   /api/drafts/generate         — generate AI draft (Owner/Editor)
 *   POST   /api/drafts/:id/regenerate   — regenerate with new instruction (Owner/Editor)
 *   POST   /api/drafts/:id/approve      — approve draft (Owner/Editor)
 *   POST   /api/drafts/:id/report       — report draft problem (Owner/Editor)
 *   GET    /api/drafts/:id              — fetch single draft (all roles)
 *
 * Also registers GET /metrics (Prometheus exposition — requireAuth + requireSuperAdmin).
 *
 * Compliance conditions closed in this file:
 *  - A1  — generation_log writes (15 fields populated on every generate/regen)
 *  - A2  — prompt-to-output traceability (drafts.generation_id FK + new row per regen)
 *  - A3  — ai_generated flag in DB, API responses, all payloads
 *  - A5  — Prometheus counters: drafts_generated_total, drafts_regenerated_total, drafts_approved_total
 *  - S-5/CC-3 — prompt injection sanitization (delegated to AnthropicAdapter)
 *  - S-6/CC-4 — per-tenant LLM rate limiting (Redis token bucket; separate from C4 limiter)
 *  - S-12 — output_hash read-time verification on GET /api/drafts/:id
 *  - A6/L-UX-2 — "Report this draft" endpoint + audit_log event draft_reported
 *
 * Hard rules:
 *  - tenant_id resolved from JWT only — never from request body
 *  - generation_log: INSERT only (no UPDATE path anywhere in this file — append-only)
 *  - All DB queries parameterized — no string interpolation
 *  - No PII (email, tokens, post content) in logs
 *  - Prometheus counters increment synchronously before response
 */

import { Hono } from "hono";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { createHash, randomUUID } from "crypto";
import { requireAuth, requireRole, requireSuperAdmin, requireNotProcessingRestricted } from "../auth/middleware";
// requireSuperAdmin is used for GET /metrics — architecturally gated to platform admins only (§6.3)
import { requireDpaAcknowledged } from "./dpa";
import { requireNotRestricted } from "./billing";
import type { PostgresClient } from "./social-accounts";
import { llmGateway, LLMGatewayError } from "../../../../packages/llm/src/index";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Platform-specific prompt config (architecture §12 — system prompt hardcoded)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a professional social media content writer for small businesses (SMBs).
Generate clear, engaging, platform-appropriate social media post copy.

Rules:
- Never include personal data about third parties (names, emails, contact details).
- Never disparage competitors.
- Never generate harmful, misleading, or deceptive content.
- Match the platform format exactly.
- Do not add commentary outside the post copy itself.
- Respond with only the post text. For Instagram, include a line break then the hashtag block.`;

const PLATFORM_CONFIG: Record<
  "linkedin" | "instagram",
  { max_tokens: number; instruction: string }
> = {
  linkedin: {
    max_tokens: 400,
    instruction:
      "Write a LinkedIn text post. Length: 150–300 characters. Professional tone. No hashtag block needed (LinkedIn hashtags optional, 0–3 max if relevant).",
  },
  instagram: {
    max_tokens: 700,
    instruction:
      "Write an Instagram caption. Caption up to 2,200 characters. Then add a blank line followed by 5–10 relevant hashtags prefixed with #. Format:\n[caption text]\n\n[hashtags]",
  },
};

// ---------------------------------------------------------------------------
// Rate limiting (S-6/CC-4) — separate from C4 OAuth limiter
// Key prefix uses 'ratelimit:llm:' to distinguish from C4's 'ratelimit:oauth_connect:'
// ---------------------------------------------------------------------------

const LLM_RATE_LIMIT = {
  generate: { max: 50, windowSeconds: 3600, keyPrefix: "ratelimit:llm:generate:" },
  regenerate: { max: 200, windowSeconds: 3600, keyPrefix: "ratelimit:llm:regen:" },
};

function getRedis(): SharedRedis {
  return getSharedRedis();
}

async function checkLLMRateLimit(
  tenantId: string,
  type: "generate" | "regenerate"
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const cfg = LLM_RATE_LIMIT[type];
  const key = `${cfg.keyPrefix}${tenantId}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.ttl(key);
  const [[, count], [, ttl]] = (await pipeline.exec()) as [
    [null, number],
    [null, number]
  ];

  if (ttl === -1 || ttl === -2) {
    await redis.expire(key, cfg.windowSeconds);
  }

  const resetAt =
    Math.floor(Date.now() / 1000) +
    (ttl > 0 ? ttl : cfg.windowSeconds);
  const remaining = Math.max(0, cfg.max - (count ?? 0));
  const allowed = (count ?? 0) <= cfg.max;

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Prometheus counters (A5 — drift monitoring)
// Exposed via GET /metrics (gated by requireAuth + requireSuperAdmin for v1)
// ---------------------------------------------------------------------------

interface Counter {
  value: number;
  labels: Record<string, string>;
}

const counters: {
  drafts_generated_total: Counter[];
  drafts_regenerated_total: Counter[];
  drafts_approved_total: Counter[];
} = {
  drafts_generated_total: [],
  drafts_regenerated_total: [],
  drafts_approved_total: [],
};

function incrementCounter(
  name: keyof typeof counters,
  labels: Record<string, string>
): void {
  const existing = counters[name].find((c) =>
    Object.entries(labels).every(([k, v]) => c.labels[k] === v)
  );
  if (existing) {
    existing.value++;
  } else {
    counters[name].push({ value: 1, labels });
  }
}

function renderPrometheus(): string {
  const lines: string[] = [];

  for (const [metricName, counterList] of Object.entries(counters)) {
    lines.push(`# HELP ${metricName} Total count of ${metricName.replace(/_/g, " ")}`);
    lines.push(`# TYPE ${metricName} counter`);
    for (const counter of counterList) {
      const labelStr = Object.entries(counter.labels)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
        .join(",");
      lines.push(`${metricName}{${labelStr}} ${counter.value}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Audit log writer
// ---------------------------------------------------------------------------

type AuditEventType = "post_approved" | "draft_reported" | "prompt_injection_rejected";

async function writeAuditLog(
  db: PostgresClient,
  event: AuditEventType,
  actorUserId: string,
  tenantId: string,
  targetId: string | null,
  metadata: Record<string, string | number | boolean | null | undefined>
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      event,
      actorUserId,
      tenantId,
      "drafts",
      targetId,
      JSON.stringify(metadata),
    ]
  );
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerDraftRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/drafts/generate
  // Body: { topic: string, platform: 'linkedin' | 'instagram', workspace_id?: string, regen_instructions?: string }
  // Auth: requireAuth + requireRole(['owner', 'editor'])
  // -------------------------------------------------------------------------
  app.post(
    "/api/drafts/generate",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");
      const { tenantId, userId } = auth;

      // Rate limit check (S-6/CC-4)
      const rateLimit = await checkLLMRateLimit(tenantId, "generate");
      if (!rateLimit.allowed) {
        ctx.res.headers.set("Retry-After", String(rateLimit.resetAt - Math.floor(Date.now() / 1000)));
        ctx.status(429);
        return ctx.json({
          error: "Rate limit exceeded",
          code: "LLM_RATE_LIMIT",
          retry_after: rateLimit.resetAt,
        });
      }

      let body: {
        topic: string;
        platform: string;
        workspace_id?: string;
        regen_instructions?: string;
      };

      try {
        body = await ctx.req.json();
      } catch {
        ctx.status(400);
        return ctx.json({ error: "Invalid JSON body" });
      }

      const { topic, platform } = body;

      // Input validation
      if (!topic || typeof topic !== "string" || topic.trim().length < 10) {
        ctx.status(400);
        return ctx.json({
          error: "topic must be at least 10 characters",
          code: "INVALID_TOPIC",
        });
      }

      if (!platform || !["linkedin", "instagram"].includes(platform)) {
        ctx.status(400);
        return ctx.json({
          error: "platform must be 'linkedin' or 'instagram'",
          code: "INVALID_PLATFORM",
        });
      }

      const platformKey = platform as "linkedin" | "instagram";
      const platformConfig = PLATFORM_CONFIG[platformKey];

      const requestId = randomUUID();

      // Resolve tenant region from JWT (or env default)
      // In production, tenant_region would be stored in JWT app_metadata.region
      const tenantRegion =
        (process.env.DEFAULT_TENANT_REGION as "eu" | "us" | undefined) ?? "us";

      const userPrompt = `${platformConfig.instruction}\n\nTopic: ${topic.trim()}`;

      const startMs = Date.now();
      let llmResponse: Awaited<ReturnType<typeof llmGateway.generate>>;

      try {
        llmResponse = await llmGateway.generate({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          max_tokens: platformConfig.max_tokens,
          temperature: 0.7,
          provider: "anthropic",
          request_id: requestId,
          tenant_region: tenantRegion,
          stream: false,
        });
      } catch (err) {
        if (err instanceof LLMGatewayError) {
          const llmErr = err.error;

          // Log prompt injection rejections to audit log
          if (
            llmErr.code === "unavailable" &&
            llmErr.message.includes("Input rejected")
          ) {
            await writeAuditLog(db, "prompt_injection_rejected", userId, tenantId, null, {
              requestId,
              reason: llmErr.message,
            }).catch((auditErr) => {
              logger.error("audit_log_write_failed", {
                event: "prompt_injection_rejected",
                error: (auditErr as Error).message,
              });
            });

            ctx.status(400);
            return ctx.json({
              error: "Input rejected due to disallowed content",
              code: "PROMPT_REJECTED",
            });
          }

          logger.warn("llm_generation_failed", {
            code: llmErr.code,
            retryable: llmErr.retryable,
            requestId,
            tenantId,
          });

          if (llmErr.code === "rate_limit") {
            ctx.status(429);
            return ctx.json({
              error: "LLM provider rate limit reached. Please try again shortly.",
              code: "PROVIDER_RATE_LIMIT",
              retryable: true,
            });
          }

          ctx.status(503);
          return ctx.json({
            error: "Post generation failed. Please try again.",
            code: "GENERATION_FAILED",
            retryable: llmErr.retryable,
          });
        }

        logger.error("llm_unexpected_error", {
          requestId,
          tenantId,
          error: (err as Error).message,
        });
        ctx.status(500);
        return ctx.json({
          error: "An unexpected error occurred. Please try again.",
          code: "INTERNAL_ERROR",
        });
      }

      // Compute output hash for tamper evidence (S-12)
      const outputHash = createHash("sha256")
        .update(llmResponse.text)
        .digest("hex");

      // Parse hashtags for Instagram (separate from body text)
      let draftBody = llmResponse.text;
      let hashtags: string[] = [];

      if (platformKey === "instagram") {
        const parts = llmResponse.text.split(/\n\n(?=#)/);
        if (parts.length >= 2) {
          draftBody = parts[0].trim();
          hashtags = parts[1]
            .split(/\s+/)
            .filter((t) => t.startsWith("#"));
        }
      }

      // INSERT draft FIRST (without generation_id — to get draft.id for the FK)
      // Then INSERT generation_log with draft_id set.
      // Then UPDATE drafts.generation_id = new generation row.
      // This order avoids any UPDATE on generation_log (which is REVOKE UPDATE per CC-1/S-7).
      //
      // Note on circular FK: drafts.generation_id → generation_log.id (nullable)
      //                       generation_log.draft_id → drafts.id (nullable)
      // Solution: insert drafts first (generation_id=NULL), insert generation_log with draft_id,
      //           then UPDATE drafts.generation_id (only drafts is updated, not generation_log).

      // Step 1: INSERT draft placeholder (generation_id=NULL initially)
      const draftResult = await db.query<{
        id: string;
        body: string;
        hashtags: string[];
        ai_generated: boolean;
        status: string;
        platform: string;
        topic_input: string;
        created_at: string;
      }>(
        `INSERT INTO drafts
           (tenant_id, user_id, platform, topic_input, body, hashtags,
            ai_generated, generation_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'draft', NOW(), NOW())
         RETURNING id, body, hashtags, ai_generated, status, platform, topic_input, created_at`,
        [
          tenantId,
          userId,
          platformKey,
          topic.trim(),
          draftBody,
          hashtags,
          true,           // ai_generated — A3
        ]
      );

      const draft = draftResult.rows[0];

      if (!draft) {
        logger.error("draft_insert_failed", { tenantId, requestId });
        ctx.status(500);
        return ctx.json({ error: "Failed to save draft. Please try again." });
      }

      // Step 2: INSERT generation_log (A1 — all 15 fields populated) with draft_id set
      // Append-only — no UPDATE on generation_log anywhere in this file (CC-1 compliance).
      const generationLogResult = await db.query<{ id: string }>(
        `INSERT INTO generation_log
           (id, tenant_id, user_id, draft_id, provider, model_name, model_version,
            prompt_system, prompt_user, regen_instructions, output_text, output_hash,
            regen_count, latency_ms, zdr_confirmed, input_tokens, output_tokens, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
         RETURNING id`,
        [
          randomUUID(),               // id
          tenantId,                   // tenant_id
          userId,                     // user_id
          draft.id,                   // draft_id (now available)
          llmResponse.provider,       // provider
          llmResponse.model_name,     // model_name
          llmResponse.model_version,  // model_version
          SYSTEM_PROMPT,              // prompt_system
          userPrompt,                 // prompt_user
          [],                         // regen_instructions (empty for first generation)
          llmResponse.text,           // output_text
          outputHash,                 // output_hash
          0,                          // regen_count
          llmResponse.latency_ms,     // latency_ms
          llmResponse.zdr_confirmed,  // zdr_confirmed
          llmResponse.input_tokens,   // input_tokens
          llmResponse.output_tokens,  // output_tokens
        ]
      );

      const generationId = generationLogResult.rows[0]?.id;

      if (!generationId) {
        logger.error("generation_log_insert_failed", { tenantId, requestId, draftId: draft.id });
        ctx.status(500);
        return ctx.json({ error: "Failed to record generation. Please try again." });
      }

      // Step 3: UPDATE drafts.generation_id (UPDATE on drafts — allowed; not on generation_log)
      await db.query(
        `UPDATE drafts SET generation_id = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [generationId, draft.id, tenantId]
      );

      // Increment Prometheus counter (A5)
      incrementCounter("drafts_generated_total", {
        tenant_id: tenantId,
        provider: llmResponse.provider,
        model_version: llmResponse.model_version,
      });

      logger.info("draft_generated", {
        draftId: draft.id,
        generationId,
        tenantId,
        platform: platformKey,
      });

      // A3 — ai_generated propagated in API response
      return ctx.json({
        draft_id: draft.id,
        body: draftBody,
        hashtags: hashtags,
        platform: platformKey,
        ai_generated: true,   // A3 — always true for generated drafts
        generation_id: generationId,  // A2 — traceability FK
        status: "draft",
        topic_input: topic.trim(),
        created_at: draft.created_at,
      });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/drafts/:id/regenerate
  // Body: { regen_instructions?: string }
  // Auth: requireAuth + requireRole(['owner', 'editor'])
  // -------------------------------------------------------------------------
  app.post(
    "/api/drafts/:id/regenerate",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");
      const { tenantId, userId } = auth;
      const draftId = ctx.req.param("id");

      // Rate limit (S-6/CC-4)
      const rateLimit = await checkLLMRateLimit(tenantId, "regenerate");
      if (!rateLimit.allowed) {
        ctx.res.headers.set("Retry-After", String(rateLimit.resetAt - Math.floor(Date.now() / 1000)));
        ctx.status(429);
        return ctx.json({
          error: "Rate limit exceeded",
          code: "LLM_RATE_LIMIT",
          retry_after: rateLimit.resetAt,
        });
      }

      let body: { regen_instructions?: string } = {};
      try {
        body = await ctx.req.json();
      } catch {
        // Empty body is fine — regen_instructions is optional
      }

      const regenInstruction = body.regen_instructions?.trim() ?? "";

      // Fetch existing draft (tenant-scoped)
      const draftResult = await db.query<{
        id: string;
        platform: string;
        topic_input: string;
        generation_id: string;
        ai_generated: boolean;
      }>(
        `SELECT id, platform, topic_input, generation_id, ai_generated
         FROM drafts
         WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('discarded', 'published')`,
        [draftId, tenantId]
      );

      const draft = draftResult.rows[0];
      if (!draft) {
        ctx.status(404);
        return ctx.json({ error: "Draft not found", code: "DRAFT_NOT_FOUND" });
      }

      // Fetch previous generation to get regen_count and regen_instructions chain
      const prevGenResult = await db.query<{
        regen_count: number;
        regen_instructions: string[];
        prompt_user: string;
      }>(
        `SELECT regen_count, regen_instructions, prompt_user
         FROM generation_log
         WHERE id = $1 AND tenant_id = $2`,
        [draft.generation_id, tenantId]
      );

      const prevGen = prevGenResult.rows[0];
      const prevRegenCount = prevGen?.regen_count ?? 0;
      const prevInstructions = prevGen?.regen_instructions ?? [];

      // Build updated regen chain
      const newInstructions = regenInstruction
        ? [...prevInstructions, regenInstruction]
        : prevInstructions;

      const platformKey = draft.platform as "linkedin" | "instagram";
      const platformConfig = PLATFORM_CONFIG[platformKey];

      // Build user prompt with original topic + regen instruction appended
      const basePrompt = prevGen?.prompt_user ?? `${platformConfig.instruction}\n\nTopic: ${draft.topic_input?.trim() ?? ""}`;
      const userPrompt = regenInstruction
        ? `${basePrompt}\n\nAdditional instruction: ${regenInstruction}`
        : basePrompt;

      const requestId = randomUUID();
      const tenantRegion =
        (process.env.DEFAULT_TENANT_REGION as "eu" | "us" | undefined) ?? "us";

      let llmResponse: Awaited<ReturnType<typeof llmGateway.generate>>;

      try {
        llmResponse = await llmGateway.generate({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          max_tokens: platformConfig.max_tokens,
          temperature: 0.7,
          provider: "anthropic",
          request_id: requestId,
          tenant_region: tenantRegion,
          stream: false,
        });
      } catch (err) {
        if (err instanceof LLMGatewayError) {
          const llmErr = err.error;

          if (
            llmErr.code === "unavailable" &&
            llmErr.message.includes("Input rejected")
          ) {
            await writeAuditLog(db, "prompt_injection_rejected", userId, tenantId, draftId ?? null, {
              requestId,
              reason: llmErr.message,
              isRegen: true,
            }).catch(() => {});

            ctx.status(400);
            return ctx.json({
              error: "Regeneration instruction rejected due to disallowed content",
              code: "PROMPT_REJECTED",
            });
          }

          if (llmErr.code === "rate_limit") {
            ctx.status(429);
            return ctx.json({
              error: "LLM provider rate limit reached. Please try again shortly.",
              code: "PROVIDER_RATE_LIMIT",
              retryable: true,
            });
          }

          ctx.status(503);
          return ctx.json({
            error: "Regeneration failed. Please try again.",
            code: "REGENERATION_FAILED",
            retryable: llmErr.retryable,
          });
        }

        ctx.status(500);
        return ctx.json({ error: "An unexpected error occurred.", code: "INTERNAL_ERROR" });
      }

      const outputHash = createHash("sha256")
        .update(llmResponse.text)
        .digest("hex");

      // Parse body and hashtags for Instagram
      let newBody = llmResponse.text;
      let newHashtags: string[] = [];

      if (platformKey === "instagram") {
        const parts = llmResponse.text.split(/\n\n(?=#)/);
        if (parts.length >= 2) {
          newBody = parts[0].trim();
          newHashtags = parts[1].split(/\s+/).filter((t) => t.startsWith("#"));
        }
      }

      // INSERT NEW generation_log row (A2 — append-only; regen creates new row, never updates)
      const newGenResult = await db.query<{ id: string }>(
        `INSERT INTO generation_log
           (id, tenant_id, user_id, draft_id, provider, model_name, model_version,
            prompt_system, prompt_user, regen_instructions, output_text, output_hash,
            regen_count, latency_ms, zdr_confirmed, input_tokens, output_tokens, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
         RETURNING id`,
        [
          randomUUID(),
          tenantId,
          userId,
          draftId,                    // draft_id for the new row
          llmResponse.provider,
          llmResponse.model_name,
          llmResponse.model_version,
          SYSTEM_PROMPT,
          userPrompt,
          newInstructions,
          llmResponse.text,
          outputHash,
          prevRegenCount + 1,         // regen_count increments
          llmResponse.latency_ms,
          llmResponse.zdr_confirmed,
          llmResponse.input_tokens,
          llmResponse.output_tokens,
        ]
      );

      const newGenerationId = newGenResult.rows[0]?.id;
      if (!newGenerationId) {
        ctx.status(500);
        return ctx.json({ error: "Failed to record regeneration." });
      }

      // UPDATE drafts.generation_id FK to point to the new generation_log row (A2)
      // This is an UPDATE on drafts (allowed) — NOT on generation_log (append-only).
      await db.query(
        `UPDATE drafts
         SET generation_id = $1, body = $2, hashtags = $3, updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
        [newGenerationId, newBody, newHashtags, draftId, tenantId]
      );

      // Increment Prometheus counter (A5)
      incrementCounter("drafts_regenerated_total", {
        tenant_id: tenantId,
        provider: llmResponse.provider,
        model_version: llmResponse.model_version,
      });

      logger.info("draft_regenerated", {
        draftId,
        newGenerationId,
        prevGenerationId: draft.generation_id,
        tenantId,
        regenCount: prevRegenCount + 1,
      });

      return ctx.json({
        draft_id: draftId,
        body: newBody,
        hashtags: newHashtags,
        platform: draft.platform,
        ai_generated: true, // A3 — flag persists even on regen
        generation_id: newGenerationId,
        regen_count: prevRegenCount + 1,
      });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/drafts/:id/approve
  // Body: { scheduled_at?: string, platform_overrides?: object }
  // Auth: requireAuth + requireRole(['owner', 'editor'])
  // Status transition: draft → approved (C1 approval state per UX Screen 02)
  // -------------------------------------------------------------------------
  app.post(
    "/api/drafts/:id/approve",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireDpaAcknowledged(db),
    async (ctx) => {
      const auth = ctx.get("auth");
      const { tenantId, userId } = auth;
      const draftId = ctx.req.param("id");

      let body: { scheduled_at?: string; platform_overrides?: unknown } = {};
      try {
        body = await ctx.req.json();
      } catch {
        // optional body
      }

      // Fetch draft (tenant-scoped)
      const draftResult = await db.query<{
        id: string;
        status: string;
        ai_generated: boolean;
        generation_id: string;
        platform: string;
      }>(
        `SELECT id, status, ai_generated, generation_id, platform
         FROM drafts
         WHERE id = $1 AND tenant_id = $2`,
        [draftId, tenantId]
      );

      const draft = draftResult.rows[0];
      if (!draft) {
        ctx.status(404);
        return ctx.json({ error: "Draft not found", code: "DRAFT_NOT_FOUND" });
      }

      if (!["draft", "approved"].includes(draft.status)) {
        ctx.status(409);
        return ctx.json({
          error: `Draft cannot be approved in status '${draft.status}'`,
          code: "INVALID_STATUS_TRANSITION",
        });
      }

      // Update draft to approved
      await db.query(
        `UPDATE drafts
         SET status = 'approved', approved_by = $1, approved_at = NOW(),
             scheduled_at = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [userId, body.scheduled_at ?? null, draftId, tenantId]
      );

      // Write audit log (CI-5 — post approval action)
      await writeAuditLog(db, "post_approved", userId, tenantId, draftId ?? null, {
        platform: draft.platform,
        ai_generated: draft.ai_generated,
        generation_id: draft.generation_id,
        scheduled_at: body.scheduled_at ?? null,
      }).catch((err) => {
        logger.error("audit_log_write_failed", {
          event: "post_approved",
          draftId,
          error: (err as Error).message,
        });
      });

      // Increment Prometheus counter (A5)
      incrementCounter("drafts_approved_total", {
        tenant_id: tenantId,
        platform: draft.platform,
        ai_generated: String(draft.ai_generated),
      });

      logger.info("draft_approved", {
        draftId,
        tenantId,
        aiGenerated: draft.ai_generated,
        scheduledAt: body.scheduled_at ?? null,
      });

      return ctx.json({
        draft_id: draftId,
        status: "approved",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        ai_generated: draft.ai_generated, // A3
        generation_id: draft.generation_id,
        scheduled_at: body.scheduled_at ?? null,
      });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/drafts/:id/report
  // Body: { category: 'harmful' | 'inaccurate' | 'off_brand' | 'other', detail?: string }
  // Auth: requireAuth + requireRole(['owner', 'editor'])
  // A6/L-UX-2 — writes audit_log event 'draft_reported'
  // -------------------------------------------------------------------------
  app.post(
    "/api/drafts/:id/report",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (ctx) => {
      const auth = ctx.get("auth");
      const { tenantId, userId } = auth;
      const draftId = ctx.req.param("id");

      let body: { category?: string; detail?: string } = {};
      try {
        body = await ctx.req.json();
      } catch {
        ctx.status(400);
        return ctx.json({ error: "Invalid JSON body" });
      }

      const validCategories = ["harmful", "inaccurate", "off_brand", "other"];
      if (!body.category || !validCategories.includes(body.category)) {
        ctx.status(400);
        return ctx.json({
          error: `category must be one of: ${validCategories.join(", ")}`,
          code: "INVALID_CATEGORY",
        });
      }

      // Verify draft exists and belongs to this tenant
      const draftResult = await db.query<{
        id: string;
        generation_id: string;
        platform: string;
        ai_generated: boolean;
      }>(
        `SELECT id, generation_id, platform, ai_generated
         FROM drafts
         WHERE id = $1 AND tenant_id = $2`,
        [draftId, tenantId]
      );

      const draft = draftResult.rows[0];
      if (!draft) {
        ctx.status(404);
        return ctx.json({ error: "Draft not found", code: "DRAFT_NOT_FOUND" });
      }

      // Write audit_log event 'draft_reported' (A6/L-UX-2)
      await writeAuditLog(db, "draft_reported", userId, tenantId, draftId ?? null, {
        category: body.category,
        detail: body.detail ?? null,
        generation_id: draft.generation_id ?? null,
        platform: draft.platform,
        ai_generated: draft.ai_generated,
      });

      logger.info("draft_reported", {
        draftId,
        tenantId,
        category: body.category,
        generationId: draft.generation_id,
      });

      return ctx.json({
        acknowledged: true,
        draft_id: draftId,
        message: "Report received. Thank you.",
      });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/drafts/:id
  // Auth: requireAuth (all roles — viewer can read)
  // S-12 — output_hash read-time verification
  // -------------------------------------------------------------------------
  app.get(
    "/api/drafts/:id",
    requireAuth,
    async (ctx) => {
      const auth = ctx.get("auth");
      const { tenantId } = auth;
      const draftId = ctx.req.param("id");

      const draftResult = await db.query<{
        id: string;
        platform: string;
        topic_input: string;
        body: string;
        hashtags: string[];
        ai_generated: boolean;
        generation_id: string;
        status: string;
        approved_by: string;
        approved_at: string;
        scheduled_at: string;
        published_at: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, platform, topic_input, body, hashtags, ai_generated,
                generation_id, status, approved_by, approved_at, scheduled_at,
                published_at, created_at, updated_at
         FROM drafts
         WHERE id = $1 AND tenant_id = $2`,
        [draftId, tenantId]
      );

      const draft = draftResult.rows[0];
      if (!draft) {
        ctx.status(404);
        return ctx.json({ error: "Draft not found", code: "DRAFT_NOT_FOUND" });
      }

      // S-12 — output_hash read-time verification
      if (draft.generation_id) {
        const genResult = await db.query<{
          output_text: string;
          output_hash: string;
        }>(
          `SELECT output_text, output_hash
           FROM generation_log
           WHERE id = $1 AND tenant_id = $2`,
          [draft.generation_id, tenantId]
        );

        const gen = genResult.rows[0];
        if (gen && gen.output_text && gen.output_hash) {
          const recomputedHash = createHash("sha256")
            .update(gen.output_text)
            .digest("hex");

          if (recomputedHash !== gen.output_hash) {
            // Security alert — log and surface to observability stack (S-12)
            logger.error("output_hash_mismatch", {
              draftId,
              generationId: draft.generation_id,
              tenantId,
              storedHash: gen.output_hash,
              recomputedHash,
            });
            // Don't return the draft — tamper evidence triggered
            ctx.status(500);
            return ctx.json({
              error: "Draft integrity check failed. Please contact support.",
              code: "INTEGRITY_CHECK_FAILED",
            });
          }
        }
      }

      return ctx.json({
        id: draft.id,
        platform: draft.platform,
        topic_input: draft.topic_input,
        body: draft.body,
        hashtags: draft.hashtags ?? [],
        ai_generated: draft.ai_generated, // A3
        generation_id: draft.generation_id,
        status: draft.status,
        approved_by: draft.approved_by,
        approved_at: draft.approved_at,
        scheduled_at: draft.scheduled_at,
        published_at: draft.published_at,
        created_at: draft.created_at,
        updated_at: draft.updated_at,
      });
    }
  );

  // -------------------------------------------------------------------------
  // GET /metrics — Prometheus exposition
  // Auth: requireAuth + requireSuperAdmin (gated for v1)
  // A5 — drift monitoring counters exposed here
  // -------------------------------------------------------------------------
  app.get(
    "/metrics",
    requireAuth,
    requireSuperAdmin,
    async (ctx) => {
      ctx.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      return ctx.text(renderPrometheus());
    }
  );
}
