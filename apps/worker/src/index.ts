/**
 * Organic Posts Worker — BullMQ publish job processor
 *
 * Processes publish_jobs enqueued by the schedule route (C2 Scheduler).
 *
 * Job queue: 'publish'
 * Job payload: { publish_job_id: string }
 * Concurrency: 5 globally (per-tenant limit of 2 enforced inside processor)
 * Max attempts: 5 (configured via defaultJobOptions in Queue creation in routes/schedules.ts)
 *
 * Structured logging:
 *   worker_started — on boot
 *   job_started    — when worker picks up a job
 *   job_succeeded  — on successful publish
 *   job_failed     — on permanent failure
 *   worker_shutdown — on SIGTERM/SIGINT
 *
 * Hard rules:
 *   - No OAuth tokens in logs (scrubbed by shared logger + sanitizeErrorMessage)
 *   - autorun: true — worker starts processing immediately on boot
 *   - Graceful shutdown: worker.close() before process.exit
 *
 * Architecture refs:
 *   - §5 C2 Scheduler (worker section)
 *   - §10 Observability (structured logger, Prometheus)
 *   - S-4: no token values in logs
 *   - A5: Prometheus counters in jobs/publish.ts
 */

import Redis from "ioredis";
import { Worker } from "bullmq";
import { logger } from "../../../packages/shared/src/logger";
import { processPublishJob } from "./jobs/publish";
import { processAuditJob, processDailyMonitoredBrands } from "./jobs/audit-run";
import { processNurtureJobs } from "./jobs/nurture-send";
import {
  createWorkerDb,
  withRlsContext,
  assertWorkerAppDbRoleSafe,
} from "./db/rls-client";
import { applyPlatformKeyOverrides } from "../../../packages/shared/src/platform-keys";

// ---------------------------------------------------------------------------
// Redis connection (ioredis — required by BullMQ)
// maxRetriesPerRequest: null is required for BullMQ blocking operations
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err: Error) => {
  logger.error("worker_redis_connection_error", { message: err.message });
});

// ---------------------------------------------------------------------------
// BullMQ Worker
// Concurrency: 5 globally (per-tenant semaphore in processor caps at 2)
// autorun: true — starts processing on boot
// ---------------------------------------------------------------------------

const worker = new Worker(
  "publish",
  async (job) => {
    return processPublishJob(job, connection);
  },
  {
    connection,
    concurrency: 5,
    autorun: true,
  }
);

// ---------------------------------------------------------------------------
// C1 GEO Audit Engine worker — queue 'geo-audit'
// Shares the Redis connection; uses its own postgres client (created lazily).
// Concurrency 3: audits fan out to multiple providers, so keep parallelism low.
// ---------------------------------------------------------------------------

let _auditSql: import("postgres").Sql | null = null;
function getAuditSql(): import("postgres").Sql {
  if (_auditSql) return _auditSql;
  // Raw (privileged) client kept as a singleton so shutdown can close it. Per-job
  // RLS scoping is applied by withRlsContext at the call site below.
  _auditSql = createWorkerDb();
  return _auditSql;
}

// ---------------------------------------------------------------------------
// Platform provider-key overrides (admin-rotated) — same mechanism as the api:
// injected into process.env at boot + every 60s, env stays the fallback and a
// missing table is tolerated. Uses the raw (privileged, unscoped) client —
// platform_provider_key has RLS with no policies, so app_user can never read it.
// Note: this makes the audit sql client eager at boot (was lazy) — acceptable,
// the worker needs it for the first audit job anyway.
// ---------------------------------------------------------------------------
const refreshPlatformKeys = (): Promise<number> =>
  applyPlatformKeyOverrides(
    async () => {
      const rows = await getAuditSql()`SELECT provider, key_encrypted FROM platform_provider_key`;
      return rows as unknown as { provider: string; key_encrypted: Buffer | Uint8Array }[];
    },
    (event, meta) => logger.info(event, meta as Record<string, string>)
  );
// The audit worker is the only provider-key consumer here, so it starts with
// autorun:false and begins processing ONLY after the first refresh settles
// (Hermes review: a job must never race a pending key override). The refresh
// fails open (env keys), so `.finally()` guarantees the worker always starts.
const platformKeysReady = refreshPlatformKeys()
  .then((n) => {
    if (n > 0) logger.info("platform_keys_applied", { count: n });
    return n;
  })
  .catch(() => 0);
setInterval(() => {
  void refreshPlatformKeys();
}, 60_000).unref();

const auditWorker = new Worker(
  "geo-audit",
  async (job) => {
    // Wrap the shared audit client so each job's queries run RLS-scoped (app_user).
    return processAuditJob(
      job as Parameters<typeof processAuditJob>[0],
      withRlsContext(getAuditSql())
    );
  },
  {
    connection,
    concurrency: 3,
    autorun: false, // started below, after the first platform-key refresh
  }
);

void platformKeysReady.finally(() => {
  void auditWorker.run();
  logger.info("audit_worker_started_after_key_refresh", {});
});

auditWorker.on("active", (job) => {
  logger.info("audit_job_started", { job_id: job.id, attempt: job.attemptsMade + 1 });
});
auditWorker.on("completed", (job, result) => {
  logger.info("audit_job_succeeded", { job_id: job.id, overall: result?.overall });
});
auditWorker.on("failed", (job, err) => {
  logger.error("audit_job_failed", { job_id: job?.id, message: err?.message });
});

// ---------------------------------------------------------------------------
// Nurture email send loop — polls nurture_enrollment every 5 minutes
// for due, non-suppressed, incomplete enrollments and dispatches step emails.
// Uses a plain setInterval (not a BullMQ queue) since the job is a DB-poll
// pattern, not a queued-payload pattern. Fail-safe: errors are caught and
// logged; the loop continues. Stops on SIGTERM/SIGINT (interval cleared in shutdown).
// ---------------------------------------------------------------------------

let _nurtureSql: import("postgres").Sql | null = null;
function getNurtureSql(): import("postgres").Sql {
  if (_nurtureSql) return _nurtureSql;
  _nurtureSql = createWorkerDb();
  return _nurtureSql;
}

const NURTURE_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const nurtureInterval = setInterval(() => {
  void processNurtureJobs(getNurtureSql()).catch((err: Error) => {
    logger.error("nurture_poll_error", { message: err.message });
  });
}, NURTURE_POLL_INTERVAL_MS);

// Run once immediately at boot (catches any due rows from before restart)
void processNurtureJobs(getNurtureSql()).catch((err: Error) => {
  logger.error("nurture_poll_boot_error", { message: err.message });
});

// ---------------------------------------------------------------------------
// Daily brand monitor loop — enqueues scheduled-audit jobs for brands with
// tracking_frequency='daily' and monitoring_enabled=TRUE.
//
// Uses a separate postgres client (same pattern as _nurtureSql).
// Does NOT replace the weekly BullMQ repeatable jobs — both coexist.
// Graceful fallback: if tracking_frequency column missing (42703) or any
// error, processDailyMonitoredBrands logs a warning and returns without
// crashing the worker.
// ---------------------------------------------------------------------------

let _dailyMonitorSql: import("postgres").Sql | null = null;
function getDailyMonitorSql(): import("postgres").Sql {
  if (_dailyMonitorSql) return _dailyMonitorSql;
  _dailyMonitorSql = createWorkerDb();
  return _dailyMonitorSql;
}

const DAILY_MONITOR_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const dailyMonitorInterval = setInterval(() => {
  void processDailyMonitoredBrands(getDailyMonitorSql()).catch((err: Error) => {
    logger.error("daily_monitor_poll_error", { message: err.message });
  });
}, DAILY_MONITOR_INTERVAL_MS);

// Run once at boot (catches brands due from before restart)
void processDailyMonitoredBrands(getDailyMonitorSql()).catch((err: Error) => {
  logger.error("daily_monitor_boot_error", { message: err.message });
});

// ---------------------------------------------------------------------------
// Worker event listeners for structured logging
// ---------------------------------------------------------------------------

worker.on("active", (job) => {
  logger.info("job_started", {
    job_id: job.id,
    publish_job_id: job.data?.publish_job_id,
    attempt: job.attemptsMade + 1,
  });
});

worker.on("completed", (job, result) => {
  logger.info("job_succeeded", {
    job_id: job.id,
    publish_job_id: job.data?.publish_job_id,
    platform: result?.platform,
    post_id: result?.post_id,
  });
});

worker.on("failed", (job, err) => {
  logger.error("job_failed", {
    job_id: job?.id,
    publish_job_id: job?.data?.publish_job_id,
    attempt: (job?.attemptsMade ?? 0) + 1,
    // Error message sanitized by processPublishJob; this is the BullMQ-level log
    error_message: err?.message?.slice(0, 200),
    // No tokens logged here — sanitized in processor
  });
});

worker.on("error", (err) => {
  logger.error("worker_error", { message: err.message });
});

// ---------------------------------------------------------------------------
// Startup log
// ---------------------------------------------------------------------------

logger.info("worker_started", {
  queue: "publish",
  concurrency: 5,
  redis_url_host: REDIS_URL.replace(/:[^:@]*@/, ":***@"), // mask password if in URL
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// Stop accepting new jobs → wait for in-flight → close connections
// ---------------------------------------------------------------------------

const shutdown = async (signal: string): Promise<void> => {
  logger.info("worker_shutdown", { signal });

  // Stop the nurture poll loop immediately
  clearInterval(nurtureInterval);
  // Stop the daily brand monitor loop
  clearInterval(dailyMonitorInterval);

  try {
    // Close workers — waits for in-flight jobs to complete
    await worker.close();
    await auditWorker.close();
  } catch (err) {
    logger.error("worker_shutdown_error", {
      message: (err as Error).message,
    });
  }

  try {
    if (_auditSql) await _auditSql.end({ timeout: 5 });
  } catch {
    // Best-effort
  }

  try {
    if (_nurtureSql) await _nurtureSql.end({ timeout: 5 }).catch(() => {});
  } catch {
    // Best-effort
  }

  try {
    if (_dailyMonitorSql) await _dailyMonitorSql.end({ timeout: 5 }).catch(() => {});
  } catch {
    // Best-effort
  }

  try {
    await connection.quit();
  } catch {
    // Best-effort
  }

  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Runtime RLS guard (parity with the API — apps/api/src/db/client.ts).
//
// Tenant isolation in every job rests on dropping into the non-privileged
// app_user role. If that role is missing / over-privileged, or the worker's
// login role can't assume it, RLS would be SILENTLY off — refuse to keep
// processing rather than risk a cross-tenant leak. Verified once, at boot.
// ---------------------------------------------------------------------------

const rlsGuardSql = createWorkerDb();
void assertWorkerAppDbRoleSafe(rlsGuardSql)
  .then(() =>
    logger.info("worker_rls_role_verified", {
      role: process.env["APP_DB_ROLE"] ?? "app_user",
    })
  )
  .catch((err: Error) => {
    logger.error("worker_rls_role_assertion_failed", { message: err.message });
    void shutdown("RLS_ASSERTION_FAILED");
  })
  .finally(() => {
    void rlsGuardSql.end({ timeout: 5 }).catch(() => {});
  });
