/**
 * weekly-report (5.E.5) — o relatório de segunda ao founder, como GRAFO.
 *
 * O que está pregado aqui:
 *  - o grafo está no registry (a ÚNICA porta para ser executável) e passa no
 *    validateGraph;
 *  - é read-only POR CONSTRUÇÃO: sem publish, sem approval, sem spawn, sem
 *    harvest — um relatório não age, só conta;
 *  - o prompt weekly-report-compose resolve e carrega a regra de honestidade
 *    (só o que está nos snapshots, nunca inventar número);
 *  - no harness do runner (molde dos testes do watchdog): dois snapshots da
 *    semana (ops 7d ‖ outcomes 7d) → compose roda no engine → o report chega
 *    ao Telegram com o título de segunda e o run SUCCEEDED, sem publicar nada.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { WEEKLY_REPORT_GRAPH, validateGraph } from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, PROMPT_SLUGS } from "../../apps/api/src/lib/graph-prompts";

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  published: Array<{ channel: string; post: string }>;
  snapshotCalls: Array<{ source: string; days: number }>;
  /** Prompt que o engine recebeu, por node — o compose tem que ver os snapshots. */
  taskPromptsByNode: Record<string, string>;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(): FakeWorld {
  const clock = { now: new Date("2026-08-24T07:30:00Z") }; // uma segunda-feira
  const run: RunRow = {
    id: "run-wr",
    graph: WEEKLY_REPORT_GRAPH.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: FakeWorld = {
    run,
    steps,
    telegrams: [],
    published: [],
    snapshotCalls: [],
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
          return "outcome-never";
        },
        publishedToday: async () => 0,
        async readHarvest() {
          return { n: 0, total: 0 };
        },
        async snapshot(input) {
          world.snapshotCalls.push({ source: input.source, days: input.days });
          if (input.source === "cadence") {
            // 5.F.5: o texto da cadência É a recomendação final (código puro).
            return "VALVULA DE CADENCIA — camada medida (5.F.5, 30d):\n- linkedin: cap atual (2/dia) mantem — media por post estavel (14 posts em 30d).";
          }
          return input.source === "ops"
            ? "REGISTRO OPERACIONAL (ops.*, 7d):\n- sphere-linkedin: 7 runs (6 ok / 1 falha) · 1.20 USD"
            : "RESULTADOS REAIS (ops.agent_outcome, 7d):\n- linkedinpage_impressions_7d (sphere-linkedin): 340 · lift 0.15 · 2026-08-22";
        },
        async startRun() {
          throw new Error("weekly-report must never spawn");
        },
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          return { ok: true, output: `RELATORIO[${prompt.slice(0, 30)}]`, engineUsed: "claude", ms: 50 };
        },
        async publish(payload) {
          world.published.push(payload);
          return { ok: true, detail: "never" };
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
        world.telegrams.push(text);
      },
      now: () => clock.now,
    },
  };
  return world;
}

describe("weekly-report (5.E.5) — o desenho", () => {
  it("está no registry, valida, é do CEO e tem os 5 nós do desenho (v2 = +cadence)", () => {
    const def = GRAPH_REGISTRY["weekly-report"];
    expect(def, "weekly-report fora do registry — o cron de segunda não iniciaria nada").toBeTruthy();
    expect(def).toBe(WEEKLY_REPORT_GRAPH);
    expect(def!.vpOwner).toBe("ceo");
    const v = validateGraph(def!);
    expect(v.errors).toEqual([]);
    expect(def!.nodes.map((n) => n.id)).toEqual(["ops-week", "outcomes-week", "cadence", "compose", "report"]);
  });

  it("5.F.5: o nó 'cadence' (30d) alimenta o REPORT direto — nunca o compose (o modelo não toca nos números de cadência)", () => {
    const cadence = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "cadence")!;
    expect(cadence.kind).toBe("snapshot");
    expect(cadence.config).toMatchObject({ source: "cadence", days: 30 });
    const compose = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "compose")!;
    expect(compose.dependsOn).not.toContain("cadence");
    const report = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "report")!;
    expect(report.dependsOn).toEqual(["compose", "cadence"]);
  });

  it("é read-only POR CONSTRUÇÃO: sem publish, sem approval, sem spawn, sem harvest", () => {
    const kinds = new Set(WEEKLY_REPORT_GRAPH.nodes.map((n) => n.kind));
    for (const forbidden of ["publish", "approval", "spawn", "harvest"]) {
      expect(kinds.has(forbidden as never), `weekly-report não pode ter nó '${forbidden}'`).toBe(false);
    }
  });

  it("os dois snapshots são PARALELOS (raízes) e cobrem a semana (7d)", () => {
    const ops = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "ops-week")!;
    const out = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "outcomes-week")!;
    expect(ops.dependsOn).toEqual([]);
    expect(out.dependsOn).toEqual([]);
    expect(ops.config).toMatchObject({ source: "ops", days: 7 });
    expect(out.config).toMatchObject({ source: "outcomes", days: 7 });
    // O compose junta os dois — o relatório lê operação E resultado.
    const compose = WEEKLY_REPORT_GRAPH.nodes.find((n) => n.id === "compose")!;
    expect([...compose.dependsOn].sort()).toEqual(["ops-week", "outcomes-week"]);
  });

  it("o prompt weekly-report-compose resolve, é PT e carrega a regra de honestidade", () => {
    expect(PROMPT_SLUGS).toContain("weekly-report-compose");
    const p = buildPrompt("task", { prompt: "weekly-report-compose" }, []) ?? "";
    expect(p).toBeTruthy();
    // Interno ao founder = PT; e NUNCA inventar número.
    expect(p).toContain("EM PORTUGUES");
    expect(p).toContain("NUNCA invente numero");
    // As seções que o founder pediu.
    for (const section of ["PUBLICACOES DA SEMANA", "FALHAS", "CUSTO", "APROVACOES DO FOUNDER", "LIFT E VEREDITOS", "A SEMANA QUE VEM"]) {
      expect(p, `secao '${section}' ausente do compose`).toContain(section);
    }
    // Custo por tenant só se a seção existir no snapshot — sem inventar.
    expect(p).toContain("POR TENANT");
  });
});

describe("weekly-report — o run inteiro no harness do runner", () => {
  async function tickUntil(world: FakeWorld, done: () => boolean, max = 15): Promise<void> {
    for (let i = 0; i < max && !done(); i++) {
      await advanceRun(WEEKLY_REPORT_GRAPH, world.run.id, world.ports);
    }
  }

  it("snapshot ops 7d ‖ outcomes 7d ‖ cadence 30d → compose → report no Telegram, run SUCCEEDED", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.run.status !== "running");

    // O runner leu as TRÊS fontes — e só elas.
    expect(world.snapshotCalls).toHaveLength(3);
    expect(world.snapshotCalls).toContainEqual({ source: "ops", days: 7 });
    expect(world.snapshotCalls).toContainEqual({ source: "outcomes", days: 7 });
    expect(world.snapshotCalls).toContainEqual({ source: "cadence", days: 30 });

    // O compose recebeu os dois snapshots da semana como contexto — e NUNCA a
    // seção de cadência (o modelo não pode reescrever esses números).
    const composePrompt = world.taskPromptsByNode["compose"] ?? "";
    expect(composePrompt).toContain("[ops-week]");
    expect(composePrompt).toContain("[outcomes-week]");
    expect(composePrompt).toContain("REGISTRO OPERACIONAL");
    expect(composePrompt).toContain("RESULTADOS REAIS");
    expect(composePrompt).not.toContain("VALVULA DE CADENCIA");

    expect(world.stepByNode("compose")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");

    // O relatório chegou ao founder com o título de segunda, como proposta —
    // e a seção de cadência (5.F.5) colada VERBATIM, direto do snapshot.
    const report = world.telegrams.find((t) => t.includes("Semana da Ozvor"));
    expect(report, "o report de segunda não chegou ao Telegram").toBeTruthy();
    expect(report).toContain("relatório de segunda");
    expect(report).toContain("VALVULA DE CADENCIA");
    expect(report).toContain("cap atual (2/dia) mantem");

    // Read-only de ponta a ponta: nada publicado, run fechado com sucesso.
    expect(world.published).toEqual([]);
    expect(world.run.status).toBe("succeeded");
  });
});
