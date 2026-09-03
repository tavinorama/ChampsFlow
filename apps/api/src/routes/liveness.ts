/**
 * liveness.ts — the agent-org's pulse, readable from OUTSIDE the org.
 *
 * R9/C10, the 18-20/08 lesson: the starvation alarm lives INSIDE the graph
 * tick, so a dead worker can never report its own death (o vigia morreu dentro
 * do motor). This route is the half of the fix that lives in the API: a
 * PUBLIC, read-only, PII-free snapshot of three facts —
 *
 *   { last_tick_at:   ISO of the last completed runGraphTick
 *                     (Redis 'graphtick:last_ok', stamped by the worker),
 *     running_runs:   COUNT(*) of ops.agent_run WHERE status = 'running',
 *     newest_step_at: MAX(started_at) of ops.agent_step }
 *
 * The OTHER half is .github/workflows/agent-org-liveness.yml: a CI cron curls
 * this route every 30 min and screams (red job + Telegram) when the pulse is
 * stale. Division of labour is deliberate: this route only REPORTS — it is
 * fail-open (Redis or DB down → the field is null, still HTTP 200) because
 * the vigia is the one who decides to scream, and a 500 here would let a
 * half-dead stack hide behind a transport error.
 *
 * No auth on purpose: the payload is company-operations aggregates (a
 * timestamp and a count — no tenant data, no PII, no secrets), and the CI
 * watcher must never depend on a key that can expire in a drawer.
 */

import type { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { tryGetSharedRedis } from "../shared-redis";
import { CIRCUIT_BREAKER_THRESHOLD } from "../lib/graph-runner";
import { publicRateLimit } from "../lib/public-rate-limit";

/** Same key the worker stamps at the end of every completed graph tick. */
export const GRAPHTICK_LAST_OK_KEY = "graphtick:last_ok";

/** Stamped by the worker's graphWorker completed handler (10.B.15). */
export const GRAPHTICK_LAST_FAILURES_KEY = "graphtick:last_failures";

/**
 * Queues whose completion pulse (queue:<name>:last_ok, stamped by
 * apps/worker/src/queue-pulse.ts) this route surfaces. Split matters for the
 * vigia: SCHEDULED queues have a cadence, so a stale pulse is an alarm;
 * EVENT-DRIVEN queues fire only when there is work, so silence is healthy —
 * they are shown but never alarmed on (24/08 first-night lesson).
 */
export const LIVENESS_SCHEDULED_QUEUES = [
  "agent-graph", // */10 min tick
  "nurture", // 5-min poll loop
  "followup-scan", // */30 min
  "sphere-start", // daily 09:00 UTC
  "video-daily", // daily 13:00 + 19:00 absence check
  "brain-daily", // daily 06:30 UTC
] as const;

export const LIVENESS_EVENT_QUEUES = [
  "publish",
  "geo-audit",
  "geo-drift",
  "landing-generate",
  "monitor-reconcile",
] as const;

const ALL_LIVENESS_QUEUES: readonly string[] = [
  ...LIVENESS_SCHEDULED_QUEUES,
  ...LIVENESS_EVENT_QUEUES,
];

export function registerLivenessRoutes(app: Hono, db: PostgresClient): void {
  // GET /api/v1/agent-org/liveness — PUBLIC, read-only, fail-open.
  app.get("/api/v1/agent-org/liveness", async (c) => {
    // 10.B.9 — light cap: the route does a Redis SCAN + a DB aggregate per
    // hit. The CI vigia calls it twice an hour; 120/10min per IP is invisible
    // to legitimate use and stops a curl loop from farming DB work.
    const limited = await publicRateLimit(c, {
      bucket: "liveness",
      limit: 120,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;
    let lastTickAt: string | null = null;
    let lastTickFailures: number | null = null;
    const queues: Record<string, string | null> = {};
    for (const name of ALL_LIVENESS_QUEUES) queues[name] = null;
    let circuitOpen: number | null = null;
    let circuitOpenChannels: string[] = [];
    try {
      const redis = tryGetSharedRedis();
      lastTickAt = redis ? await redis.get(GRAPHTICK_LAST_OK_KEY) : null;
      if (redis) {
        // 10.B.15 — the rest of the pulse map. Same fail-open contract: any
        // sub-read failing leaves its field null; the vigia decides to scream.
        const rawFailures = await redis.get(GRAPHTICK_LAST_FAILURES_KEY);
        lastTickFailures = rawFailures != null ? Number(rawFailures) : null;
        if (lastTickFailures != null && !Number.isFinite(lastTickFailures)) lastTickFailures = null;

        await Promise.all(
          ALL_LIVENESS_QUEUES.map(async (name) => {
            queues[name] = await redis.get(`queue:${name}:last_ok`).catch(() => null);
          })
        );

        // Circuit breakers (5.F.6): circuit:<channel> holds the consecutive
        // publish-failure count; >= threshold means the channel is parked.
        // circuit:alarm:* keys are the NX alarm gates — not breakers.
        const keys = (await redis.scanKeys("circuit:*")).filter(
          (k) => !k.startsWith("circuit:alarm:")
        );
        const counts = await Promise.all(
          keys.map(async (k) => ({ k, v: Number((await redis.get(k)) ?? 0) || 0 }))
        );
        circuitOpenChannels = counts
          .filter((c) => c.v >= CIRCUIT_BREAKER_THRESHOLD)
          .map((c) => c.k.slice("circuit:".length));
        circuitOpen = circuitOpenChannels.length;
      }
    } catch (err) {
      // Redis down → null field, 200 anyway; the CI vigia treats null as stale.
      logger.warn("liveness_redis_unavailable", { message: (err as Error).message?.slice(0, 120) });
      lastTickAt = null;
    }

    let runningRuns: number | null = null;
    let advanceableRuns: number | null = null;
    let parkedRuns: number | null = null;
    let newestStepAt: string | null = null;
    try {
      // 24/08, first night on watch: 6 false alarms. All 6 'running' runs sat
      // at wait-72h — published, waiting to harvest. A parked run creates no
      // steps for HOURS and that is a healthy quiet night, so "running > 0 and
      // steps stale" cannot alarm by itself. Split the count with the SAME
      // waiting-frontier predicate the tick's two-pool selector uses: the
      // vigia alarms on ADVANCEABLE runs going nowhere, never on parked ones.
      const { rows } = await db.query<{
        running_runs: string;
        advanceable_runs: string;
        newest_step_at: string | null;
      }>(
        `SELECT (SELECT COUNT(*) FROM ops.agent_run WHERE status = 'running')::text AS running_runs,
                (SELECT COUNT(*) FROM ops.agent_run r
                  WHERE r.status = 'running'
                    AND NOT EXISTS (SELECT 1 FROM ops.agent_step s
                                     WHERE s.run_id = r.id AND s.status = 'waiting'))::text AS advanceable_runs,
                (SELECT MAX(started_at) FROM ops.agent_step)::text AS newest_step_at`
      );
      if (rows[0]) {
        runningRuns = Number(rows[0].running_runs);
        advanceableRuns = Number(rows[0].advanceable_runs);
        parkedRuns = runningRuns - advanceableRuns;
        newestStepAt = rows[0].newest_step_at ?? null;
      }
    } catch (err) {
      // DB down → null fields, 200 anyway (fail-open; the vigia screams).
      logger.warn("liveness_db_unavailable", { message: (err as Error).message?.slice(0, 120) });
    }

    return c.json({
      last_tick_at: lastTickAt,
      running_runs: runningRuns,
      /** Runs the tick can actually move — the only ones whose silence is bad. */
      advanceable_runs: advanceableRuns,
      /** Runs parked on wait/harvest/approval — silent for hours BY DESIGN. */
      parked_runs: parkedRuns,
      newest_step_at: newestStepAt,
      /** 10.B.15 — "vivo ≠ funcionando": failures inside the LAST completed tick. */
      last_tick_failures: lastTickFailures,
      /** queue:<name>:last_ok pulses (worker queue-pulse.ts); null = never/Redis down. */
      queues,
      /** Postiz circuit breakers currently open (count + channel names, no PII). */
      circuit_open: circuitOpen,
      circuit_open_channels: circuitOpenChannels,
    });
  });
}
