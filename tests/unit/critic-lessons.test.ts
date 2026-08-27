/**
 * 5.F.3 — memória institucional nos críticos ([__lessons__]).
 *
 * Os críticos das esferas já recebiam [memory] (outcomes) + [__day__] +
 * rejeições do founder — mas NÃO as lições institucionais (X ≤280 e pipe
 * single-post, canal com mídia não recebe texto, válvula do LinkedIn, copy
 * 15-17 anos, sonho honesto, English-first). Agora o runner injeta o bloco
 * CONTENT_LESSONS como artefato [__lessons__] APENAS nos nós de crítica
 * (debate) de grafos marketing — o mesmo padrão do [__day__]: constante,
 * sem I/O.
 *
 * O que está pregado aqui:
 *  - o crítico de 3 esferas (X, LinkedIn e daily-video) RECEBE o bloco;
 *  - os nós não-críticos (signal, briefing, draft, finalize) NÃO recebem;
 *  - os brains (CEO-owned — watchdog) NÃO recebem, mesmo tendo nós debate;
 *  - o texto das lições cobre as regras da casa desta semana;
 *  - os prompts *-critic citam [__lessons__] como régua de veto.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  LESSONS_ARTIFACT,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  SPHERE_X_GRAPH,
  SPHERE_LINKEDIN_GRAPH,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, CONTENT_LESSONS } from "../../apps/api/src/lib/graph-prompts";

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  /** Prompt que o engine recebeu, por node. */
  taskPromptsByNode: Record<string, string>;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(def: GraphDefinition): FakeWorld {
  const clock = { now: new Date("2026-08-25T10:00:00Z") };
  const run: RunRow = {
    id: `run-${def.slug}`,
    graph: def.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: FakeWorld = {
    run,
    steps,
    taskPromptsByNode: {},
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
        async recordOutcome() {
          return "outcome-1";
        },
        publishedToday: async () => 0,
        async readHarvest() {
          return { n: 0, total: 0 };
        },
        async snapshot() {
          return "RESULTADOS REAIS: - x_impressions: 30";
        },
        async startRun() {
          return "child-1";
        },
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          return { ok: true, output: `OUT[${node}]`, engineUsed: "claude", ms: 10 };
        },
        async publish() {
          return { ok: true, detail: "{}" };
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
      telegram: async () => {},
      now: () => clock.now,
    },
  };
  return world;
}

async function tickUntil(
  world: FakeWorld,
  def: GraphDefinition,
  done: () => boolean,
  max = 25
): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(def, world.run.id, world.ports);
}

/** O bloco injetado aparece no prompt como `[__lessons__]\n<CONTENT_LESSONS>`. */
const LESSONS_MARK = `[${LESSONS_ARTIFACT}]\n${CONTENT_LESSONS.slice(0, 40)}`;

describe("as lições da casa chegam aos críticos das esferas", () => {
  it("sphere-x: o critic recebe [__lessons__]; signal/briefing/drafts/finalize NÃO", async () => {
    const world = makeWorld(SPHERE_X_GRAPH);
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    expect(world.taskPromptsByNode["critic"], "critic nunca rodou").toBeTruthy();
    expect(world.taskPromptsByNode["critic"]).toContain(LESSONS_MARK);
    for (const node of ["signal", "briefing", "draft-punchy", "draft-thread", "finalize"]) {
      expect(
        world.taskPromptsByNode[node],
        `nó não-crítico '${node}' não deveria receber as lições`
      ).not.toContain(LESSONS_ARTIFACT);
    }
  });

  it("sphere-linkedin: mesmo contrato — só o critic vê as lições", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    expect(world.taskPromptsByNode["critic"]).toContain(LESSONS_MARK);
    for (const node of ["signal", "briefing", "draft-story", "draft-contrarian", "finalize"]) {
      expect(world.taskPromptsByNode[node]).not.toContain(LESSONS_ARTIFACT);
    }
  });

  it("daily-video: TODOS os críticos do debate recebem; os angles não", async () => {
    const world = makeWorld(DAILY_VIDEO_GRAPH);
    await tickUntil(world, DAILY_VIDEO_GRAPH, () => world.stepByNode("founder-approval")?.status === "waiting");

    for (const critic of ["critic-hook", "critic-brand", "critic-compliance", "critic-freshness", "critic-virality"]) {
      expect(world.taskPromptsByNode[critic], `${critic} sem as lições`).toContain(LESSONS_MARK);
    }
    for (const node of ["memory", "signal", "briefing", "angle-a", "angle-b", "angle-c", "synthesis", "linkedin-post"]) {
      expect(world.taskPromptsByNode[node]).not.toContain(LESSONS_ARTIFACT);
    }
  });

  it("os brains NÃO recebem: o watchdog (CEO-owned) tem nós debate e nenhum vê lição de conteúdo", async () => {
    const world = makeWorld(DAILY_WATCHDOG_GRAPH);
    await tickUntil(world, DAILY_WATCHDOG_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    for (const lens of ["lens-cost", "lens-cycle", "lens-redundancy"]) {
      expect(world.taskPromptsByNode[lens], `${lens} nunca rodou`).toBeTruthy();
      expect(world.taskPromptsByNode[lens]).not.toContain(LESSONS_ARTIFACT);
    }
  });
});

describe("o texto das lições e a régua nos prompts", () => {
  it("CONTENT_LESSONS destila as regras REAIS da casa (X 280/single-post, mídia, válvula, copy, sonho honesto, English-first)", () => {
    expect(CONTENT_LESSONS).toContain("<=280");
    expect(CONTENT_LESSONS).toContain("tweet unico");
    expect(CONTENT_LESSONS.toLowerCase()).toContain("midia");
    expect(CONTENT_LESSONS).toContain("2 posts/dia");
    expect(CONTENT_LESSONS).toContain("<=12 palavras");
    expect(CONTENT_LESSONS).toContain("1a pessoa");
    expect(CONTENT_LESSONS.toLowerCase()).toContain("nunca");
    expect(CONTENT_LESSONS).toContain("English-first");
    expect(CONTENT_LESSONS.toLowerCase()).toContain("repetir tema");
  });

  it("todo prompt de crítico cita [__lessons__] como régua de VETO", () => {
    const critics: Array<[string, Record<string, unknown>]> = [
      ["debate", { prompt: "x-critic" }],
      ["debate", { prompt: "linkedin-critic" }],
      ["debate", { prompt: "blog-critic" }],
      ["debate", { prompt: "reddit-critic" }],
      ["debate", { prompt: "instagram-critic" }],
      ["debate", { prompt: "tiktok-critic" }],
      ["debate", { prompt: "youtube-critic" }],
      ["debate", { prompt: "ppc-critic" }],
      ["debate", { prompt: "experiment-critic", lens: "compliance" }],
      // o debate default do daily-video (lens hook/brand/...):
      ["debate", { lens: "hook" }],
    ];
    for (const [kind, config] of critics) {
      const p = buildPrompt(kind, config, []) ?? "";
      expect(p, `crítico ${JSON.stringify(config)} não cita [__lessons__]`).toContain("[__lessons__]");
      expect(p).toContain("VETADA");
    }
  });
});
