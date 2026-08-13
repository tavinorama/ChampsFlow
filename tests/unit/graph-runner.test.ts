/**
 * Graph runner (#164 body) — the lifecycle, proven before Hermes ever sees it.
 *
 * The runner core takes ports; these tests wire in-memory fakes and drive the
 * REAL first graph (DAILY_VIDEO_GRAPH, 14 nodes) through:
 *  - the full happy path: signal → ... → approval (parks) → approve →
 *    publish → wait 72h (clock) → harvest (data arrives) → verdict → done;
 *  - fail-fast: one failed angle kills the run and skips the stragglers;
 *  - human rejection: approval finished as 'failed' fails the run;
 *  - honest zero: a harvest that never gets data succeeds at grace with 0.
 *
 * What is deliberately pinned: approval goes through the SAME step-finish
 * door as #445 (the fake approves by finishing the step, exactly like the
 * route does), and the verdict writes an outcome — the loop's closing edge.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  GRAPH_REGISTRY,
  HARVEST_GRACE_HOURS,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  DAILY_DREAM_GRAPH,
  validateGraph,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  outcomes: Array<{ stepId: string; metric: string; valueAfter: number | null }>;
  telegrams: string[];
  published: Array<{ channel: string; post: string }>;
  clock: { now: Date };
  harvestData: { n: number; total: number };
  failTaskWhenPromptIncludes: string | null;
  /** What the substrate.snapshot port returns — the read-only brains' fuel. */
  snapshotText: string;
  /** Records of what the runner asked the substrate to read. */
  snapshotCalls: Array<{ source: string; days: number }>;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(graphSlug: string = DAILY_VIDEO_GRAPH.slug): FakeWorld {
  const clock = { now: new Date("2026-08-12T10:00:00Z") };
  const run: RunRow = {
    id: "run-1",
    graph: graphSlug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const outcomes: FakeWorld["outcomes"] = [];
  const telegrams: string[] = [];
  const published: FakeWorld["published"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: FakeWorld = {
    run,
    steps,
    outcomes,
    telegrams,
    published,
    clock,
    harvestData: { n: 0, total: 0 },
    failTaskWhenPromptIncludes: null,
    snapshotText: "REGISTRO OPERACIONAL (ops.*, 14d):\n- daily-video: 5 runs (4 ok / 1 falha)",
    snapshotCalls: [],
    stepByNode: (node) => [...steps].reverse().find((s) => s.node === node),
    ports: {
      substrate: {
        async getRun() {
          return { ...run };
        },
        async loadSteps() {
          return steps.map((s) => ({ ...s }));
        },
        async startStep(input) {
          const id = `step-${++stepSeq}`;
          steps.push({ id, node: input.node, status: "running", started_at: clock.now.toISOString() });
          return id;
        },
        async finishStep(stepId, input) {
          const s = steps.find((x) => x.id === stepId);
          if (s) {
            s.status = input.status;
            s.summary = input.summary ?? null;
          }
        },
        async finishRun(_runId, status) {
          run.status = status;
        },
        async recordOutcome(input) {
          outcomes.push({ stepId: input.stepId, metric: input.metric, valueAfter: input.valueAfter });
          return `outcome-${outcomes.length}`;
        },
        async readHarvest() {
          return { ...world.harvestData };
        },
        async snapshot(input) {
          world.snapshotCalls.push({ ...input });
          return world.snapshotText;
        },
      },
      hermes: {
        async task(prompt) {
          const needle = world.failTaskWhenPromptIncludes;
          if (needle && prompt.includes(needle)) {
            return { ok: false, output: "engine exploded", engineUsed: "claude", ms: 10 };
          }
          return { ok: true, output: `OUT[${prompt.slice(0, 40)}]`, engineUsed: "claude", ms: 100 };
        },
        async publish(payload) {
          published.push(payload);
          return { ok: true, detail: JSON.stringify({ postiz: { id: "pz-1" } }) };
        },
      },
      artifacts: {
        async get(runId, node) {
          return artifacts.get(`${runId}:${node}`) ?? null;
        },
        async set(runId, node, text) {
          artifacts.set(`${runId}:${node}`, text);
        },
      },
      telegram: async (text) => {
        telegrams.push(text);
      },
      now: () => clock.now,
    },
  };
  return world;
}

async function tick(world: FakeWorld, def: GraphDefinition = DAILY_VIDEO_GRAPH) {
  return advanceRun(def, world.run.id, world.ports);
}

async function tickUntil(
  world: FakeWorld,
  done: () => boolean,
  max = 25,
  def: GraphDefinition = DAILY_VIDEO_GRAPH
): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await tick(world, def);
}

describe("the registry only holds graphs the brain accepts", () => {
  it("every registered graph passes validateGraph", () => {
    for (const def of Object.values(GRAPH_REGISTRY)) {
      const v = validateGraph(def);
      expect(v.errors, def.slug).toEqual([]);
      expect(v.valid).toBe(true);
    }
  });
});

describe("daily-video, the full life", () => {
  it("runs to the approval gate and PARKS — nothing publishes without a human", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");

    expect(world.stepByNode("synthesis")?.status).toBe("succeeded");
    expect(world.stepByNode("founder-approval")?.status).toBe("waiting");
    // Publish must NOT have started while the human is deciding.
    expect(world.stepByNode("publish")).toBeUndefined();
    expect(world.published).toEqual([]);
    // The Telegram ask carries the step id — the #445 finish door.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO"));
    expect(ask).toBeTruthy();
    expect(ask).toContain(world.stepByNode("founder-approval")!.id);
  });

  it("approve → publish → wait elapses → harvest → verdict → run succeeds", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");

    // The human approves through the same door as the #445 route: finish the step.
    const approval = world.stepByNode("founder-approval")!;
    await world.ports.substrate.finishStep(approval.id, { status: "succeeded", summary: "founder: yes" });

    await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting");
    expect(world.published).toHaveLength(1);
    expect(world.published[0]!.post).toContain("OUT[");

    // Time cannot be skipped: a tick before 72h leaves the wait waiting.
    await tick(world);
    expect(world.stepByNode("wait-72h")?.status).toBe("waiting");

    world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
    world.harvestData = { n: 3, total: 250 };
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stepByNode("wait-72h")?.status).toBe("succeeded");
    expect(world.stepByNode("harvest")?.status).toBe("succeeded");
    expect(world.stepByNode("verdict")?.status).toBe("succeeded");
    // The closing edge: the verdict WROTE an outcome with the harvested total.
    expect(world.outcomes).toHaveLength(1);
    expect(world.outcomes[0]!.metric).toBe("yt_views_72h");
    expect(world.outcomes[0]!.valueAfter).toBe(250);
    expect(world.run.status).toBe("succeeded");
    expect(world.telegrams.some((t) => t.includes("VEREDITO"))).toBe(true);
  });

  it("a failed angle fails the run fast and says so on Telegram", async () => {
    const world = makeWorld();
    world.failTaskWhenPromptIncludes = "contrarian"; // angle-b's angle
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("angle-b")?.status).toBe("failed");
    // Nothing downstream of the failure ever started.
    expect(world.stepByNode("synthesis")).toBeUndefined();
    expect(world.published).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("FALHOU"))).toBe(true);
  });

  it("a human rejection (approval finished as failed) fails the run", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");
    const approval = world.stepByNode("founder-approval")!;
    await world.ports.substrate.finishStep(approval.id, { status: "failed", summary: "founder: no" });

    await tickUntil(world, () => world.run.status !== "running");
    expect(world.run.status).toBe("failed");
    expect(world.published).toEqual([]);
  });

  it("a harvest with no data records HONEST ZERO at grace instead of hanging", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");
    await world.ports.substrate.finishStep(world.stepByNode("founder-approval")!.id, { status: "succeeded" });
    await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting");

    world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
    await tickUntil(world, () => world.stepByNode("harvest")?.status === "waiting");
    // No data ever arrives; cross the grace window.
    world.clock.now = new Date(world.clock.now.getTime() + (HARVEST_GRACE_HOURS + 1) * 3_600_000);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stepByNode("harvest")?.status).toBe("succeeded");
    expect(world.stepByNode("harvest")?.summary).toContain("honest zero");
    expect(world.outcomes[0]!.valueAfter).toBe(0);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the Watchdog runs itself — read-only, no publish, no spend", () => {
  it("snapshot → 3 lenses → synthesis → report to the founder, run succeeds", async () => {
    const world = makeWorld(DAILY_WATCHDOG_GRAPH.slug);
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_WATCHDOG_GRAPH);

    // The runner read ops.* — the only DB access these brains get — and passed
    // the digest to the lenses (no engine ever touched the database).
    expect(world.snapshotCalls).toEqual([{ source: "ops", days: 14 }]);
    expect(world.stepByNode("ops-snapshot")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-cost")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-cycle")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-redundancy")?.status).toBe("succeeded");
    expect(world.stepByNode("synthesis")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");

    // Safety by construction: a Watchdog CANNOT publish or spend — no such node
    // exists, and nothing was published.
    expect(world.published).toEqual([]);
    // The proposal reached the founder, tagged as a proposal (nothing executed).
    const report = world.telegrams.find((t) => t.includes("WATCHDOG"));
    expect(report).toBeTruthy();
    expect(report).toContain("nada foi executado");
    expect(world.run.status).toBe("succeeded");
  });

  it("an empty ops record does not crash the Watchdog — the digest is honest-empty", async () => {
    const world = makeWorld(DAILY_WATCHDOG_GRAPH.slug);
    world.snapshotText = ""; // no data at all
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_WATCHDOG_GRAPH);

    // Honest-empty snapshot still SUCCEEDS (the runner marks "SEM DADOS"), so
    // the lenses reason over "no data" instead of the run hanging.
    expect(world.stepByNode("ops-snapshot")?.status).toBe("succeeded");
    expect(world.stepByNode("ops-snapshot")?.summary).toContain("empty");
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the Chief Dreaming Officer runs itself — grounded in the real harvest", () => {
  it("reads agent_outcome (30d), imagines 10x through 3 lenses, reports the bets", async () => {
    const world = makeWorld(DAILY_DREAM_GRAPH.slug);
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_DREAM_GRAPH);

    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30 }]);
    expect(world.stepByNode("outcome-snapshot")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-reach")?.status).toBe("succeeded");
    expect(world.stepByNode("synthesis")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.published).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("DREAMING"))).toBe(true);
    expect(world.run.status).toBe("succeeded");
  });
});
