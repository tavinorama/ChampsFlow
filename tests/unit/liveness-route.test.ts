/**
 * GET /api/v1/agent-org/liveness — the agent-org's public pulse (R9/C10).
 *
 * The 18-20/08 lesson: the starvation alarm lives inside the graph tick, so a
 * dead worker never reports its own death. The CI vigia (agent-org-liveness.yml)
 * curls this route every 30 min; these tests pin the route's whole contract:
 *  - three fields, exactly: last_tick_at, running_runs, newest_step_at;
 *  - NO auth: the request carries no Authorization header and still gets 200;
 *  - fail-open: Redis down → last_tick_at null; DB down → the two DB fields
 *    null — ALWAYS HTTP 200. The vigia decides to scream, never this route
 *    (a 500 here would let a half-dead stack hide behind a transport error).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Controllable shared-redis: each test decides whether Redis exists, answers,
// or throws.
const h = vi.hoisted(() => ({
  redisGet: vi.fn<() => Promise<string | null>>(),
  redisAvailable: true,
}));
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () => (h.redisAvailable ? { get: h.redisGet } : null),
  getSharedRedis: () => {
    throw new Error("not used by this route");
  },
}));

import { registerLivenessRoutes } from "../../apps/api/src/routes/liveness";
import type { PostgresClient } from "../../packages/shared/src/db-client";

const TICK_ISO = "2026-08-22T10:40:00.000Z";
const STEP_TS = "2026-08-22 10:35:12.5+00";

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerLivenessRoutes(app, db);
  return app;
}

const healthyDb = {
  async query() {
    return { rows: [{ running_runs: "3", newest_step_at: STEP_TS }] };
  },
} as unknown as PostgresClient;

const deadDb = {
  async query() {
    throw new Error("connection refused");
  },
} as unknown as PostgresClient;

beforeEach(() => {
  h.redisGet.mockReset();
  h.redisAvailable = true;
});

describe("GET /api/v1/agent-org/liveness", () => {
  it("healthy stack → the three fields, live values, 200, no auth header needed", async () => {
    h.redisGet.mockResolvedValue(TICK_ISO);
    const res = await appWith(healthyDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // The exact contract the CI vigia parses — three fields, nothing else.
    expect(body).toEqual({
      last_tick_at: TICK_ISO,
      running_runs: 3,
      newest_step_at: STEP_TS,
    });
  });

  it("fail-open: Redis AND DB down → every field null, STILL 200 (the vigia screams, not the route)", async () => {
    h.redisGet.mockRejectedValue(new Error("redis down"));
    const res = await appWith(deadDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      last_tick_at: null,
      running_runs: null,
      newest_step_at: null,
    });
  });

  it("fail-open, halves independent: no REDIS_URL at all → last_tick_at null, DB fields still live", async () => {
    h.redisAvailable = false;
    const res = await appWith(healthyDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      last_tick_at: null,
      running_runs: 3,
      newest_step_at: STEP_TS,
    });
  });

  it("idle-but-alive org: tick fresh, zero running runs, no steps yet → honest zeros/nulls, 200", async () => {
    h.redisGet.mockResolvedValue(TICK_ISO);
    const idleDb = {
      async query() {
        return { rows: [{ running_runs: "0", newest_step_at: null }] };
      },
    } as unknown as PostgresClient;
    const res = await appWith(idleDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      last_tick_at: TICK_ISO,
      running_runs: 0,
      newest_step_at: null,
    });
  });
});
