/**
 * GET /api/v1/agent-org/liveness — the agent-org's public pulse (R9/C10).
 *
 * The 18-20/08 lesson: the starvation alarm lives inside the graph tick, so a
 * dead worker never reports its own death. The CI vigia (agent-org-liveness.yml)
 * curls this route every 30 min; these tests pin the route's whole contract:
 *  - core fields: last_tick_at, running_runs, advanceable_runs, parked_runs,
 *    newest_step_at (advanceable/parked split added 24/08 after 6 false alarms
 *    on the first night: parked wait-72h runs are silent BY DESIGN);
 *  - 10.B.15 fields: last_tick_failures ("vivo ≠ funcionando"), the
 *    queue:<name>:last_ok pulse map, and circuit_open (+ channel names);
 *  - NO auth: the request carries no Authorization header and still gets 200;
 *  - fail-open: Redis down → Redis-backed fields null; DB down → DB fields
 *    null — ALWAYS HTTP 200. The vigia decides to scream, never this route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Controllable shared-redis: each test decides whether Redis exists, what each
// key holds, and which circuit:* keys exist.
const h = vi.hoisted(() => ({
  redisAvailable: true,
  /** When set, the tick-key read rejects (whole Redis half fails open). */
  tickRejects: false,
  store: new Map<string, string>(),
  circuitKeys: [] as string[],
}));
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () =>
    h.redisAvailable
      ? {
          async get(key: string) {
            if (h.tickRejects && key === "graphtick:last_ok") throw new Error("redis down");
            return h.store.get(key) ?? null;
          },
          async scanKeys(_pattern: string) {
            return h.circuitKeys;
          },
        }
      : null,
  getSharedRedis: () => {
    throw new Error("not used by this route");
  },
}));

import {
  registerLivenessRoutes,
  LIVENESS_SCHEDULED_QUEUES,
  LIVENESS_EVENT_QUEUES,
} from "../../apps/api/src/routes/liveness";
import type { PostgresClient } from "../../packages/shared/src/db-client";

const TICK_ISO = "2026-08-22T10:40:00.000Z";
const STEP_TS = "2026-08-22 10:35:12.5+00";

const ALL_QUEUES = [...LIVENESS_SCHEDULED_QUEUES, ...LIVENESS_EVENT_QUEUES];

function nullQueues(overrides: Record<string, string | null> = {}): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const q of ALL_QUEUES) m[q] = null;
  return { ...m, ...overrides };
}

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerLivenessRoutes(app, db);
  return app;
}

const healthyDb = {
  async query() {
    return { rows: [{ running_runs: "3", advanceable_runs: "1", newest_step_at: STEP_TS }] };
  },
} as unknown as PostgresClient;

const deadDb = {
  async query() {
    throw new Error("connection refused");
  },
} as unknown as PostgresClient;

beforeEach(() => {
  h.redisAvailable = true;
  h.tickRejects = false;
  h.store.clear();
  h.circuitKeys = [];
});

describe("GET /api/v1/agent-org/liveness", () => {
  it("healthy stack → full contract: core fields + failures + pulses + circuits, 200, no auth", async () => {
    h.store.set("graphtick:last_ok", TICK_ISO);
    h.store.set("graphtick:last_failures", "2");
    h.store.set("queue:nurture:last_ok", "2026-08-22T10:38:00.000Z");
    h.store.set("queue:publish:last_ok", "2026-08-22T09:00:00.000Z");
    const res = await appWith(healthyDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      last_tick_at: TICK_ISO,
      running_runs: 3,
      advanceable_runs: 1,
      parked_runs: 2,
      newest_step_at: STEP_TS,
      last_tick_failures: 2,
      queues: nullQueues({
        nurture: "2026-08-22T10:38:00.000Z",
        publish: "2026-08-22T09:00:00.000Z",
      }),
      circuit_open: 0,
      circuit_open_channels: [],
    });
  });

  it("counts only circuits at/over the threshold (3), ignoring circuit:alarm:* gates", async () => {
    h.store.set("graphtick:last_ok", TICK_ISO);
    h.circuitKeys = ["circuit:linkedin", "circuit:x", "circuit:alarm:linkedin"];
    h.store.set("circuit:linkedin", "3"); // open
    h.store.set("circuit:x", "1"); // counting, not open
    h.store.set("circuit:alarm:linkedin", "1"); // alarm gate — never a breaker
    const res = await appWith(healthyDb).request("/api/v1/agent-org/liveness");
    const body = (await res.json()) as { circuit_open: number; circuit_open_channels: string[] };
    expect(body.circuit_open).toBe(1);
    expect(body.circuit_open_channels).toEqual(["linkedin"]);
  });

  it("fail-open: Redis AND DB down → every field null, STILL 200 (the vigia screams, not the route)", async () => {
    h.tickRejects = true;
    const res = await appWith(deadDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      last_tick_at: null,
      running_runs: null,
      advanceable_runs: null,
      parked_runs: null,
      newest_step_at: null,
      last_tick_failures: null,
      queues: nullQueues(),
      circuit_open: null,
      circuit_open_channels: [],
    });
  });

  it("fail-open, halves independent: no REDIS_URL at all → Redis fields null, DB fields still live", async () => {
    h.redisAvailable = false;
    const res = await appWith(healthyDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      last_tick_at: null,
      running_runs: 3,
      advanceable_runs: 1,
      parked_runs: 2,
      newest_step_at: STEP_TS,
      last_tick_failures: null,
      queues: nullQueues(),
      circuit_open: null,
      circuit_open_channels: [],
    });
  });

  it("idle-but-alive org: tick fresh, zero running runs, no steps yet → honest zeros/nulls, 200", async () => {
    h.store.set("graphtick:last_ok", TICK_ISO);
    const idleDb = {
      async query() {
        return { rows: [{ running_runs: "0", advanceable_runs: "0", newest_step_at: null }] };
      },
    } as unknown as PostgresClient;
    const res = await appWith(idleDb).request("/api/v1/agent-org/liveness");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["last_tick_at"]).toBe(TICK_ISO);
    expect(body["running_runs"]).toBe(0);
    expect(body["advanceable_runs"]).toBe(0);
    expect(body["parked_runs"]).toBe(0);
    expect(body["newest_step_at"]).toBeNull();
    expect(body["last_tick_failures"]).toBeNull();
    expect(body["queues"]).toEqual(nullQueues());
  });
});
