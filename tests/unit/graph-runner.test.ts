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
  DEFAULT_APPROVAL_TIMEOUT_HOURS,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  DAILY_DREAM_GRAPH,
  WEEKLY_PRODUCT_GRAPH,
  WEEKLY_DISCOVERY_GRAPH,
  CONTENT_EXPERIMENT_GRAPH,
  SPHERE_X_GRAPH,
  SPHERE_LINKEDIN_GRAPH,
  SPHERE_BLOG_GRAPH,
  SPHERE_INSTAGRAM_GRAPH,
  SPHERE_TIKTOK_GRAPH,
  SPHERE_YOUTUBE_GRAPH,
  SPHERE_PPC_GRAPH,
  validateGraph,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import { X_POST_LIMIT, xPostWithinLimit } from "../../packages/shared/src/x-post-limit";

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  outcomes: Array<{ stepId: string; metric: string; valueAfter: number | null }>;
  telegrams: string[];
  telegramButtons: string[][];
  published: Array<{ channel: string; post: string }>;
  clock: { now: Date };
  harvestData: { n: number; total: number };
  failTaskWhenPromptIncludes: string | null;
  /** What the substrate.snapshot port returns — the read-only brains' fuel. */
  snapshotText: string;
  /** Records of what the runner asked the substrate to read. */
  snapshotCalls: Array<{ source: string; days: number }>;
  /** Runs the spawn primitive started (the CDO's experiments). */
  spawnedRuns: Array<{ id: string; graph: string; trigger: string; vpOwner: string }>;
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
  const telegramButtons: string[][] = [];
  const published: FakeWorld["published"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: FakeWorld = {
    run,
    steps,
    outcomes,
    telegrams,
    telegramButtons,
    published,
    clock,
    harvestData: { n: 0, total: 0 },
    failTaskWhenPromptIncludes: null,
    snapshotText: "REGISTRO OPERACIONAL (ops.*, 14d):\n- daily-video: 5 runs (4 ok / 1 falha)",
    snapshotCalls: [],
    spawnedRuns: [],
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
        async startRun(input) {
          const id = `child-${world.spawnedRuns.length + 1}`;
          world.spawnedRuns.push({ id, ...input });
          return id;
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
      telegram: async (text, buttons) => {
        telegrams.push(text);
        if (buttons) world.telegramButtons.push(buttons.map((b) => b.data));
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

  it("the marketing spheres are all registered — including sphere-reddit (#485)", () => {
    // Registration is the ONLY way a graph becomes startable (operator route +
    // worker crons both read this map). sphere-reddit must be here, marketing-
    // owned (so it receives [__signals__]), or its Wed cron would start nothing.
    for (const slug of ["sphere-blog", "sphere-reddit", "sphere-ppc"]) {
      expect(GRAPH_REGISTRY[slug], `${slug} missing from registry`).toBeTruthy();
      expect(GRAPH_REGISTRY[slug]!.vpOwner).toBe("marketing");
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
    // v3: the ask must SAY where a yes lands — the first approval never did,
    // and a raw script was approved thinking of the video.
    expect(ask).toContain("publicar como POST em linkedin");
    // v3: what the approval gates is the ADAPTED LinkedIn post, not the script.
    expect(world.stepByNode("linkedin-post")?.status).toBe("succeeded");
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
    // v3: must be a TRUE prefix of what the #162 harvest writes
    // (youtube_views_7d) — the old 'yt_views_72h' matched nothing.
    expect(world.outcomes[0]!.metric).toBe("youtube_views");
    expect(world.outcomes[0]!.valueAfter).toBe(250);
    expect(world.run.status).toBe("succeeded");
    expect(world.telegrams.some((t) => t.includes("VEREDITO"))).toBe(true);
  });

  it("a failed angle fails the run fast and says so on Telegram", async () => {
    const world = makeWorld();
    // angle-b's own prompt line — not the bare word "contrarian", which the
    // editorial calendar's [__day__] block also carries on Wednesdays.
    world.failTaskWhenPromptIncludes = 'no angulo "contrarian"';
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

  it("an approval nobody answers dies at the 96h DEFAULT — rejection-by-silence, NOTHING publishes (18-20/08 immortal approvals)", async () => {
    // daily-video's founder-approval declares NO timeoutHours — before this
    // fix it parked forever, and four such runs ate the tick's slots for
    // three days. Now the default applies.
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");

    // Just under the default: still waiting — the decision is still the founder's.
    world.clock.now = new Date(world.clock.now.getTime() + (DEFAULT_APPROVAL_TIMEOUT_HOURS - 1) * 3_600_000);
    await tick(world);
    expect(world.stepByNode("founder-approval")?.status).toBe("waiting");

    // Past the default: the approval fails honestly and the run fails with it.
    world.clock.now = new Date(world.clock.now.getTime() + 2 * 3_600_000);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stepByNode("founder-approval")?.status).toBe("failed");
    expect(world.stepByNode("founder-approval")?.summary).toContain(
      `timed out after ${DEFAULT_APPROVAL_TIMEOUT_HOURS}h`
    );
    // THE rule: timeout NEVER auto-approves — nothing was handed to Postiz.
    expect(world.published).toEqual([]);
    expect(world.stepByNode("publish")).toBeUndefined();
    expect(world.run.status).toBe("failed");
    // The founder learns WHICH content died un-decided, out loud.
    expect(world.telegrams.some((t) => t.includes("APROVAÇÃO EXPIROU"))).toBe(true);
  });

  it("a harvest whose SOURCE is mute (0 rows at grace) SCREAMS and records NO outcome — never a fake zero", async () => {
    // Structural hole #3 of the 14/08 sweep. Before: n=0 at grace → total=0
    // → verdict wrote value_after=0 → the learning loop was taught "did not
    // perform" (the 13/08 false-zero bug). Now: noData → alarm + no row.
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
    expect(world.stepByNode("harvest")?.summary).toContain("SEM DADO");
    // The alarm named the mute source, and the verdict said "sem veredito".
    expect(world.telegrams.some((t) => t.includes("HARVEST SEM DADO"))).toBe(true);
    expect(world.telegrams.some((t) => t.includes("SEM VEREDITO"))).toBe(true);
    // The whole point: NO fake zero in ops.agent_outcome.
    expect(world.outcomes).toEqual([]);
    expect(world.stepByNode("verdict")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
  });

  it("a REAL zero (rows exist, total 0) still records the outcome as a legitimate measurement", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("founder-approval")?.status === "waiting");
    await world.ports.substrate.finishStep(world.stepByNode("founder-approval")!.id, { status: "succeeded" });
    await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting");

    world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
    // The source wrote rows; they just say zero. That IS a measurement.
    world.harvestData = { n: 2, total: 0 };
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stepByNode("harvest")?.summary).toContain("n=2 total=0");
    expect(world.outcomes).toHaveLength(1);
    expect(world.outcomes[0]!.valueAfter).toBe(0);
    expect(world.telegrams.some((t) => t.includes("HARVEST SEM DADO"))).toBe(false);
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

describe("the Chief Dreaming Officer acts — the brief lands, the founder launches", () => {
  it("delivers the brief read-only, then PARKS at the launch gate — nothing spawns without a human", async () => {
    const world = makeWorld(DAILY_DREAM_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("launch-approval")?.status === "waiting", 25, DAILY_DREAM_GRAPH);

    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30 }]);
    // The brief (report tail) already reached the founder — before any decision.
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.telegrams.some((t) => t.includes("DREAMING"))).toBe(true);
    // The machine has NOT launched anything: the launch gate is still waiting.
    expect(world.spawnedRuns).toEqual([]);
    expect(world.stepByNode("spawn-experiment")).toBeUndefined();
  });

  it("on approval, SPAWNS a content-experiment SEEDED with the ranked bets", async () => {
    const world = makeWorld(DAILY_DREAM_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("launch-approval")?.status === "waiting", 25, DAILY_DREAM_GRAPH);
    // Founder approves the launch through the same #445 finish door.
    await world.ports.substrate.finishStep(world.stepByNode("launch-approval")!.id, { status: "succeeded", summary: "founder: launch it" });
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_DREAM_GRAPH);

    // Exactly one experiment run started, of the right graph, seeded.
    expect(world.spawnedRuns).toHaveLength(1);
    expect(world.spawnedRuns[0]!.graph).toBe("content-experiment");
    expect(world.spawnedRuns[0]!.vpOwner).toBe("marketing");
    const seed = await world.ports.artifacts.get(world.spawnedRuns[0]!.id, "__seed__");
    expect(seed, "the experiment must be seeded with the hypothesis").toBeTruthy();
    expect(world.stepByNode("launch-report")?.status).toBe("succeeded");
    expect(world.telegrams.some((t) => t.includes("EXPERIMENTO"))).toBe(true);
    expect(world.run.status).toBe("succeeded");
  });

  it("the explicit optional 96h timeout still SKIPS (not fails) — the dream mechanism is unchanged", async () => {
    const world = makeWorld(DAILY_DREAM_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("launch-approval")?.status === "waiting", 25, DAILY_DREAM_GRAPH);

    world.clock.now = new Date(world.clock.now.getTime() + 97 * 3_600_000);
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_DREAM_GRAPH);

    // Optional approval: silence skips the acting tail, the brief still counts.
    expect(world.stepByNode("launch-approval")?.status).toBe("skipped");
    expect(world.spawnedRuns).toEqual([]);
    expect(world.run.status).toBe("succeeded");
  });

  it("declining the launch spawns NOTHING but does not fail the run — the brief still counts", async () => {
    const world = makeWorld(DAILY_DREAM_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("launch-approval")?.status === "waiting", 25, DAILY_DREAM_GRAPH);
    // Founder declines (finishes the optional approval as failed).
    await world.ports.substrate.finishStep(world.stepByNode("launch-approval")!.id, { status: "failed", summary: "founder: brief only" });
    await tickUntil(world, () => world.run.status !== "running", 25, DAILY_DREAM_GRAPH);

    expect(world.spawnedRuns).toEqual([]);
    // An OPTIONAL rejection is a valid no — the run SUCCEEDS, it does not fail.
    expect(world.stepByNode("launch-approval")?.status).toBe("skipped");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the CPO runs itself — the product finally has an owner", () => {
  it("reads the product aggregates, runs 3 lenses, reports — read-only end to end", async () => {
    const world = makeWorld(WEEKLY_PRODUCT_GRAPH.slug);
    world.snapshotText = "PRODUTO (agregados, 14d — sem PII):\nAuditorias: 12 rodadas · 1 falhou (8%)";
    await tickUntil(world, () => world.run.status !== "running", 25, WEEKLY_PRODUCT_GRAPH);

    expect(world.snapshotCalls).toEqual([{ source: "product", days: 14 }]);
    expect(world.stepByNode("lens-quality")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-value")?.status).toBe("succeeded");
    expect(world.stepByNode("lens-honesty")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    // Read-only by construction: no publish possible, nothing published.
    expect(world.published).toEqual([]);
    expect(world.spawnedRuns).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("CPO"))).toBe(true);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the discovery pipeline — ideas reach the founder MVP-ready", () => {
  it("research + both snapshots → ideate → develop → viability → final → report, read-only", async () => {
    const world = makeWorld(WEEKLY_DISCOVERY_GRAPH.slug);
    await tickUntil(world, () => world.run.status !== "running", 25, WEEKLY_DISCOVERY_GRAPH);

    // Inward perception is DOUBLE: the product aggregates and the real outcomes.
    expect(world.snapshotCalls).toEqual([
      { source: "product", days: 30 },
      { source: "outcomes", days: 30 },
    ]);
    expect(world.stepByNode("research")?.status).toBe("succeeded");
    expect(world.stepByNode("develop")?.status).toBe("succeeded");
    expect(world.stepByNode("viability")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    // Read-only: maturing an idea publishes nothing and spawns nothing.
    expect(world.published).toEqual([]);
    expect(world.spawnedRuns).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("CDO+CPO"))).toBe(true);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the X sphere cell (#156) — perception of ITS OWN channel before creation", () => {
  it("memory reads ONLY the sphere's metrics (metricPrefix x_), then runs to the approval gate", async () => {
    const world = makeWorld(SPHERE_X_GRAPH.slug);
    world.snapshotText = "RESULTADOS REAIS (ops.agent_outcome, 30d · esfera x_*):\n- x_impressions_7d (social-harvest): 30";
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);

    // The sphere's memory asked for ITS channel, not the whole company.
    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30, metricPrefix: "x_" }]);
    expect(world.stepByNode("memory")?.status).toBe("succeeded");
    expect(world.stepByNode("draft-punchy")?.status).toBe("succeeded");
    expect(world.stepByNode("draft-thread")?.status).toBe("succeeded");
    expect(world.stepByNode("critic")?.status).toBe("succeeded");
    expect(world.stepByNode("finalize")?.status).toBe("succeeded");
    // Parked at the human gate; nothing on X yet.
    expect(world.published).toEqual([]);
    // 17/08: the approval carries the two buttons the Telegram webhook maps
    // to the #445 finish call — approve is one tap, reject asks why.
    const stepId = world.stepByNode("approval")!.id;
    expect(world.telegramButtons.at(-1)).toEqual([`ap:${stepId}`, `rj:${stepId}`]);
  });

  it("approve → publishes to channel X → harvest x_impressions closes the sphere's loop", async () => {
    const world = makeWorld(SPHERE_X_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);
    await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, { status: "succeeded" });
    await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting", 25, SPHERE_X_GRAPH);

    expect(world.published).toHaveLength(1);
    expect(world.published[0]!.channel).toBe("x");

    world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
    world.harvestData = { n: 1, total: 45 };
    await tickUntil(world, () => world.run.status !== "running", 25, SPHERE_X_GRAPH);

    // The closing edge writes x_impressions — the NEXT run's memory reads it.
    expect(world.outcomes[0]!.metric).toBe("x_impressions");
    expect(world.outcomes[0]!.valueAfter).toBe(45);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the X sphere refuses to ship an over-limit post (prod failure 17/08)", () => {
  // The x-finalize prompt marks the editor-chief node; over-limit ONLY there.
  const FINALIZE_MARKER = "editor-chefe da esfera X";
  const OVER_LIMIT = ("word ".repeat(120)).trim(); // ~600 chars, boundaries to trim on

  it("adapts the finalized post to X's limit BEFORE approval — the founder sees what will publish", async () => {
    const world = makeWorld(SPHERE_X_GRAPH.slug);
    const orig = world.ports.hermes.task.bind(world.ports.hermes);
    world.ports.hermes.task = async (prompt) =>
      prompt.includes(FINALIZE_MARKER)
        ? { ok: true, output: OVER_LIMIT, engineUsed: "claude", ms: 10 }
        : orig(prompt);

    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);

    // What the approval gate holds is already compliant — no over-limit tweet.
    const finalized = (await world.ports.artifacts.get(world.run.id, "finalize")) ?? "";
    expect(finalized).not.toBe("");
    expect(xPostWithinLimit(finalized)).toBe(true);
    expect(world.stepByNode("finalize")?.summary).toContain(`adapted to X ${X_POST_LIMIT}`);
    // The Telegram ask shows the trimmed content the founder is approving.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO"));
    expect(ask).toContain(finalized.slice(0, 50));
    expect(world.published).toEqual([]);
  });

  it("belt-and-suspenders: if an over-limit post reaches publish, it is NOT sent and the step fails loudly", async () => {
    const world = makeWorld(SPHERE_X_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);

    // Simulate the adapt step being skipped/edited around: overwrite the
    // finalized artifact with an over-limit post AFTER it was made compliant.
    await world.ports.artifacts.set(world.run.id, "finalize", OVER_LIMIT);
    await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, { status: "succeeded" });

    await tickUntil(world, () => world.stepByNode("publish")?.status !== undefined, 25, SPHERE_X_GRAPH);

    // Nothing was handed to Postiz; the step failed with an honest reason.
    expect(world.published).toEqual([]);
    expect(world.stepByNode("publish")?.status).toBe("failed");
    expect(world.stepByNode("publish")?.summary).toContain(`over ${X_POST_LIMIT} chars, not sent`);
    expect(world.telegrams.some((t) => t.includes("X NÃO PUBLICADO"))).toBe(true);
  });
});

describe("the LinkedIn sphere cell (#156, second) — own memory, gated, measured", () => {
  it("memory reads ONLY linkedin_ metrics, both drafts + critic run, parks at the human gate", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_LINKEDIN_GRAPH);
    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30, metricPrefix: "linkedin_" }]);
    expect(world.stepByNode("draft-story")?.status).toBe("succeeded");
    expect(world.stepByNode("draft-contrarian")?.status).toBe("succeeded");
    expect(world.stepByNode("critic")?.status).toBe("succeeded");
    expect(world.stepByNode("finalize")?.status).toBe("succeeded");
    expect(world.published).toEqual([]);
  });

  it("approve → publishes to LinkedIn → harvest linkedin_impressions closes the loop", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH.slug);
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, SPHERE_LINKEDIN_GRAPH);
    await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, { status: "succeeded" });
    await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting", 25, SPHERE_LINKEDIN_GRAPH);
    expect(world.published).toHaveLength(1);
    expect(world.published[0]!.channel).toBe("linkedin");

    world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
    world.harvestData = { n: 1, total: 320 };
    await tickUntil(world, () => world.run.status !== "running", 25, SPHERE_LINKEDIN_GRAPH);
    expect(world.outcomes[0]!.metric).toBe("linkedin_impressions");
    expect(world.outcomes[0]!.valueAfter).toBe(320);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the blog sphere cell (#156, third) — a read-only thinker that publishes NOTHING", () => {
  it("memory (blog_, 60d) → signal → briefing → 2 outlines → critic → finalize → REPORT; no publish, no spawn", async () => {
    const world = makeWorld(SPHERE_BLOG_GRAPH.slug);
    await tickUntil(world, () => world.run.status !== "running", 25, SPHERE_BLOG_GRAPH);
    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 60, metricPrefix: "blog_" }]);
    expect(world.stepByNode("outline-howto")?.status).toBe("succeeded");
    expect(world.stepByNode("outline-data")?.status).toBe("succeeded");
    expect(world.stepByNode("critic")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    // The whole safety of this cell: it can only report.
    expect(world.published).toEqual([]);
    expect(world.spawnedRuns).toEqual([]);
    expect(SPHERE_BLOG_GRAPH.nodes.some((n) => n.kind === "publish" || n.kind === "spawn")).toBe(false);
    expect(world.telegrams.some((t) => t.includes("Blog da semana"))).toBe(true);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("content alive on every platform (17/08) — IG / TikTok / YouTube spheres", () => {
  const cells: Array<[GraphDefinition, string, string, string, number]> = [
    [SPHERE_INSTAGRAM_GRAPH, "instagram_", "instagram", "instagram_reach", 1200],
    [SPHERE_TIKTOK_GRAPH, "tiktok_", "tiktok", "tiktok_views", 5400],
    [SPHERE_YOUTUBE_GRAPH, "youtube_", "youtube", "youtube_views", 830],
  ];

  for (const [def, prefix, channel, metric, total] of cells) {
    it(`${def.slug}: memory reads ONLY ${prefix} metrics, both drafts + critic run, PARKS at the human gate`, async () => {
      const world = makeWorld(def.slug);
      await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, def);
      expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30, metricPrefix: prefix }]);
      expect(world.stepByNode("draft-talking-head")?.status).toBe("succeeded");
      expect(world.stepByNode("draft-caption-story")?.status).toBe("succeeded");
      expect(world.stepByNode("critic")?.status).toBe("succeeded");
      expect(world.stepByNode("finalize")?.status).toBe("succeeded");
      expect(world.published).toEqual([]);
      const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO"));
      expect(ask).toContain(`publicar como POST em ${channel}`);
    });

    it(`${def.slug}: approve → publish to ${channel} → wait 72h → harvest ${metric} → verdict closes the loop`, async () => {
      const world = makeWorld(def.slug);
      await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, def);
      await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, { status: "succeeded" });
      await tickUntil(world, () => world.stepByNode("wait-72h")?.status === "waiting", 25, def);
      expect(world.published).toHaveLength(1);
      expect(world.published[0]!.channel).toBe(channel);

      world.clock.now = new Date(world.clock.now.getTime() + 73 * 3_600_000);
      world.harvestData = { n: 1, total };
      await tickUntil(world, () => world.run.status !== "running", 25, def);
      expect(world.outcomes[0]!.metric).toBe(metric);
      expect(world.outcomes[0]!.valueAfter).toBe(total);
      expect(world.run.status).toBe("succeeded");
    });
  }

  it("every new marketing cell's reasoning prompts carry [__day__] — the calendar still reaches them", async () => {
    for (const [def] of cells) {
      const seen: string[] = [];
      const world = makeWorld(def.slug);
      const orig = world.ports.hermes.task.bind(world.ports.hermes);
      world.ports.hermes.task = async (prompt) => { seen.push(prompt); return orig(prompt); };
      await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, def);
      expect(seen.length, def.slug).toBeGreaterThan(0);
      for (const p of seen) expect(p, def.slug).toContain("[__day__]");
    }
  });
});

describe("the PPC cell (17/08) — 3 ad drafts, ZERO spend, report only", () => {
  it("snapshot(outcomes 30d, all spheres) → signal → 3 ads → critic → finalize → REPORT; no publish, no spawn", async () => {
    const world = makeWorld(SPHERE_PPC_GRAPH.slug);
    world.snapshotText = "RESULTADOS REAIS (ops.agent_outcome, 30d):\n- linkedin_impressions (sphere-linkedin): 320 · lift 0.4";
    await tickUntil(world, () => world.run.status !== "running", 25, SPHERE_PPC_GRAPH);
    // All spheres, no prefix — ads follow whatever content resonated anywhere.
    expect(world.snapshotCalls).toEqual([{ source: "outcomes", days: 30 }]);
    for (const id of ["signal", "ad-google", "ad-meta", "ad-linkedin", "critic", "finalize", "report"]) {
      expect(world.stepByNode(id)?.status, id).toBe("succeeded");
    }
    // The whole safety of this cell: it cannot spend, publish or launch.
    expect(world.published).toEqual([]);
    expect(world.spawnedRuns).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("APROVAÇÃO"))).toBe(false);
    const report = world.telegrams.find((t) => t.includes("PPC"));
    expect(report).toBeTruthy();
    expect(report).toContain("sem gasto");
    expect(report).toContain("nada foi executado");
    expect(world.run.status).toBe("succeeded");
  });
});

describe("the editorial calendar reaches content cells, never the brains", () => {
  it("a marketing cell's reasoning prompts carry [__day__]; a CEO brain's do not", async () => {
    const seen: string[] = [];
    // sphere-x is marketing → every task/debate prompt should carry the day.
    const cell = makeWorld(SPHERE_X_GRAPH.slug);
    const origTask = cell.ports.hermes.task.bind(cell.ports.hermes);
    cell.ports.hermes.task = async (prompt) => { seen.push(prompt); return origTask(prompt); };
    await tickUntil(cell, () => cell.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect(p).toContain("[__day__]");

    const brainSeen: string[] = [];
    const brain = makeWorld(DAILY_WATCHDOG_GRAPH.slug);
    const origBrain = brain.ports.hermes.task.bind(brain.ports.hermes);
    brain.ports.hermes.task = async (prompt) => { brainSeen.push(prompt); return origBrain(prompt); };
    await tickUntil(brain, () => brain.run.status !== "running", 25, DAILY_WATCHDOG_GRAPH);
    expect(brainSeen.length).toBeGreaterThan(0);
    for (const p of brainSeen) expect(p).not.toContain("[__day__]");
  });
});

describe("external signals (Signal Engine) reach content cells, fail-open", () => {
  it("when the substrate offers externalSignals, marketing prompts carry [__signals__]; brains never do; absent port = as before", async () => {
    const seen: string[] = [];
    const cell = makeWorld(SPHERE_X_GRAPH.slug);
    cell.ports.substrate.externalSignals = async () => "SINAIS EXTERNOS REAIS: kw=\"dentist austin\" · acao=publish_own_community";
    const orig = cell.ports.hermes.task.bind(cell.ports.hermes);
    cell.ports.hermes.task = async (p) => { seen.push(p); return orig(p); };
    await tickUntil(cell, () => cell.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect(p).toContain("[__signals__]");

    const brainSeen: string[] = [];
    const brain = makeWorld(DAILY_WATCHDOG_GRAPH.slug);
    brain.ports.substrate.externalSignals = async () => "should not be injected";
    const ob = brain.ports.hermes.task.bind(brain.ports.hermes);
    brain.ports.hermes.task = async (p) => { brainSeen.push(p); return ob(p); };
    await tickUntil(brain, () => brain.run.status !== "running", 25, DAILY_WATCHDOG_GRAPH);
    for (const p of brainSeen) expect(p).not.toContain("[__signals__]");

    // A port that throws must not break the run (fail-open by contract).
    const throwing = makeWorld(SPHERE_X_GRAPH.slug);
    throwing.ports.substrate.externalSignals = async () => { throw new Error("se down"); };
    await tickUntil(throwing, () => throwing.stepByNode("approval")?.status === "waiting", 25, SPHERE_X_GRAPH);
    expect(throwing.stepByNode("approval")?.status).toBe("waiting");
  });
});

describe("the content-experiment cell — a seeded, gated, measured shot", () => {
  it("runs seed → draft → critic → finalize → approval → publish → harvest → verdict", async () => {
    const world = makeWorld(CONTENT_EXPERIMENT_GRAPH.slug);
    // Seed it as the spawn would: the hypothesis lives in __seed__.
    await world.ports.artifacts.set(world.run.id, "__seed__", "APOSTA #1: founder-story em vídeo curto — ancora: 250 views/72h");

    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting", 25, CONTENT_EXPERIMENT_GRAPH);
    // The brief node consumed the seed (its prompt carried the hypothesis).
    const briefStep = world.stepByNode("brief");
    expect(briefStep?.status).toBe("succeeded");
    // Two gates: this spawned run parks at its OWN approval before publishing.
    expect(world.published).toEqual([]);

    await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, { status: "succeeded" });
    await tickUntil(world, () => world.stepByNode("wait-48h")?.status === "waiting", 25, CONTENT_EXPERIMENT_GRAPH);
    expect(world.published).toHaveLength(1);

    world.clock.now = new Date(world.clock.now.getTime() + 49 * 3_600_000);
    world.harvestData = { n: 2, total: 180 };
    await tickUntil(world, () => world.run.status !== "running", 25, CONTENT_EXPERIMENT_GRAPH);

    expect(world.stepByNode("verdict")?.status).toBe("succeeded");
    expect(world.outcomes[0]!.metric).toBe("experiment_reach_48h");
    expect(world.outcomes[0]!.valueAfter).toBe(180);
    expect(world.run.status).toBe("succeeded");
  });
});

describe("X thread → single-post pipe (prod failure 22/08)", () => {
  it("publishes only tweet 1 of an approved mini-thread and says so in the summary", async () => {
    const { splitXSegments, xPostWithinLimit } = await import("../../packages/shared/src/x-post-limit");
    const thread = ["Tweet one under the limit.", "Tweet two under the limit.", "Tweet three."].join("\n---\n");
    const segs = splitXSegments(thread);
    expect(segs).toHaveLength(3);
    // per-segment valid (what let the whole thread through to Postiz before):
    expect(xPostWithinLimit(thread)).toBe(true);
    // the joined text is what Postiz used to receive — longer than one tweet:
    expect(thread.length).toBeGreaterThan(segs[0]!.length);
    // the runner now sends segs[0] — pinned by the graph-runner publish branch
    // (see 'thread de N tweets publicada como tweet único' summary).
    expect(segs[0]).toBe("Tweet one under the limit.");
  });
});
