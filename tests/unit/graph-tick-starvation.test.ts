/**
 * Tick starvation — the 18-20/08 production freeze, pinned so it cannot
 * happen again.
 *
 * The incident: the old tick selected the 5 OLDEST 'running' runs
 * (LIMIT MAX_RUNS_PER_TICK) and the 5 oldest were permanently PARKED
 * (4 daily-video approvals with no timeout + 1 harvest waiting on a mute
 * metric). Everything behind them — 26 runs, watchdog included — never got a
 * single step for three days, and nothing screamed.
 *
 * The fix, proven here through a fake sql routed by the queries' own
 * markers (same pattern as sphere-approvals-valve.test.ts):
 *  - two pools: parked runs (waiting frontier) NEVER consume an execution
 *    slot, but still get a cheap re-check every tick;
 *  - healthy queue unchanged: oldest advanceable first, cap respected;
 *  - zero-step runs older than 24h reconciled as failed ("starved: ...")
 *    with ONE consolidated Telegram line;
 *  - a starvation alarm (zero-step run >2h) rate-limited via Redis to
 *    once per 24h.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import {
  runGraphTick,
  STARVED_RUN_HOURS,
  STARVED_SUMMARY,
} from "../../apps/worker/src/jobs/graph-tick";
import type { GraphRunnerPorts, AdvanceResult, GraphDefinition } from "../../apps/api/src/lib/graph-runner";

interface TickRun {
  id: string;
  graph: string;
  /** Hours since started_at — bigger = older. */
  ageHours: number;
  status: "running" | "failed" | "succeeded";
  /** True = the run has NO agent_step rows at all (never picked up). */
  zeroSteps: boolean;
  /** True = the run has a step with status 'waiting' (parked frontier). */
  hasWaiting: boolean;
}

/**
 * Fake postgres client routed on the /* tick:* *\/ markers each query carries.
 * Emulates the documented SQL semantics over an in-memory run list, honoring
 * the LIMIT parameter the tick passes, so the test pins the tick's USE of the
 * two pools (order, caps, disjointness), not the SQL engine.
 */
function makeTickWorld(
  runs: TickRun[],
  pendingApprovals: Array<{ id: string; run_id: string; graph: string; node: string; started_at: string }> = []
) {
  const insertedSteps: Array<{ runId: string; summary: string }> = [];
  const telegrams: string[] = [];
  const telegramButtons: Array<Array<{ text: string; data: string }>> = [];
  const advanced: Array<{ graph: string; runId: string }> = [];
  let redisNxFree = true;

  const oldestFirst = () => [...runs].sort((a, b) => b.ageHours - a.ageHours);

  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("tick:starved-select")) {
      return oldestFirst()
        .filter((r) => r.status === "running" && r.zeroSteps && r.ageHours > STARVED_RUN_HOURS)
        .map(({ id, graph }) => ({ id, graph }));
    }
    if (text.includes("tick:starved-step")) {
      const summary = String(values[0]);
      for (const id of values[1] as string[]) insertedSteps.push({ runId: id, summary });
      return [];
    }
    if (text.includes("tick:starved-fail")) {
      const ids = values[0] as string[];
      for (const r of runs) if (ids.includes(r.id)) r.status = "failed";
      return [];
    }
    if (text.includes("tick:starvation-alarm")) {
      return oldestFirst()
        .filter((r) => r.status === "running" && r.zeroSteps && r.ageHours > 2)
        .slice(0, 50)
        .map(({ id, graph }) => ({ id, graph, started_at: "2026-08-18T08:00:00Z" }));
    }
    if (text.includes("tick:exec-pool")) {
      const limit = Number(values[1]);
      return oldestFirst()
        .filter((r) => r.status === "running" && !r.hasWaiting)
        .slice(0, limit)
        .map(({ id, graph }) => ({ id, graph }));
    }
    if (text.includes("tick:renotify-select")) {
      return pendingApprovals;
    }
    if (text.includes("tick:parked-pool")) {
      const limit = Number(values[1]);
      return oldestFirst()
        .filter((r) => r.status === "running" && r.hasWaiting)
        .slice(0, limit)
        .map(({ id, graph }) => ({ id, graph }));
    }
    throw new Error(`unrouted query in fake sql: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;

  const redis = {
    set: async () => {
      if (redisNxFree) {
        redisNxFree = false;
        return "OK";
      }
      return null;
    },
    get: async () => "POST FINAL: A honest draft about GEO.",
  } as unknown as Redis;

  const advance = async (def: GraphDefinition, runId: string): Promise<AdvanceResult> => {
    advanced.push({ graph: def.slug, runId });
    return { status: "in-flight", started: [], notes: [] };
  };

  const tick = () =>
    runGraphTick(sql, redis, {
      hermesToken: "test-token",
      advance,
      ports: {} as GraphRunnerPorts,
      telegram: async (t: string, buttons?: Array<{ text: string; data: string }>) => {
        telegrams.push(t);
        if (buttons) telegramButtons.push(buttons);
      },
    });

  return { runs, insertedSteps, telegrams, telegramButtons, advanced, tick };
}

describe("two-pool selection — a parked run never eats an execution slot", () => {
  it("THE incident shape: 5 oldest runs parked forever, 1 advanceable behind them — the advanceable one ADVANCES", async () => {
    const world = makeTickWorld([
      // 4 daily-video runs stuck on founder-approval + 1 experiment on harvest
      // — the exact 5 that consumed every slot of every tick for 3 days.
      { id: "park-1", graph: "daily-video", ageHours: 160, status: "running", zeroSteps: false, hasWaiting: true },
      { id: "park-2", graph: "daily-video", ageHours: 140, status: "running", zeroSteps: false, hasWaiting: true },
      { id: "park-3", graph: "daily-video", ageHours: 120, status: "running", zeroSteps: false, hasWaiting: true },
      { id: "park-4", graph: "daily-video", ageHours: 100, status: "running", zeroSteps: false, hasWaiting: true },
      { id: "park-5", graph: "content-experiment", ageHours: 90, status: "running", zeroSteps: false, hasWaiting: true },
      // The starved victim: a fresh watchdog behind all five.
      { id: "victim", graph: "daily-watchdog", ageHours: 1, status: "running", zeroSteps: true, hasWaiting: false },
    ]);

    const res = await world.tick();

    // The younger advanceable run got an EXEC slot despite 5 older parked runs.
    const exec = res.results.filter((r) => r.pool === "exec");
    expect(exec.map((r) => r.runId)).toEqual(["victim"]);
    expect(res.advanced).toBe(1);
    // The parked five were STILL re-checked (timers/timeouts/harvest polls).
    const parked = res.results.filter((r) => r.pool === "parked");
    expect(parked.map((r) => r.runId).sort()).toEqual(["park-1", "park-2", "park-3", "park-4", "park-5"]);
    expect(res.parkedChecked).toBe(5);
    // Every run was visited exactly once — the pools are disjoint.
    expect(world.advanced).toHaveLength(6);
  });

  it("parked runs alone still get their cheap re-check every tick", async () => {
    const world = makeTickWorld([
      { id: "p1", graph: "daily-video", ageHours: 50, status: "running", zeroSteps: false, hasWaiting: true },
      { id: "p2", graph: "sphere-x", ageHours: 40, status: "running", zeroSteps: false, hasWaiting: true },
    ]);
    const res = await world.tick();
    expect(res.advanced).toBe(0);
    expect(res.parkedChecked).toBe(2);
    expect(world.advanced.map((a) => a.runId)).toEqual(["p1", "p2"]);
  });

  it("healthy queue unchanged: oldest advanceable first, cap of 5 respected, no alarms", async () => {
    const world = makeTickWorld(
      [70, 60, 50, 40, 30, 20, 10].map((age, i) => ({
        id: `run-${age}h`,
        graph: i % 2 === 0 ? "daily-video" : "sphere-x",
        ageHours: age,
        status: "running" as const,
        zeroSteps: false,
        hasWaiting: false,
      }))
    );
    const res = await world.tick();

    // Exactly the old behavior: 5 slots, oldest first, in order.
    expect(res.advanced).toBe(5);
    expect(res.parkedChecked).toBe(0);
    expect(res.starvedFailed).toBe(0);
    expect(world.advanced.map((a) => a.runId)).toEqual([
      "run-70h",
      "run-60h",
      "run-50h",
      "run-40h",
      "run-30h",
    ]);
    // A healthy queue makes no noise.
    expect(world.telegrams).toEqual([]);
  });
});

describe("starved-run reconciliation — the 18-20/08 backlog clears itself on deploy", () => {
  it("zero-step runs older than 24h are failed with the starved summary and ONE consolidated Telegram line", async () => {
    const world = makeTickWorld([
      { id: "s1", graph: "daily-watchdog", ageHours: 72, status: "running", zeroSteps: true, hasWaiting: false },
      { id: "s2", graph: "daily-watchdog", ageHours: 48, status: "running", zeroSteps: true, hasWaiting: false },
      { id: "s3", graph: "sphere-x", ageHours: 30, status: "running", zeroSteps: true, hasWaiting: false },
      // A healthy young run keeps advancing normally.
      { id: "ok", graph: "daily-video", ageHours: 1, status: "running", zeroSteps: false, hasWaiting: false },
    ]);
    const res = await world.tick();

    expect(res.starvedFailed).toBe(3);
    // Each starved run got an auditable failed step with the honest summary…
    expect(world.insertedSteps).toHaveLength(3);
    for (const s of world.insertedSteps) expect(s.summary).toBe(STARVED_SUMMARY);
    // …and the run itself is failed — so it never reaches an execution pool
    // and never burns LLM money on a 3-day-old briefing.
    for (const id of ["s1", "s2", "s3"]) {
      expect(world.runs.find((r) => r.id === id)!.status).toBe("failed");
      expect(world.advanced.some((a) => a.runId === id)).toBe(false);
    }
    // ONE consolidated message, count per graph — not 26 messages.
    const recon = world.telegrams.filter((t) => t.includes("RECONCILIAÇÃO"));
    expect(recon).toHaveLength(1);
    expect(recon[0]).toContain("3 run(s)");
    expect(recon[0]).toContain("daily-watchdog×2");
    expect(recon[0]).toContain("sphere-x×1");
    // The healthy run still advanced.
    expect(world.advanced.map((a) => a.runId)).toEqual(["ok"]);
  });

  it("a zero-step run YOUNGER than 24h is not reconciled — it is simply still queued", async () => {
    const world = makeTickWorld([
      { id: "young", graph: "daily-watchdog", ageHours: 1, status: "running", zeroSteps: true, hasWaiting: false },
    ]);
    const res = await world.tick();
    expect(res.starvedFailed).toBe(0);
    expect(world.insertedSteps).toEqual([]);
    // …it gets an exec slot instead.
    expect(world.advanced.map((a) => a.runId)).toEqual(["young"]);
  });
});

describe("starvation alarm — hunger screams, once per 24h", () => {
  it("a zero-step run older than 2h fires ONE alarm naming count and oldest; the Redis NX key rate-limits repeats", async () => {
    const world = makeTickWorld([
      { id: "h1", graph: "daily-watchdog", ageHours: 3, status: "running", zeroSteps: true, hasWaiting: false },
      { id: "h2", graph: "sphere-x", ageHours: 4, status: "running", zeroSteps: true, hasWaiting: false },
    ]);

    await world.tick();
    const alarms = world.telegrams.filter((t) => t.includes("FOME NO SCHEDULER"));
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toContain("2 run(s)");
    // Oldest first: h2 (4h) is named.
    expect(alarms[0]).toContain("sphere-x");

    // Second tick, same hunger: the NX key is taken — no second alarm today.
    await world.tick();
    expect(world.telegrams.filter((t) => t.includes("FOME NO SCHEDULER"))).toHaveLength(1);
  });

  it("no zero-step runs → no alarm, no Redis traffic needed", async () => {
    const world = makeTickWorld([
      { id: "ok", graph: "daily-video", ageHours: 90, status: "running", zeroSteps: false, hasWaiting: true },
    ]);
    await world.tick();
    expect(world.telegrams.filter((t) => t.includes("FOME"))).toEqual([]);
  });
});

describe("approval re-notify — a 3am decision request must come back with buttons", () => {
  const APPROVAL = {
    id: "step-appr-1",
    run_id: "run-1",
    graph: "sphere-x",
    node: "approval",
    started_at: "2026-08-21T02:00:00Z",
  };

  it("re-sends a pending approval with fresh ap:/rj: buttons and a content preview", async () => {
    const world = makeTickWorld([], [APPROVAL]);
    await world.tick();
    const msg = world.telegrams.find((t) => t.includes("APROVAÇÃO PENDENTE"));
    expect(msg).toBeTruthy();
    expect(msg).toContain("sphere-x");
    expect(msg).toContain("POST FINAL: A honest draft about GEO.");
    expect(world.telegramButtons[0]).toEqual([
      { text: "✅ Aprovar", data: `ap:${APPROVAL.id}` },
      { text: "❌ Rejeitar", data: `rj:${APPROVAL.id}` },
    ]);
  });

  it("at most once per 24h per step: the Redis NX gate blocks the second send", async () => {
    const world = makeTickWorld([], [APPROVAL, { ...APPROVAL, id: "step-appr-2" }]);
    await world.tick();
    // The fake redis grants exactly ONE NX slot — only the first approval
    // re-notifies; the second is silently gated, no spam.
    expect(world.telegrams.filter((t) => t.includes("APROVAÇÃO PENDENTE"))).toHaveLength(1);
  });
});
