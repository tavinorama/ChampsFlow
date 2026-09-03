/**
 * queue-pulse.ts (10.B.15) — every BullMQ worker stamps a Redis pulse on job
 * completion: `queue:<name>:last_ok` = ISO timestamp.
 *
 * Why: the graph tick had a heartbeat (graphtick:last_ok) but every OTHER
 * queue (audits, nurture, publish, landing, drift, ...) could die and nothing
 * would notice — "vivo ≠ funcionando". The liveness route
 * (GET /api/v1/agent-org/liveness) reads these stamps into a `queues` map and
 * the CI vigia (agent-org-liveness.yml) alarms when a SCHEDULED queue's pulse
 * is stale beyond its cadence. Event-driven queues (publish, geo-audit,
 * landing-generate) are informational: quiet is healthy there — the anti-
 * pattern log's first-night-on-watch lesson (24/08) says never alarm on a
 * queue whose silence is by design.
 *
 * Best-effort by contract: a Redis blip must never fail the job that just
 * succeeded. A missing stamp makes the vigia scream — the safe direction.
 */

import type Redis from "ioredis";
import type { Worker } from "bullmq";
import { logger } from "../../../packages/shared/src/logger";

/** 40 days: comfortably longer than any queue's cadence (monthly included). */
const PULSE_TTL_S = 40 * 24 * 3600;

export const queuePulseKey = (name: string): string => `queue:${name}:last_ok`;

/** Stamp `queue:<name>:last_ok` now. Never throws. */
export async function stampQueuePulse(redis: Redis, name: string): Promise<void> {
  try {
    await redis.set(queuePulseKey(name), new Date().toISOString(), "EX", PULSE_TTL_S);
  } catch (err) {
    logger.warn("queue_pulse_stamp_failed", {
      queue: name,
      message: (err as Error).message?.slice(0, 120),
    });
  }
}

/** Attach the completion stamp to a BullMQ worker. */
export function wireQueuePulse(worker: Worker, redis: Redis, name: string): void {
  worker.on("completed", () => {
    void stampQueuePulse(redis, name);
  });
}
