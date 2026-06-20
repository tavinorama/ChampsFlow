/**
 * C2 Scheduler — Schedule API routes
 *
 * Routes (architecture §5 API contracts):
 *   POST   /api/drafts/:id/schedule    — schedule approved draft (Owner/Editor)
 *   GET    /api/schedules              — list scheduled jobs for tenant (all roles)
 *   DELETE /api/schedules/:job_id      — cancel a scheduled job (Owner/Editor)
 *
 * DB column mapping (publish_jobs):
 *   - attempt_count  (not 'attempts') — per initial_schema migration
 *   - error_message  (not 'last_error') — per initial_schema migration
 *   - platform_post_id — set by worker on success
 *   - next_attempt_at, published_at — added by 20260506000002 migration
 *
 * Business rules:
 *  - scheduled_at must be in the future AND <= now + 90 days (UTC)
 *  - platform_account_ids must be UUIDs belonging to the authenticated tenant
 *  - One publish_jobs row is inserted per platform_account_id
 *  - BullMQ delayed job enqueued with delay = scheduled_at - now (milliseconds)
 *  - Job payload: { publish_job_id } only — no tokens, no body, no PII
 *  - Cancel: status → 'cancelled'; BullMQ job removal is best-effort
 *  - Per-tenant rate limit: 100 schedule creates/hour (Redis bucket)
 *
 * Compliance conditions closed:
 *  - S-9: token_expires_at pre-check is enforced in the worker (not here)
 *  - draft_scheduled + schedule_cancelled events in audit_log
 *
 * Hard rules:
 *  - tenant_id resolved from JWT only — never from request body
 *  - All DB queries parameterized — no string interpolation
 *  - No PII (email, tokens, post content) in logs
 *  - audit_log writes for draft_scheduled and schedule_cancelled events
 */

import { Hono } from "hono";
import { Redis } from "@upstash/redis";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { requireAuth, requireRole, requireNotProcessingRestricted } from "../auth/middleware";
import { requireDpaAcknowledged } from "./dpa";
import { requireNotRestricted } from "./billing";
import { logger } from "../../../../packages/shared/src/logger";
import type { PostgresClient } from "./social-accounts";

// ---------------------------------------------------------------------------
// BullMQ queue client (ioredis connection)
// Lazy-initialized — only created when first schedule request comes in.
// BullMQ requires ioredis with maxRetriesPerRequest: null.
// ---------------------------------------------------------------------------

let _publishQueue: Queue | null = null;
let _ioRedis: InstanceType<typeof IORedis> | null = null;

function getPublishQueue(): Queue {
  if (_publishQueue) return _publishQueue;

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  _ioRedis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  _ioRedis.on("error", (err: Error) => {
    logger.error("bullmq_redis_connection_error", { message: err.message });
  });

  _publishQueue = new Queue("publish", {
    connection: _ioRedis,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 60_000, // 60s base; worker caps each retry at 3600s
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  });

  return _publishQueue;
}

// ---------------------------------------------------------------------------
// Upstash Redis — rate limiting
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit: 100 schedule creates/hour
// ---------------------------------------------------------------------------

const SCHEDULE_RATE_LIMIT_MAX = 100;
const SCHEDULE_RATE_LIMIT_WINDOW_SECONDS = 3600;
const SCHEDULE_RATE_LIMIT_KEY_PREFIX = "ratelimit:schedule_create:";

async function checkScheduleRateLimit(tenantId: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp seconds
}> {
  const redis = getRedis();
  const key = `${SCHEDULE_RATE_LIMIT_KEY_PREFIX}${tenantId}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.ttl(key);
  const [[, count], [, ttl]] = (await pipeline.exec()) as [
    [null, number],
    [null, number]
  ];

  if (ttl === -1 || ttl === -2) {
    await redis.expire(key, SCHEDULE_RATE_LIMIT_WINDOW_SECONDS);
  }

  const resetAt =
    Math.floor(Date.now() / 1000) +
    (ttl > 0 ? ttl : SCHEDULE_RATE_LIMIT_WINDOW_SECONDS);
  const remaining = Math.max(0, SCHEDULE_RATE_LIMIT_MAX - (count ?? 0));
  const allowed = (count ?? 0) <= SCHEDULE_RATE_LIMIT_MAX;

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** ISO 8601 datetime regex — allows Z and ±HH:MM offset */
const ISO8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** UUID v4 regex */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIso8601(value: unknown): value is string {
  return typeof value === "string" && ISO8601_RE.test(value);
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerScheduleRoutes(app: Hono, db: PostgresClient): void {
  // --------------------------------------------------------------------------
  // POST /api/drafts/:id/schedule
  //
  // Schedule an approved draft for publishing.
  //
  // Body: { scheduled_at: ISO8601, platform_account_ids: UUID[] }
  //
  // Validates:
  //   1. Draft exists, belongs to tenant, status = 'approved'
  //   2. scheduled_at is in the future AND <= now + 90 days
  //   3. platform_account_ids non-empty, all UUIDs, all belong to tenant
  //   4. Per-tenant rate limit (100/hour)
  //
  // Actions:
  //   1. Insert publish_jobs row per platform_account_id (status='pending')
  //   2. Enqueue BullMQ delayed job { publish_job_id } per row
  //   3. Update publish_jobs status → 'queued' (with BullMQ job name stored)
  //   4. Update draft status → 'scheduled'
  //   5. Write audit_log event 'draft_scheduled'
  // --------------------------------------------------------------------------

  app.post(
    "/api/drafts/:id/schedule",
    requireAuth,
    requireNotProcessingRestricted(db),
    requireRole(["owner", "editor"]),
    requireNotRestricted(db),
    requireDpaAcknowledged(db),
    async (c) => {
      const auth = c.get("auth");
      const draftId = c.req.param("id");

      if (!isValidUuid(draftId)) {
        return c.json(
          { ok: false, error: { code: "INVALID_DRAFT_ID", message: "Invalid draft ID format" } },
          400
        );
      }

      // Parse body
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
          400
        );
      }

      const { scheduled_at, platform_account_ids } = body as {
        scheduled_at?: unknown;
        platform_account_ids?: unknown;
      };

      // Validate scheduled_at
      if (!isValidIso8601(scheduled_at)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_SCHEDULED_AT",
              message: "scheduled_at must be a valid ISO 8601 datetime string",
            },
          },
          400
        );
      }

      const scheduledAtDate = new Date(scheduled_at);
      const now = new Date();
      const maxScheduleDate = new Date(
        now.getTime() + 90 * 24 * 60 * 60 * 1000
      );

      if (scheduledAtDate <= now) {
        return c.json(
          {
            ok: false,
            error: {
              code: "SCHEDULED_AT_IN_PAST",
              message: "scheduled_at must be in the future",
            },
          },
          400
        );
      }

      if (scheduledAtDate > maxScheduleDate) {
        return c.json(
          {
            ok: false,
            error: {
              code: "SCHEDULED_AT_TOO_FAR",
              message: "scheduled_at must be within 90 days from now",
            },
          },
          400
        );
      }

      // Validate platform_account_ids
      if (
        !Array.isArray(platform_account_ids) ||
        platform_account_ids.length === 0
      ) {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_PLATFORM_ACCOUNTS",
              message: "platform_account_ids must be a non-empty array of UUIDs",
            },
          },
          400
        );
      }

      const MAX_ACCOUNTS = 10;
      if (platform_account_ids.length > MAX_ACCOUNTS) {
        return c.json(
          {
            ok: false,
            error: {
              code: "TOO_MANY_ACCOUNTS",
              message: `Cannot schedule to more than ${MAX_ACCOUNTS} accounts at once`,
            },
          },
          400
        );
      }

      for (const id of platform_account_ids) {
        if (!isValidUuid(id)) {
          return c.json(
            {
              ok: false,
              error: {
                code: "INVALID_ACCOUNT_ID",
                message: `Invalid platform_account_id format: ${id}`,
              },
            },
            400
          );
        }
      }

      // Per-tenant rate limit
      const rateLimit = await checkScheduleRateLimit(auth.tenantId);
      if (!rateLimit.allowed) {
        const retryAfter = rateLimit.resetAt - Math.floor(Date.now() / 1000);
        return c.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Schedule rate limit exceeded. Maximum 100 schedules per hour.",
              retryable: true,
              retryAfterSeconds: retryAfter,
            },
          },
          429,
          {
            "X-RateLimit-Limit": String(SCHEDULE_RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetAt),
            "Retry-After": String(retryAfter),
          }
        );
      }

      // Set RLS tenant context
      await db.setTenantId(auth.tenantId);

      // Verify draft exists, belongs to tenant, and is in 'approved' status
      const draftResult = await db.query<{
        id: string;
        tenant_id: string;
        status: string;
        platform: string;
      }>(
        `SELECT id, tenant_id, status, platform
         FROM drafts
         WHERE id = $1 AND tenant_id = $2`,
        [draftId, auth.tenantId]
      );

      if (draftResult.rows.length === 0) {
        return c.json(
          {
            ok: false,
            error: {
              code: "DRAFT_NOT_FOUND",
              message: "Draft not found or you do not have access to it",
            },
          },
          404
        );
      }

      const draft = draftResult.rows[0];

      if (draft.status !== "approved") {
        return c.json(
          {
            ok: false,
            error: {
              code: "DRAFT_NOT_APPROVED",
              message: `Draft must be in 'approved' status to schedule. Current status: ${draft.status}`,
            },
          },
          409
        );
      }

      // Verify all platform_account_ids belong to this tenant (parameterized ANY)
      const accountsResult = await db.query<{
        id: string;
        platform: string;
        revoked_at: string | null;
      }>(
        `SELECT id, platform, revoked_at
         FROM social_accounts
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
        [platform_account_ids, auth.tenantId]
      );

      if (accountsResult.rows.length !== platform_account_ids.length) {
        return c.json(
          {
            ok: false,
            error: {
              code: "ACCOUNT_NOT_FOUND",
              message:
                "One or more platform accounts not found or do not belong to your workspace",
            },
          },
          404
        );
      }

      const revokedAccounts = accountsResult.rows.filter(
        (a) => a.revoked_at !== null
      );
      if (revokedAccounts.length > 0) {
        return c.json(
          {
            ok: false,
            error: {
              code: "ACCOUNT_DISCONNECTED",
              message:
                "One or more selected accounts have been disconnected. Please reconnect them first.",
            },
          },
          409
        );
      }

      // Insert publish_jobs rows and enqueue BullMQ delayed jobs
      const queue = getPublishQueue();
      const delayMs = scheduledAtDate.getTime() - Date.now();
      const publishedJobIds: string[] = [];

      for (const accountId of platform_account_ids) {
        // Insert with status='pending'
        const jobResult = await db.query<{ id: string }>(
          `INSERT INTO publish_jobs
             (draft_id, social_account_id, tenant_id, scheduled_at, status, attempt_count)
           VALUES ($1, $2, $3, $4, 'pending', 0)
           RETURNING id`,
          [draftId, accountId, auth.tenantId, scheduledAtDate.toISOString()]
        );

        const publishJobId = jobResult.rows[0].id;

        // Enqueue BullMQ delayed job — payload contains ONLY the publish_job_id
        // No tokens, no draft body, no PII in the BullMQ job payload.
        await queue.add(
          "publish",
          { publish_job_id: publishJobId },
          { delay: Math.max(0, delayMs), jobId: publishJobId }
          // Using publishJobId as BullMQ jobId allows removal by ID on cancel
        );

        // Update publish_jobs status → 'queued'
        await db.query(
          `UPDATE publish_jobs SET status = 'queued', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [publishJobId, auth.tenantId]
        );

        publishedJobIds.push(publishJobId);
      }

      // Update draft status → 'scheduled'
      await db.query(
        `UPDATE drafts SET status = 'scheduled', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [draftId, auth.tenantId]
      );

      // Write audit_log event 'draft_scheduled'
      // audit_log columns: tenant_id, actor_user_id, event_type, metadata
      await db.query(
        `INSERT INTO audit_log (tenant_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, 'draft_scheduled', $3)`,
        [
          auth.tenantId,
          auth.userId,
          JSON.stringify({
            draft_id: draftId,
            scheduled_at: scheduledAtDate.toISOString(),
            platform_account_ids,
            publish_job_ids: publishedJobIds,
          }),
        ]
      );

      logger.info("draft_scheduled", {
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        draft_id: draftId,
        scheduled_at: scheduledAtDate.toISOString(),
        account_count: platform_account_ids.length,
        // publish_job_ids logged for traceability; no PII
        publish_job_ids: publishedJobIds,
      });

      return c.json(
        {
          ok: true,
          data: {
            draft_id: draftId,
            scheduled_at: scheduledAtDate.toISOString(),
            publish_job_ids: publishedJobIds,
          },
        },
        201
      );
    }
  );

  // --------------------------------------------------------------------------
  // GET /api/schedules
  //
  // List scheduled jobs for the authenticated tenant.
  //
  // Query params:
  //   status  — comma-separated filter: pending,queued,processing,done,failed,cancelled
  //             (default: all statuses)
  //   page    — 1-based page number (default: 1)
  //   limit   — page size, max 50 (default: 20)
  //
  // Response: paginated list of publish_jobs with draft preview (≤140 chars body)
  //           and platform info. Sorted by scheduled_at DESC.
  // All roles may GET (Viewer read access is permitted).
  // --------------------------------------------------------------------------

  app.get("/api/schedules", requireAuth, async (c) => {
    const auth = c.get("auth");

    const statusParam =
      c.req.query("status") ??
      "pending,queued,processing,done,failed,cancelled";
    const pageParam = parseInt(c.req.query("page") ?? "1", 10);
    const limitParam = Math.min(
      parseInt(c.req.query("limit") ?? "20", 10),
      50
    );

    const VALID_STATUSES = new Set([
      "pending",
      "queued",
      "processing",
      "done",
      "failed",
      "cancelled",
    ]);
    const requestedStatuses = statusParam.split(",").map((s) => s.trim());
    const filteredStatuses = requestedStatuses.filter((s) =>
      VALID_STATUSES.has(s)
    );

    if (filteredStatuses.length === 0) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_STATUS", message: "Invalid status filter value(s)" },
        },
        400
      );
    }

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const limit = Math.max(1, isNaN(limitParam) ? 20 : limitParam);
    const offset = (page - 1) * limit;

    await db.setTenantId(auth.tenantId);

    // Fetch publish_jobs with joined draft preview and social_account platform
    const jobsResult = await db.query<{
      id: string;
      draft_id: string;
      social_account_id: string;
      scheduled_at: string;
      status: string;
      attempt_count: number;
      next_attempt_at: string | null;
      published_at: string | null;
      error_message: string | null;
      platform_post_id: string | null;
      created_at: string;
      draft_body_preview: string | null;
      draft_platform: string | null;
      account_platform: string | null;
    }>(
      `SELECT
         pj.id,
         pj.draft_id,
         pj.social_account_id,
         pj.scheduled_at,
         pj.status,
         pj.attempt_count,
         pj.next_attempt_at,
         pj.published_at,
         pj.error_message,
         pj.platform_post_id,
         pj.created_at,
         LEFT(d.body, 140) AS draft_body_preview,
         d.platform         AS draft_platform,
         sa.platform        AS account_platform
       FROM publish_jobs pj
       LEFT JOIN drafts d ON d.id = pj.draft_id
       LEFT JOIN social_accounts sa ON sa.id = pj.social_account_id
       WHERE pj.tenant_id = $1
         AND pj.status = ANY($2::text[])
       ORDER BY pj.scheduled_at DESC, pj.created_at DESC
       LIMIT $3 OFFSET $4`,
      [auth.tenantId, filteredStatuses, limit, offset]
    );

    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM publish_jobs
       WHERE tenant_id = $1
         AND status = ANY($2::text[])`,
      [auth.tenantId, filteredStatuses]
    );

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

    return c.json({
      ok: true,
      data: {
        jobs: jobsResult.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
    });
  });

  // --------------------------------------------------------------------------
  // DELETE /api/schedules/:job_id
  //
  // Cancel a scheduled job.
  //
  // Only 'pending' or 'queued' jobs can be cancelled.
  //
  // Actions:
  //   1. Set publish_jobs.status = 'cancelled'
  //   2. Remove the BullMQ job by jobId (we use publish_job_id as BullMQ jobId)
  //   3. If draft has no other pending/queued/processing jobs, revert draft → 'approved'
  //   4. Write audit_log event 'schedule_cancelled'
  // --------------------------------------------------------------------------

  app.delete(
    "/api/schedules/:job_id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const jobId = c.req.param("job_id");

      if (!isValidUuid(jobId)) {
        return c.json(
          {
            ok: false,
            error: { code: "INVALID_JOB_ID", message: "Invalid job ID format" },
          },
          400
        );
      }

      await db.setTenantId(auth.tenantId);

      // Fetch the publish_jobs row (RLS enforces tenant isolation)
      const jobResult = await db.query<{
        id: string;
        draft_id: string;
        tenant_id: string;
        status: string;
      }>(
        `SELECT id, draft_id, tenant_id, status
         FROM publish_jobs
         WHERE id = $1 AND tenant_id = $2`,
        [jobId, auth.tenantId]
      );

      if (jobResult.rows.length === 0) {
        return c.json(
          {
            ok: false,
            error: {
              code: "JOB_NOT_FOUND",
              message: "Schedule not found or you do not have access to it",
            },
          },
          404
        );
      }

      const job = jobResult.rows[0];

      if (!["pending", "queued"].includes(job.status)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "JOB_NOT_CANCELLABLE",
              message: `Cannot cancel a job with status '${job.status}'. Only pending or queued jobs can be cancelled.`,
            },
          },
          409
        );
      }

      // Update status → 'cancelled'
      await db.query(
        `UPDATE publish_jobs SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [jobId, auth.tenantId]
      );

      // Remove BullMQ job by publish_job_id (used as BullMQ jobId on enqueue)
      try {
        const queue = getPublishQueue();
        const bullJob = await queue.getJob(jobId);
        if (bullJob) {
          await bullJob.remove();
        }
      } catch (err) {
        // Best-effort: log the failure without exposing internals, continue
        logger.warn("bullmq_job_removal_failed", {
          publish_job_id: jobId,
          error: (err as Error).message,
        });
      }

      // Check if draft has any remaining active jobs
      const remainingResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM publish_jobs
         WHERE draft_id = $1 AND tenant_id = $2
           AND status IN ('pending', 'queued', 'processing')`,
        [job.draft_id, auth.tenantId]
      );

      const remaining = parseInt(
        remainingResult.rows[0]?.count ?? "0",
        10
      );

      if (remaining === 0) {
        // Revert draft status to 'approved' so user can reschedule
        await db.query(
          `UPDATE drafts SET status = 'approved', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2 AND status = 'scheduled'`,
          [job.draft_id, auth.tenantId]
        );
      }

      // Write audit_log event 'schedule_cancelled'
      await db.query(
        `INSERT INTO audit_log (tenant_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, 'schedule_cancelled', $3)`,
        [
          auth.tenantId,
          auth.userId,
          JSON.stringify({
            publish_job_id: jobId,
            draft_id: job.draft_id,
          }),
        ]
      );

      logger.info("schedule_cancelled", {
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        publish_job_id: jobId,
        draft_id: job.draft_id,
      });

      return c.json({
        ok: true,
        data: { publish_job_id: jobId, status: "cancelled" },
      });
    }
  );
}
