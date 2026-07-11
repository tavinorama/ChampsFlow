/**
 * BullMQ publish job processor — C2 Scheduler
 *
 * Job payload: { publish_job_id: string }
 * No tokens, no draft body, no PII in the job payload (hard rule).
 *
 * Processor flow:
 *   1. Fetch publish_jobs row by job.data.publish_job_id
 *   2. Fetch the associated draft and social_account
 *   3. Pre-check token_expires_at (S-9) — if expired, fail with token_expired
 *   4. Call dispatchPublish(socialAccount, draft) → { post_id }
 *   5. On success: update publish_jobs (status='done', platform_post_id, published_at)
 *   6. On retryable PublishError: increment attempt_count, set next_attempt_at (exp backoff,
 *      capped at 3600s), throw so BullMQ auto-retries (max 5 attempts in queue config)
 *   7. On non-retryable or exhausted: status='failed', error_message sanitized (no tokens)
 *
 * Prometheus counters (A5 condition):
 *   publish_jobs_succeeded_total{platform}
 *   publish_jobs_failed_total{platform, reason}
 *   scheduled_to_publish_latency_seconds histogram
 *
 * Per-tenant Redis semaphore: max 2 concurrent jobs per tenant_id
 *   Uses SET NX EX pattern for mutual exclusion.
 *
 * Security hard rules:
 *  - Never log token values or Authorization header values
 *  - error_message stored in DB is sanitized (no token patterns)
 *  - Structured logger uses token-scrubbing shared logger
 *
 * Architecture refs:
 *  - §4 Data Model: publish_jobs columns (attempt_count, error_message, platform_post_id)
 *  - §5 C2 Scheduler worker flow
 *  - S-4: no OAuth tokens in logs
 *  - S-9: token expiry pre-check before decrypt
 *  - A5: Prometheus counters
 */

import type { Job } from "bullmq";
import IORedis from "ioredis";
import { dispatchPublish } from "../../../api/src/integrations/index";
import { createWorkerDb, withRlsContext } from "../db/rls-client";
import { runWithTenant } from "../../../api/src/db/tenant-context";
import {
  PublishError,
  type SocialAccountForPublish,
  type DraftForPublish,
} from "../../../../packages/shared/src/index";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Prometheus-compatible in-memory counters (A5 condition)
//
// These in-memory counters are exposed as structured log lines tagged with
// the counter name, allowing Axiom/Grafana to build dashboards from log events.
// When prom-client is added to the worker (Gate 5→6 or deploy phase), these
// can be replaced with Counter/Histogram instances and a /metrics endpoint.
//
// Counter names match the spec:
//   publish_jobs_succeeded_total{platform}
//   publish_jobs_failed_total{platform, reason}
//   scheduled_to_publish_latency_seconds histogram
// ---------------------------------------------------------------------------

const _counters: Record<string, number> = {};

function incCounter(name: string): void {
  _counters[name] = (_counters[name] ?? 0) + 1;
}

// Thin wrappers matching the prom-client API surface
export const publishJobsSucceeded = {
  labels: (platform: string) => ({
    inc: () => {
      incCounter(`publish_jobs_succeeded_total{platform="${platform}"}`);
      logger.info("prometheus_counter", {
        metric: "publish_jobs_succeeded_total",
        platform,
        value: _counters[`publish_jobs_succeeded_total{platform="${platform}"}`] ?? 1,
      });
    },
  }),
};

export const publishJobsFailed = {
  labels: (platform: string, reason: string) => ({
    inc: () => {
      incCounter(`publish_jobs_failed_total{platform="${platform}",reason="${reason}"}`);
      logger.info("prometheus_counter", {
        metric: "publish_jobs_failed_total",
        platform,
        reason,
        value: _counters[`publish_jobs_failed_total{platform="${platform}",reason="${reason}"}`] ?? 1,
      });
    },
  }),
};

export const scheduledToPublishLatency = {
  labels: (platform: string) => ({
    observe: (seconds: number) => {
      logger.info("prometheus_histogram", {
        metric: "scheduled_to_publish_latency_seconds",
        platform,
        value_seconds: seconds,
      });
    },
  }),
};

// ---------------------------------------------------------------------------
// Per-tenant concurrency semaphore
// Max 2 concurrent publish jobs per tenant_id.
// Uses SET NX EX pattern: key = semaphore:publish:<tenantId>:<slot>
// Slots: 0 and 1 (2 max concurrent per tenant)
// ---------------------------------------------------------------------------

const SEMAPHORE_TTL_SECONDS = 300; // 5 min — long enough for any publish + buffer
const MAX_CONCURRENT_PER_TENANT = 2;
const SEMAPHORE_KEY_PREFIX = "semaphore:publish:";

/**
 * Try to acquire a publish semaphore slot for a tenant.
 * Returns the slot key if acquired, null if no slot available.
 * The caller MUST release the slot after the job completes (del the key).
 */
async function acquireSemaphoreSlot(
  redis: IORedis,
  tenantId: string,
  jobId: string
): Promise<string | null> {
  for (let slot = 0; slot < MAX_CONCURRENT_PER_TENANT; slot++) {
    const key = `${SEMAPHORE_KEY_PREFIX}${tenantId}:${slot}`;
    // SET key jobId EX ttl NX — succeeds only if key doesn't exist.
    // (ioredis typing expects EX+ttl before the NX flag.)
    const result = await redis.set(key, jobId, "EX", SEMAPHORE_TTL_SECONDS, "NX");
    if (result === "OK") {
      return key;
    }
  }
  return null; // Both slots occupied
}

async function releaseSemaphoreSlot(
  redis: IORedis,
  slotKey: string,
  jobId: string
): Promise<void> {
  // Only delete if the key still belongs to this job (avoid releasing another job's slot)
  const current = await redis.get(slotKey);
  if (current === jobId) {
    await redis.del(slotKey);
  }
}

// ---------------------------------------------------------------------------
// Sanitize error message before storing in DB (no token patterns)
// This strips anything that looks like a bearer token or access_token=... value.
// ---------------------------------------------------------------------------

const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /access_token=[^\s&"']*/gi,
  /refresh_token=[^\s&"']*/gi,
  /Authorization:\s*[^\s]*/gi,
];

function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of TOKEN_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  // Truncate to 500 chars to fit in error_message column cleanly
  return sanitized.slice(0, 500);
}

// ---------------------------------------------------------------------------
// Job processor
//
// DB access goes through the RLS-aware worker client (../db/rls-client): the
// bootstrap lookup of the job's own row runs unscoped (privileged), then all
// tenant-touching queries run inside runWithTenant — dropping into app_user so
// Row-Level Security is actually enforced, at parity with the API.
// ---------------------------------------------------------------------------

export async function processPublishJob(
  job: Job<{ publish_job_id: string }>,
  redis: IORedis
): Promise<{ post_id: string; platform: string }> {
  const { publish_job_id } = job.data;

  if (!publish_job_id) {
    throw new Error("publish_job_id missing from job data");
  }

  const sql = withRlsContext(createWorkerDb());

  try {
    // -------------------------------------------------------------------------
    // Step 1: Fetch publish_jobs row (UNSCOPED bootstrap).
    //
    // The publish payload carries only publish_job_id, not the tenant, so this
    // first lookup of the job's own control row runs by primary key as the
    // privileged login role (no tenant scope active yet). Once the tenant is
    // known, every remaining query runs under RLS as app_user via runWithTenant
    // — mirroring the API's unscoped provisioning paths (apps/api/src/db/client.ts).
    // -------------------------------------------------------------------------
    const jobRows = await sql.unsafe<Array<{
      id: string;
      draft_id: string;
      social_account_id: string;
      tenant_id: string;
      scheduled_at: Date;
      status: string;
      attempt_count: number;
    }>>(
      `SELECT id, draft_id, social_account_id, tenant_id, scheduled_at, status, attempt_count
       FROM publish_jobs
       WHERE id = $1`,
      [publish_job_id]
    );

    if (jobRows.length === 0) {
      logger.warn("worker_publish_job_not_found", { publish_job_id });
      // Don't throw — job data is stale; mark as no-op
      return { post_id: "", platform: "unknown" };
    }

    const publishJob = jobRows[0];

    // If already done or cancelled, skip (idempotency guard)
    if (["done", "cancelled", "failed"].includes(publishJob.status)) {
      logger.info("worker_publish_job_skipped", {
        publish_job_id,
        status: publishJob.status,
        reason: "already_terminal",
      });
      return { post_id: "", platform: "unknown" };
    }

    // -------------------------------------------------------------------------
    // Tenant-scoped work (RLS enforced as app_user). Every query below now runs
    // in a short transaction that sets app.current_tenant_id and drops into
    // app_user, so a missing `WHERE tenant_id` filter can no longer leak across
    // tenants — the worker is at parity with the API.
    // -------------------------------------------------------------------------
    return await runWithTenant(publishJob.tenant_id, async () => {
      let semaphoreKey: string | null = null;

      try {
        // -------------------------------------------------------------------------
        // Step 2: Per-tenant concurrency semaphore
        // -------------------------------------------------------------------------
        semaphoreKey = await acquireSemaphoreSlot(redis, publishJob.tenant_id, publish_job_id);

        if (!semaphoreKey) {
          // Concurrency limit reached — BullMQ will retry via configured backoff
          logger.info("worker_publish_semaphore_busy", {
            publish_job_id,
            tenant_id: publishJob.tenant_id,
          });
          throw new Error("tenant_concurrency_limit_reached");
        }

        // -------------------------------------------------------------------------
        // Step 3: Mark job as 'processing'
        // -------------------------------------------------------------------------
        await sql.unsafe(
          `UPDATE publish_jobs SET status = 'processing', updated_at = NOW()
           WHERE id = $1`,
          [publish_job_id]
        );

        logger.info("job_started", {
          publish_job_id,
          draft_id: publishJob.draft_id,
          tenant_id: publishJob.tenant_id,
          attempt: publishJob.attempt_count + 1,
          // No token fields logged
        });

        // -------------------------------------------------------------------------
        // Step 4: Fetch draft
        // -------------------------------------------------------------------------
        const draftRows = await sql.unsafe<Array<{
          id: string;
          tenant_id: string;
          user_id: string;
          platform: string;
          body: string;
          hashtags: string[] | null;
          ai_generated: boolean;
          status: string;
        }>>(
          `SELECT id, tenant_id, user_id, platform, body, hashtags, ai_generated, status
           FROM drafts
           WHERE id = $1 AND tenant_id = $2`,
          [publishJob.draft_id, publishJob.tenant_id]
        );

        if (draftRows.length === 0) {
          throw new PublishError(
            false,
            "platform_error",
            "linkedin", // placeholder; platform unknown at this point
            `Draft not found: ${publishJob.draft_id}`
          );
        }

        const draftRow = draftRows[0];

        // -------------------------------------------------------------------------
        // Step 5: Fetch social_account
        // -------------------------------------------------------------------------
        const accountRows = await sql.unsafe<Array<{
          id: string;
          tenant_id: string;
          platform: string;
          platform_user_id: string;
          access_token_enc: Buffer;
          token_expires_at: Date | null;
          revoked_at: Date | null;
        }>>(
          `SELECT id, tenant_id, platform, platform_user_id, access_token_enc, token_expires_at, revoked_at
           FROM social_accounts
           WHERE id = $1 AND tenant_id = $2`,
          [publishJob.social_account_id, publishJob.tenant_id]
        );

        if (accountRows.length === 0) {
          throw new PublishError(
            false,
            "platform_error",
            draftRow.platform as "linkedin" | "instagram" | "facebook",
            `Social account not found: ${publishJob.social_account_id}`
          );
        }

        const accountRow = accountRows[0];

        if (accountRow.revoked_at !== null) {
          throw new PublishError(
            false,
            "token_expired",
            accountRow.platform as "linkedin" | "instagram" | "facebook",
            "Social account has been disconnected."
          );
        }

        // -------------------------------------------------------------------------
        // S-9: Pre-publish token expiry check — before decrypting
        // dispatchPublish also performs this check; this is the outer guard layer.
        // -------------------------------------------------------------------------
        if (
          accountRow.token_expires_at !== null &&
          accountRow.token_expires_at <= new Date()
        ) {
          logger.warn("worker_token_expired_pre_check", {
            publish_job_id,
            social_account_id: accountRow.id,
            platform: accountRow.platform,
            // token NOT logged — only metadata
          });
          throw new PublishError(
            false,
            "token_expired",
            accountRow.platform as "linkedin" | "instagram" | "facebook",
            `OAuth token for platform '${accountRow.platform}' has expired. User must reconnect the account.`
          );
        }

        const socialAccount: SocialAccountForPublish = {
          id: accountRow.id,
          tenant_id: accountRow.tenant_id,
          platform: accountRow.platform as "linkedin" | "instagram" | "facebook",
          platform_user_id: accountRow.platform_user_id,
          access_token_enc: accountRow.access_token_enc,
          token_expires_at: accountRow.token_expires_at,
        };

        const draft: DraftForPublish = {
          id: draftRow.id,
          tenant_id: draftRow.tenant_id,
          user_id: draftRow.user_id,
          platform: draftRow.platform as "linkedin" | "instagram" | "facebook",
          body: draftRow.body,
          hashtags: draftRow.hashtags,
          ai_generated: draftRow.ai_generated,
        };

        // -------------------------------------------------------------------------
        // Step 6: Dispatch publish to platform adapter
        // -------------------------------------------------------------------------
        const startTime = Date.now();
        const result = await dispatchPublish(socialAccount, draft);
        const latencySeconds = (Date.now() - startTime) / 1000;

        // -------------------------------------------------------------------------
        // Step 7: Update publish_jobs on success
        // -------------------------------------------------------------------------
        await sql.unsafe(
          `UPDATE publish_jobs
             SET status = 'done',
                 platform_post_id = $1,
                 published_at = NOW(),
                 updated_at = NOW()
           WHERE id = $2`,
          [result.post_id, publish_job_id]
        );

        // Update draft status → 'published'
        await sql.unsafe(
          `UPDATE drafts SET status = 'published', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [publishJob.draft_id, publishJob.tenant_id]
        );

        // Append audit_log entry. metadata is jsonb — use sql.json() (the
        // worker's jsonb idiom, same as landing-generate) so postgres.js
        // serializes the OBJECT once; passing JSON.stringify(...) here would
        // double-encode it into a jsonb string scalar (see packages/shared/src/jsonb.ts).
        await sql`
          INSERT INTO audit_log (tenant_id, event_type, metadata)
          VALUES (${publishJob.tenant_id}, 'post_published', ${sql.json({
            publish_job_id,
            draft_id: publishJob.draft_id,
            social_account_id: publishJob.social_account_id,
            platform: socialAccount.platform,
            post_id: result.post_id,
            ai_generated: draftRow.ai_generated,
          })})`;

        // Prometheus: success counter + latency
        publishJobsSucceeded.labels(socialAccount.platform).inc();
        const scheduledAt = publishJob.scheduled_at instanceof Date
          ? publishJob.scheduled_at
          : new Date(publishJob.scheduled_at);
        const scheduledToPublishSeconds = (Date.now() - scheduledAt.getTime()) / 1000;
        scheduledToPublishLatency.labels(socialAccount.platform).observe(scheduledToPublishSeconds);

        logger.info("job_succeeded", {
          publish_job_id,
          draft_id: publishJob.draft_id,
          platform: socialAccount.platform,
          post_id: result.post_id,
          latency_ms: Math.round(latencySeconds * 1000),
          ai_generated: draftRow.ai_generated,
          // token NOT logged
        });

        return { post_id: result.post_id, platform: socialAccount.platform };

      } catch (err) {
        const platform =
          err instanceof PublishError ? err.platform : "unknown";
        const isPublishError = err instanceof PublishError;
        const retryable = isPublishError ? err.retryable : true;
        const errorCode = isPublishError ? err.code : "platform_error";
        const rawMessage = (err as Error).message ?? "Unknown error";
        const sanitizedMessage = sanitizeErrorMessage(rawMessage);

        const publishJobId = job.data.publish_job_id;

        // Re-fetch attempt_count from DB to get current value (in case of race).
        // Still inside the tenant scope, so this runs RLS-enforced as app_user.
        let currentAttemptCount = 0;
        try {
          const sql2 = withRlsContext(createWorkerDb());
          const countRows = await sql2.unsafe<Array<{ attempt_count: number }>>(
            `SELECT attempt_count FROM publish_jobs WHERE id = $1`,
            [publishJobId]
          );
          currentAttemptCount = countRows[0]?.attempt_count ?? 0;
          await sql2.end();
        } catch {
          // Best-effort
        }

        const newAttemptCount = currentAttemptCount + 1;
        const MAX_ATTEMPTS = 5;
        const isExhausted = newAttemptCount >= MAX_ATTEMPTS;

        if (retryable && !isExhausted) {
          // Exponential backoff: min(2^attempts * 60s, 3600s)
          const backoffSeconds = Math.min(
            Math.pow(2, newAttemptCount) * 60,
            3600
          );
          const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

          try {
            await sql.unsafe(
              `UPDATE publish_jobs
                 SET status = 'queued',
                     attempt_count = $1,
                     next_attempt_at = $2,
                     error_message = $3,
                     updated_at = NOW()
               WHERE id = $4`,
              [newAttemptCount, nextAttemptAt.toISOString(), sanitizedMessage, publishJobId]
            );
          } catch {
            // Best-effort DB update
          }

          logger.warn("job_failed_retryable", {
            publish_job_id: publishJobId,
            platform: String(platform),
            error_code: errorCode,
            attempt: newAttemptCount,
            next_attempt_at: nextAttemptAt.toISOString(),
            // error message sanitized before logging — no tokens
            error_message: sanitizedMessage,
          });

          // Throw to let BullMQ handle the retry
          throw err;

        } else {
          // Non-retryable or attempts exhausted — mark as permanently failed
          try {
            await sql.unsafe(
              `UPDATE publish_jobs
                 SET status = 'failed',
                     attempt_count = $1,
                     error_message = $2,
                     updated_at = NOW()
               WHERE id = $3`,
              [newAttemptCount, sanitizedMessage, publishJobId]
            );
          } catch {
            // Best-effort
          }

          // Append audit_log failure entry
          try {
            const jobRows2 = await sql.unsafe<Array<{ draft_id: string; tenant_id: string; social_account_id: string }>>(
              `SELECT draft_id, tenant_id, social_account_id FROM publish_jobs WHERE id = $1`,
              [publishJobId]
            );
            if (jobRows2.length > 0) {
              const pj = jobRows2[0];
              // metadata is jsonb — sql.json() serializes the OBJECT once
              // (JSON.stringify would double-encode; see packages/shared/src/jsonb.ts).
              await sql`
                INSERT INTO audit_log (tenant_id, event_type, metadata)
                VALUES (${pj.tenant_id}, 'post_publish_failed', ${sql.json({
                  publish_job_id: publishJobId,
                  draft_id: pj.draft_id,
                  social_account_id: pj.social_account_id,
                  platform: String(platform),
                  error_code: errorCode,
                  // sanitized message only — no tokens
                  error_message: sanitizedMessage,
                  attempt_count: newAttemptCount,
                })})`;
            }
          } catch {
            // Best-effort audit log
          }

          // Prometheus: failure counter
          publishJobsFailed.labels(String(platform), errorCode).inc();

          logger.error("job_failed", {
            publish_job_id: publishJobId,
            platform: String(platform),
            error_code: errorCode,
            attempt: newAttemptCount,
            permanent: !retryable || isExhausted,
            // Sanitized message — no tokens
            error_message: sanitizedMessage,
          });

          // Don't re-throw for permanent failures; BullMQ will mark as failed
          return { post_id: "", platform: String(platform) };
        }
      } finally {
        // Release semaphore slot
        if (semaphoreKey) {
          try {
            await releaseSemaphoreSlot(redis, semaphoreKey, job.data.publish_job_id);
          } catch {
            // Best-effort
          }
        }
      }
    });
  } finally {
    // Close the Postgres connection (covers the unscoped bootstrap early-returns
    // and the tenant-scoped path alike).
    try {
      await sql.end();
    } catch {
      // Best-effort
    }
  }
}
