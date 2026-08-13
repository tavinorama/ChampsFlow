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
import { Queue, Worker } from "bullmq";
import { logger } from "../../../packages/shared/src/logger";
import { driftControlEnabled } from "../../../packages/llm/src/drift-control";
import { processPublishJob } from "./jobs/publish";
import { processAuditJob, processDailyMonitoredBrands } from "./jobs/audit-run";
import { processDriftControlJob } from "./jobs/drift-control";
import { runGraphTick, runBrainDaily } from "./jobs/graph-tick";
import { processLandingGenerateJob } from "./jobs/landing-generate";
import { processNurtureJobs } from "./jobs/nurture-send";
import { reconcileWeeklyMonitoring } from "./jobs/monitor-reconcile";
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
  .catch((err: Error) => {
    // Real DB error — missing table included (broken deploy): run on env keys, loudly.
    logger.error("platform_keys_boot_refresh_failed", { message: err.message?.slice(0, 120) });
    return 0;
  });
setInterval(() => {
  refreshPlatformKeys().catch(() => {
    // Failure already logged at error level inside the shared module.
  });
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
// B4 — anti-drift control battery worker + daily schedule, queue 'geo-drift'.
//
// Runs the known-answer control battery against all 5 engines once a day, so we
// can tell "this brand lost visibility" from "this engine changed". Uses the
// same BullMQ repeatable-job pattern as weekly monitoring (routes/audits.ts:
// stable jobId + repeat.pattern → re-adding is idempotent, no duplicates).
//
// Own postgres client (same lazy pattern as the other loops). Concurrency 1 and
// autorun deferred until the first platform-key refresh settles: the battery
// calls the same provider keys the audits use, and measuring with a stale key
// would record a false "failing" verdict that pauses a healthy engine.
// ---------------------------------------------------------------------------

let _driftSql: import("postgres").Sql | null = null;
function getDriftSql(): import("postgres").Sql {
  if (_driftSql) return _driftSql;
  _driftSql = createWorkerDb();
  return _driftSql;
}

// Unscoped (privileged) client on purpose: engine_drift_check is a platform-
// global, PII-free table with no tenant_id — there is no tenant context to set.
const driftWorker = new Worker(
  "geo-drift",
  async (job) => {
    return processDriftControlJob(
      job as Parameters<typeof processDriftControlJob>[0],
      getDriftSql()
    );
  },
  {
    connection,
    concurrency: 1,
    autorun: false, // started below, after the first platform-key refresh
  }
);

const driftQueue = new Queue("geo-drift", { connection });

// Register the daily schedule at boot. jobId is stable, so a restart re-uses
// the same repeatable job instead of stacking a new one. 03:30 UTC: off-peak,
// and comfortably before the 06:00 UTC weekly monitoring audits — the day's
// audits should read a verdict measured that same morning.
const DRIFT_CRON = process.env["GEO_DRIFT_CRON"] ?? "30 3 * * *";

async function registerDriftSchedule(): Promise<void> {
  const repeatJobId = "drift-control-daily";
  if (!driftControlEnabled()) {
    // Flag off → remove any schedule left over from a previous deploy, so
    // turning the flag off actually stops the spend.
    const repeatables = await driftQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.id === repeatJobId) await driftQueue.removeRepeatableByKey(r.key);
    }
    logger.info("drift_schedule_disabled", { flag: "GEO_DRIFT_CONTROL=0" });
    return;
  }
  await driftQueue.add(
    "drift-control",
    {},
    {
      jobId: repeatJobId,
      repeat: { pattern: DRIFT_CRON },
      removeOnComplete: 30,
      removeOnFail: 30,
    }
  );
  logger.info("drift_schedule_registered", { cron: DRIFT_CRON });
}

void platformKeysReady.finally(() => {
  void driftWorker.run();
  void registerDriftSchedule().catch((err: Error) => {
    // Non-fatal: the worker keeps serving audits without the drift schedule.
    logger.error("drift_schedule_register_failed", { message: err.message?.slice(0, 200) });
  });
});

driftWorker.on("active", (job) => {
  logger.info("drift_job_started", { job_id: job.id, attempt: job.attemptsMade + 1 });
});
driftWorker.on("completed", (job, result) => {
  logger.info("drift_job_succeeded", {
    job_id: job.id,
    engines_checked: (result as { engines_checked?: number } | undefined)?.engines_checked,
    failing: (result as { failing?: string[] } | undefined)?.failing?.join(",") ?? "",
  });
});
driftWorker.on("failed", (job, err) => {
  logger.error("drift_job_failed", { job_id: job?.id, message: err?.message?.slice(0, 200) });
});

// ---------------------------------------------------------------------------
// #164 body — graph orchestrator tick, queue 'agent-graph'.
//
// A repeatable job every 10 minutes advances every in-flight ops.agent_run
// whose graph is registered (GRAPH_REGISTRY). The tick is cheap when idle
// (one SELECT, zero runs) and the runner itself derives all state from the
// substrate, so a worker restart mid-run loses nothing — the next tick
// resumes from the record. Same idempotent repeatable pattern as drift.
// ---------------------------------------------------------------------------

let _graphSql: import("postgres").Sql | null = null;
function getGraphSql(): import("postgres").Sql {
  if (_graphSql) return _graphSql;
  // Unscoped (privileged) on purpose: ops.* is company-operations data,
  // GRANT-gated, with no tenant rows — there is no tenant context to set.
  _graphSql = createWorkerDb();
  return _graphSql;
}

const graphWorker = new Worker(
  "agent-graph",
  async () => runGraphTick(getGraphSql(), connection),
  { connection, concurrency: 1, autorun: false }
);

const graphQueue = new Queue("agent-graph", { connection });
const GRAPH_TICK_CRON = process.env["GRAPH_TICK_CRON"] ?? "*/10 * * * *";

async function registerGraphTickSchedule(): Promise<void> {
  await graphQueue.add(
    "graph-tick",
    {},
    {
      jobId: "graph-tick-repeat",
      repeat: { pattern: GRAPH_TICK_CRON },
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
  logger.info("graph_tick_schedule_registered", { cron: GRAPH_TICK_CRON });
}

// The read-only brains (agent-org core): a once-a-day self-start so the
// Watchdog and the Chief Dreaming Officer are PROACTIVE — a morning report the
// founder never has to trigger. Default 06:30 UTC (~07:30 Lisbon). The daily
// tick starts runs; the */10 graph-tick advances them like any other run.
const brainDailyWorker = new Worker(
  "brain-daily",
  async () => runBrainDaily(getGraphSql()),
  { connection, concurrency: 1, autorun: false }
);
const brainDailyQueue = new Queue("brain-daily", { connection });
const BRAIN_DAILY_CRON = process.env["BRAIN_DAILY_CRON"] ?? "30 6 * * *";

async function registerBrainDailySchedule(): Promise<void> {
  await brainDailyQueue.add(
    "brain-daily",
    {},
    {
      jobId: "brain-daily-repeat",
      repeat: { pattern: BRAIN_DAILY_CRON },
      removeOnComplete: 20,
      removeOnFail: 20,
    }
  );
  logger.info("brain_daily_schedule_registered", { cron: BRAIN_DAILY_CRON });
}

void platformKeysReady.finally(() => {
  void graphWorker.run();
  void brainDailyWorker.run();
  void registerGraphTickSchedule().catch((err: Error) => {
    // Non-fatal for audits — but the orchestrator being off must be visible.
    logger.error("graph_tick_schedule_register_failed", { message: err.message?.slice(0, 200) });
  });
  void registerBrainDailySchedule().catch((err: Error) => {
    logger.error("brain_daily_schedule_register_failed", { message: err.message?.slice(0, 200) });
  });
});

graphWorker.on("completed", (_job, result) => {
  const r = result as { advanced?: number } | undefined;
  if (r?.advanced && r.advanced > 0) {
    logger.info("graph_tick_completed", { advanced: r.advanced });
  }
});
graphWorker.on("failed", (job, err) => {
  logger.error("graph_tick_failed", { job_id: job?.id, message: err?.message?.slice(0, 200) });
});

// ---------------------------------------------------------------------------
// Ozvor Pages generator worker — queue 'landing-generate' (#208 PR-4).
// Own postgres client (created lazily, same pattern as _auditSql); no
// platform-key gating — this queue only ever uses the client's own BYOK key
// or mock mode, never a platform key. Concurrency 5: cheap, mostly template
// work plus at most one narrow LLM call per job.
// ---------------------------------------------------------------------------

let _landingSql: import("postgres").Sql | null = null;
function getLandingSql(): import("postgres").Sql {
  if (_landingSql) return _landingSql;
  _landingSql = createWorkerDb();
  return _landingSql;
}

const landingWorker = new Worker(
  "landing-generate",
  async (job) => {
    return processLandingGenerateJob(
      job as Parameters<typeof processLandingGenerateJob>[0],
      withRlsContext(getLandingSql())
    );
  },
  {
    connection,
    concurrency: 5,
    autorun: true,
  }
);

landingWorker.on("active", (job) => {
  logger.info("landing_generate_job_started", { job_id: job.id, attempt: job.attemptsMade + 1 });
});
landingWorker.on("completed", (job, result) => {
  logger.info("landing_generate_job_succeeded", {
    job_id: job.id,
    pages_written: (result as { pages_written?: number } | undefined)?.pages_written,
    mode: (result as { mode?: string } | undefined)?.mode,
  });
});
landingWorker.on("failed", (job, err) => {
  logger.error("landing_generate_job_failed", { job_id: job?.id, message: err?.message });
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
// Any DB error inside processDailyMonitoredBrands is logged at error level
// and the cycle is skipped without crashing the worker — never silently.
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
// Weekly monitoring reconcile — makes the sold "weekly monitoring" feature
// full-auto. For every brand whose tenant has an ACTIVE paid subscription on a
// plan that includes weekly_monitoring, it ensures monitoring_enabled=TRUE and
// the weekly repeatable ("monitor:${brandId}", "0 6 * * 1") is registered. Fully
// idempotent (see apps/worker/src/jobs/monitor-reconcile.ts) — safe to run every
// week and once at boot.
//
// Wired as a weekly BullMQ repeatable on its own 'monitor-reconcile' queue,
// consumed by a dedicated Worker below. Scheduled for 05:00 Monday — ONE HOUR
// BEFORE the 06:00 audit repeatables it registers — so a paying customer's
// monitoring is enabled in time for that same morning's run. Uses its own raw
// (privileged, RLS-bypassing) client, same pattern as the daily monitor loop.
// ---------------------------------------------------------------------------

let _reconcileSql: import("postgres").Sql | null = null;
function getReconcileSql(): import("postgres").Sql {
  if (_reconcileSql) return _reconcileSql;
  _reconcileSql = createWorkerDb();
  return _reconcileSql;
}

const monitorReconcileQueue = new Queue("monitor-reconcile", { connection });

const monitorReconcileWorker = new Worker(
  "monitor-reconcile",
  async () => {
    await reconcileWeeklyMonitoring(getReconcileSql());
  },
  {
    connection,
    concurrency: 1, // a single cross-tenant sweep — never fan out
    autorun: true,
  }
);

monitorReconcileWorker.on("failed", (job, err) => {
  logger.error("monitor_reconcile_job_failed", { job_id: job?.id, message: err?.message });
});

// Register the weekly repeatable (idempotent — stable jobId + fixed pattern, so
// re-adding on every boot is a no-op). Best-effort: a Redis hiccup here must not
// crash the worker; the boot-time catch-up run below still reconciles.
void monitorReconcileQueue
  .add(
    "weekly-reconcile",
    {},
    { jobId: "monitor-reconcile:weekly", repeat: { pattern: "0 5 * * 1" } } // Monday 05:00 UTC
  )
  .then(() => logger.info("monitor_reconcile_schedule_registered", { pattern: "0 5 * * 1" }))
  .catch((err: Error) => {
    logger.error("monitor_reconcile_schedule_register_failed", { message: err.message });
  });

// Run once at boot so a fresh deploy reconciles immediately instead of waiting
// for the next Monday (catches customers who paid since the last sweep).
void reconcileWeeklyMonitoring(getReconcileSql()).catch((err: Error) => {
  logger.error("monitor_reconcile_boot_error", { message: err.message });
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
    await driftWorker.close();
    await driftQueue.close();
    await landingWorker.close();
    await monitorReconcileWorker.close();
    await monitorReconcileQueue.close();
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
    if (_landingSql) await _landingSql.end({ timeout: 5 });
  } catch {
    // Best-effort
  }

  try {
    if (_driftSql) await _driftSql.end({ timeout: 5 });
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
    if (_reconcileSql) await _reconcileSql.end({ timeout: 5 }).catch(() => {});
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
