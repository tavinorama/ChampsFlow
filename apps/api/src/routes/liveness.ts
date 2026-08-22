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

/** Same key the worker stamps at the end of every completed graph tick. */
export const GRAPHTICK_LAST_OK_KEY = "graphtick:last_ok";

export function registerLivenessRoutes(app: Hono, db: PostgresClient): void {
  // GET /api/v1/agent-org/liveness — PUBLIC, read-only, fail-open.
  app.get("/api/v1/agent-org/liveness", async (c) => {
    let lastTickAt: string | null = null;
    try {
      const redis = tryGetSharedRedis();
      lastTickAt = redis ? await redis.get(GRAPHTICK_LAST_OK_KEY) : null;
    } catch (err) {
      // Redis down → null field, 200 anyway; the CI vigia treats null as stale.
      logger.warn("liveness_redis_unavailable", { message: (err as Error).message?.slice(0, 120) });
      lastTickAt = null;
    }

    let runningRuns: number | null = null;
    let newestStepAt: string | null = null;
    try {
      const { rows } = await db.query<{ running_runs: string; newest_step_at: string | null }>(
        `SELECT (SELECT COUNT(*) FROM ops.agent_run WHERE status = 'running')::text AS running_runs,
                (SELECT MAX(started_at) FROM ops.agent_step)::text AS newest_step_at`
      );
      if (rows[0]) {
        runningRuns = Number(rows[0].running_runs);
        newestStepAt = rows[0].newest_step_at ?? null;
      }
    } catch (err) {
      // DB down → null fields, 200 anyway (fail-open; the vigia screams).
      logger.warn("liveness_db_unavailable", { message: (err as Error).message?.slice(0, 120) });
    }

    return c.json({
      last_tick_at: lastTickAt,
      running_runs: runningRuns,
      newest_step_at: newestStepAt,
    });
  });
}
