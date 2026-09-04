/**
 * 5.F.1 — consolidação de memória por esfera.
 *
 * A memória das esferas era janela deslizante: CONTENT_LESSONS é uma régua
 * estática de 7 linhas no código e o contexto por-run esquece tudo por mês.
 * O grafo mensal memory-consolidation destila ~30 dias de RESULTADOS REAIS em
 * lições duráveis por canal, o founder aprova no Telegram, e SÓ o aprovado
 * vira o artefato [__memory__] dos críticos de marketing (irmão durável do
 * [__lessons__] do #525).
 *
 * O que está pregado aqui:
 *  - o grafo está no registry, valida, é CEO-owned (fora da válvula de
 *    marketing) e o nó 'store' é IMPOSSÍVEL sem approval upstream;
 *  - a agregação é SQL/código (snapshot source 'memory', fake sql roteado
 *    pelos markers snap:memory-*) — o compose só vê fatos agregados
 *    ("vigia também mente": o modelo nunca agrega nem inventa número);
 *  - gate do founder: rejeição e timeout (96h = rejeição por silêncio) NUNCA
 *    gravam lição; só a aprovação chama o store;
 *  - [__memory__] é injetado SÓ nos críticos de grafos marketing e SÓ quando
 *    existe lição ativa — loja vazia = nenhum artefato, nunca placeholder;
 *  - round-trip do armazém real (buildPorts): insert → leitura da mais nova;
 *    42P01 (migração ausente) = fail-soft com a ação nominal que destrava.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import {
  advanceRun,
  GRAPH_REGISTRY,
  MEMORY_ARTIFACT,
  LESSONS_ARTIFACT,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  MEMORY_CONSOLIDATION_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  SPHERE_X_GRAPH,
  validateGraph,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, PROMPT_SLUGS } from "../../apps/api/src/lib/graph-prompts";
import {
  buildSnapshot,
  buildPorts,
  runMemoryConsolidationMonthly,
  memoryLessonStoreReady,
  isGatedMarketingGraph,
  MEMORY_STORE_MISSING_ACTION,
} from "../../apps/worker/src/jobs/graph-tick";

const LESSONS_TEXT = [
  "LICOES CONSOLIDADAS (ultimos 30d — regua de VETO, nao sugestao):",
  "- linkedin: evitar tom vendedor no gancho (3 rejeicoes por tom vendedor em ago).",
  "- x: thread nao performa; single punchy rendeu media 40 impressions (n=9).",
].join("\n");

// ---------------------------------------------------------------------------
// Harness do runner (molde de weekly-report-graph.test.ts / critic-lessons).
// ---------------------------------------------------------------------------

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  snapshotCalls: Array<{ source: string; days: number }>;
  stored: Array<{ runId: string; lessons: string }>;
  taskPromptsByNode: Record<string, string>;
  clock: { now: Date };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  def: GraphDefinition,
  opts: {
    /** null = loja vazia; string = lições ativas; undefined = porta ausente. */
    activeMemory?: string | null;
    /** false = storeMemoryLessons ausente; fn própria para simular falha. */
    store?: false | ((input: { runId: string; lessons: string }) => Promise<{ ok: boolean; reason?: string }>);
    composeOutput?: string;
  } = {}
): FakeWorld {
  const clock = { now: new Date("2026-09-01T06:30:00Z") }; // dia 1 do mês
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
    telegrams: [],
    snapshotCalls: [],
    stored: [],
    taskPromptsByNode: {},
    clock,
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
        async snapshot(input) {
          world.snapshotCalls.push({ source: input.source, days: input.days });
          return [
            `HISTORICO PARA CONSOLIDACAO DE MEMORIA (ops.*, ${input.days}d — fatos agregados por codigo; nada abaixo foi estimado):`,
            `PUBLICACOES CONCLUIDAS (por canal):`,
            `- linkedin: 8 publicacao(oes) (sphere-linkedin×8)`,
            `REJEICOES DO FOUNDER (motivo literal registrado — o sinal mais forte):`,
            `- 2026-08-12 (sphere-linkedin): tom vendedor`,
          ].join("\n");
        },
        async startRun() {
          throw new Error("memory-consolidation must never spawn");
        },
        ...(opts.activeMemory !== undefined
          ? { activeMemoryLessons: async () => opts.activeMemory ?? null }
          : {}),
        ...(opts.store === false
          ? {}
          : {
              storeMemoryLessons:
                opts.store ??
                (async (input: { runId: string; lessons: string }) => {
                  world.stored.push(input);
                  return { ok: true };
                }),
            }),
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          const out = node === "compose" ? (opts.composeOutput ?? LESSONS_TEXT) : `OUT[${node}]`;
          return { ok: true, output: out, engineUsed: "claude", ms: 10 };
        },
        async publish() {
          throw new Error("memory-consolidation must never publish");
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

async function tickUntil(world: FakeWorld, def: GraphDefinition, done: () => boolean, max = 20): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(def, world.run.id, world.ports);
}

// ---------------------------------------------------------------------------
// O desenho do grafo.
// ---------------------------------------------------------------------------

describe("memory-consolidation (5.F.1) — o desenho", () => {
  it("está no registry, valida, é CEO-owned e tem os 5 nós do desenho", () => {
    const def = GRAPH_REGISTRY["memory-consolidation"];
    expect(def, "memory-consolidation fora do registry — o cron mensal não iniciaria nada").toBeTruthy();
    expect(def).toBe(MEMORY_CONSOLIDATION_GRAPH);
    expect(def!.vpOwner).toBe("ceo");
    expect(validateGraph(def!).errors).toEqual([]);
    expect(def!.nodes.map((n) => n.id)).toEqual(["history", "compose", "approval", "store", "report"]);
  });

  it("o input é o snapshot 'memory' de 30d e o compose depende SÓ dele (fatos agregados, nada mais)", () => {
    const history = MEMORY_CONSOLIDATION_GRAPH.nodes.find((n) => n.id === "history")!;
    expect(history.kind).toBe("snapshot");
    expect(history.config).toMatchObject({ source: "memory", days: 30 });
    const compose = MEMORY_CONSOLIDATION_GRAPH.nodes.find((n) => n.id === "compose")!;
    expect(compose.dependsOn).toEqual(["history"]);
  });

  it("o store é gated: depende do approval (96h explícito) — e validateGraph REJEITA store sem approval upstream", () => {
    const approval = MEMORY_CONSOLIDATION_GRAPH.nodes.find((n) => n.id === "approval")!;
    expect(approval.kind).toBe("approval");
    expect(approval.config).toMatchObject({ channel: "telegram", timeoutHours: 96 });
    const store = MEMORY_CONSOLIDATION_GRAPH.nodes.find((n) => n.id === "store")!;
    expect(store.dependsOn).toEqual(["approval"]);

    // A regra dura, negada: um grafo em que a memória se auto-ativa NÃO existe.
    const rogue: GraphDefinition = {
      slug: "rogue-memory",
      version: 1,
      vpOwner: "ceo",
      description: "store sem humano",
      nodes: [
        { id: "compose", kind: "task", dependsOn: [], config: { prompt: "memory-consolidation-compose" } },
        { id: "store", kind: "store", dependsOn: ["compose"], config: { target: "memory-lessons" } },
      ],
    };
    const v = validateGraph(rogue);
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toContain("store node 'store' has no approval node upstream");
  });

  it("store sem config.target é erro de definição", () => {
    const noTarget: GraphDefinition = {
      slug: "no-target",
      version: 1,
      vpOwner: "ceo",
      description: "store sem alvo",
      nodes: [
        { id: "a", kind: "approval", dependsOn: [], config: { channel: "telegram" } },
        { id: "store", kind: "store", dependsOn: ["a"] },
      ],
    };
    expect(validateGraph(noTarget).errors.join(" ")).toContain("must declare config.target");
  });

  it("é CEO-owned de propósito: nunca conta na válvula de aprovações de marketing", () => {
    expect(isGatedMarketingGraph("memory-consolidation")).toBe(false);
  });

  it("o prompt compose resolve, é PT, limita a 12 lições, exige evidência e proíbe inventar", () => {
    expect(PROMPT_SLUGS).toContain("memory-consolidation-compose");
    const p = buildPrompt("task", { prompt: "memory-consolidation-compose" }, []) ?? "";
    expect(p).toContain("SOMENTE os fatos do bloco [history]");
    expect(p).toContain("NUNCA invente numero");
    expect(p).toContain("12 licoes");
    expect(p).toContain("evidencia entre parenteses");
    expect(p).toContain("EM PORTUGUES");
    expect(p).toContain("SEM LICOES NOVAS ESTE MES");
  });
});

// ---------------------------------------------------------------------------
// A agregação é SQL/código — snapshot source 'memory' (fake sql por marker).
// ---------------------------------------------------------------------------

interface MemoryWorldRows {
  pubs?: Array<{ graph: string; summary: string; started_at: string }>;
  metrics?: Array<{ metric: string; n: string; total: string | null; avg: string | null; last: string }>;
  rejections?: Array<{ graph: string; summary: string; started_at: string }>;
  timeouts?: Array<{ graph: string; n: string }>;
  verdicts?: Array<{ graph: string; summary: string; started_at: string }>;
}

function fakeMemorySql(rows: MemoryWorldRows): postgres.Sql {
  return (async (strings: TemplateStringsArray) => {
    const text = strings.join("$");
    if (text.includes("snap:memory-publishes")) return rows.pubs ?? [];
    if (text.includes("snap:memory-metrics")) return rows.metrics ?? [];
    if (text.includes("snap:memory-rejections")) return rows.rejections ?? [];
    if (text.includes("snap:memory-timeouts")) return rows.timeouts ?? [];
    if (text.includes("snap:memory-verdicts")) return rows.verdicts ?? [];
    throw new Error(`unrouted query in fake memory sql: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;
}

describe("snapshot source 'memory' — fatos agregados por código, por canal", () => {
  it("agrega publicações por canal (parse do channel= do summary), métricas, rejeições e vereditos — timeouts FORA (10.C.13)", async () => {
    const sql = fakeMemorySql({
      pubs: [
        { graph: "sphere-linkedin", summary: "published via postiz channel=linkedin", started_at: "2026-08-20T10:00:00Z" },
        { graph: "daily-video", summary: "published via postiz channel=linkedin", started_at: "2026-08-21T10:00:00Z" },
        { graph: "sphere-x", summary: "published via postiz channel=x", started_at: "2026-08-22T10:00:00Z" },
      ],
      metrics: [{ metric: "x_impressions_7d", n: "9", total: "360", avg: "40", last: "2026-08-25T07:40:00Z" }],
      rejections: [
        { graph: "sphere-linkedin", summary: "rejected: tom vendedor", started_at: "2026-08-12T09:00:00Z" },
      ],
      timeouts: [{ graph: "daily-video", n: "2" }],
      verdicts: [
        { graph: "sphere-x", summary: "verdict x_impressions: total=30 n=8", started_at: "2026-08-19T08:00:00Z" },
      ],
    });
    const snap = await buildSnapshot(sql, "memory", 30);
    // Por canal, com atribuição por graph.
    expect(snap).toContain("- linkedin: 2 publicacao(oes) (sphere-linkedin×1, daily-video×1)");
    expect(snap).toContain("- x: 1 publicacao(oes) (sphere-x×1)");
    // Métrica agregada — número vem do SQL, nunca do modelo.
    expect(snap).toContain("- x_impressions_7d: n=9 · total=360 · media=40 · ultima 2026-08-25");
    // O sinal mais forte: o motivo literal do founder.
    expect(snap).toContain("- 2026-08-12 (sphere-linkedin): tom vendedor");
    // 10.C.13: aprovação expirada é ausência do founder, NUNCA lição de conteúdo.
    expect(snap).not.toContain("APROVACOES EXPIRADAS");
    expect(snap).not.toContain("expiraram sem decisao");
    expect(snap).toContain("verdict x_impressions: total=30 n=8");
  });

  it("janela sem NADA = string vazia (o runner vira SEM DADOS — honesto, nunca inventado)", async () => {
    const snap = await buildSnapshot(fakeMemorySql({}), "memory", 30);
    expect(snap).toBe("");
  });
});

// ---------------------------------------------------------------------------
// O run inteiro: compose só vê fatos, gate do founder decide, store gated.
// ---------------------------------------------------------------------------

describe("memory-consolidation — o run no harness do runner", () => {
  it("caminho feliz: snapshot memory/30d → compose vê SÓ os fatos → aprovação → store grava o texto aprovado → report", async () => {
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    // O runner leu a fonte certa — e só ela.
    expect(world.snapshotCalls).toEqual([{ source: "memory", days: 30 }]);

    // O compose recebeu os fatos agregados como [history] — e, sendo CEO-owned,
    // NENHUMA injeção de conteúdo de marketing ([__day__]/[__lessons__]).
    const composePrompt = world.taskPromptsByNode["compose"] ?? "";
    expect(composePrompt).toContain("[history]");
    expect(composePrompt).toContain("HISTORICO PARA CONSOLIDACAO DE MEMORIA");
    expect(composePrompt).not.toContain("[__day__]");
    // O prompt CITA [__lessons__] como formato-alvo, mas o BLOCO injetado
    // (CONTENT_LESSONS) não pode aparecer — CEO-owned não recebe injeção.
    expect(composePrompt).not.toContain("LICOES DA CASA");

    // A caixa de aprovação nomeia o que um "sim" ativa.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask, "a aprovação não chegou ao Telegram").toBeTruthy();
    expect(ask).toContain("memória durável");

    // Founder aprova (o webhook #445 marca o step como succeeded).
    const approval = world.stepByNode("approval")!;
    approval.status = "succeeded";
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    // O store recebeu EXATAMENTE o texto que o founder aprovou (o compose).
    expect(world.stored).toEqual([{ runId: world.run.id, lessons: LESSONS_TEXT }]);
    expect(world.stepByNode("store")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
    const report = world.telegrams.find((t) => t.includes("MEMÓRIA DO MÊS"));
    expect(report, "o report final não chegou").toBeTruthy();
    expect(report).toContain("tom vendedor");
  });

  it("rejeição do founder: NADA é gravado — o store nunca roda", async () => {
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    // Founder rejeita (webhook #445: status failed, motivo no summary).
    const approval = world.stepByNode("approval")!;
    approval.status = "failed";
    approval.summary = "rejected: licoes genericas demais";
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stored).toEqual([]);
    expect(world.stepByNode("store"), "store não pode nem ter começado").toBeUndefined();
  });

  it("timeout de 96h = rejeição por silêncio: NADA é gravado, dito em voz alta", async () => {
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    // 97 horas de silêncio.
    world.clock.now = new Date(world.clock.now.getTime() + 97 * 3600 * 1000);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stored).toEqual([]);
    expect(world.stepByNode("store")).toBeUndefined();
    expect(world.telegrams.join("\n")).toContain("APROVAÇÃO EXPIROU");
  });

  it("store falha (ex.: migração ausente): step falha com o motivo, Telegram grita, nada finge sucesso", async () => {
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH, {
      store: async () => ({ ok: false, reason: `tabela ops.memory_lesson ausente — ${MEMORY_STORE_MISSING_ACTION}` }),
    });
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    const storeStep = world.stepByNode("store")!;
    expect(storeStep.status).toBe("failed");
    expect(storeStep.summary).toContain("ops.memory_lesson ausente");
    expect(world.telegrams.join("\n")).toContain("MEMÓRIA NÃO GRAVADA");
  });

  it("worker sem a porta de store: falha honesta, nunca sucesso silencioso", async () => {
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH, { store: false });
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("store")?.summary).toContain("memoria NAO gravada");
  });
});

// ---------------------------------------------------------------------------
// A injeção [__memory__]: só críticos de marketing, só com lição ativa.
// ---------------------------------------------------------------------------

describe("[__memory__] nos críticos de marketing", () => {
  it("sphere-x: com lição ativa, o critic recebe [__memory__] ao lado de [__lessons__]; os demais nós NÃO", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { activeMemory: LESSONS_TEXT });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("approval")?.status === "waiting", 25);

    const critic = world.taskPromptsByNode["critic"] ?? "";
    expect(critic, "critic nunca rodou").toBeTruthy();
    expect(critic).toContain(`[${MEMORY_ARTIFACT}]\n${LESSONS_TEXT.slice(0, 40)}`);
    expect(critic).toContain(`[${LESSONS_ARTIFACT}]`);
    for (const node of ["signal", "briefing", "draft-punchy", "draft-thread", "finalize"]) {
      expect(
        world.taskPromptsByNode[node],
        `nó não-crítico '${node}' não deveria receber a memória consolidada`
      ).not.toContain(MEMORY_ARTIFACT);
    }
  });

  it("loja vazia (null): NENHUM artefato [__memory__] — sem placeholder", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { activeMemory: null });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("approval")?.status === "waiting", 25);

    for (const prompt of Object.values(world.taskPromptsByNode)) {
      expect(prompt).not.toContain(MEMORY_ARTIFACT);
    }
  });

  it("porta ausente (worker antigo): células rodam exatamente como antes", async () => {
    const world = makeWorld(SPHERE_X_GRAPH);
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("approval")?.status === "waiting", 25);
    expect(world.taskPromptsByNode["critic"], "critic nunca rodou").toBeTruthy();
    for (const prompt of Object.values(world.taskPromptsByNode)) {
      expect(prompt).not.toContain(MEMORY_ARTIFACT);
    }
  });

  it("brains (CEO-owned) NUNCA recebem, mesmo com lição ativa e nós debate", async () => {
    const world = makeWorld(DAILY_WATCHDOG_GRAPH, { activeMemory: LESSONS_TEXT });
    await tickUntil(world, DAILY_WATCHDOG_GRAPH, () => world.run.status !== "running", 25);

    expect(world.run.status).toBe("succeeded");
    for (const lens of ["lens-cost", "lens-cycle", "lens-redundancy"]) {
      expect(world.taskPromptsByNode[lens], `${lens} nunca rodou`).toBeTruthy();
      expect(world.taskPromptsByNode[lens]).not.toContain(MEMORY_ARTIFACT);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip do armazém real (buildPorts) + o cron mensal com fail-soft.
// ---------------------------------------------------------------------------

function fakeStoreSql(world: { rows: Array<{ lessons: string; approved_at: string }>; tableExists: boolean }) {
  let seq = 0;
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("memory:table-check")) {
      return [{ t: world.tableExists ? "ops.memory_lesson" : null }];
    }
    if (text.includes("memory:active-read")) {
      if (!world.tableExists) {
        const err = new Error('relation "ops.memory_lesson" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      const newest = [...world.rows].sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0];
      return newest ? [{ lessons: newest.lessons }] : [];
    }
    if (text.includes("memory:store")) {
      if (!world.tableExists) {
        const err = new Error('relation "ops.memory_lesson" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      world.rows.push({ lessons: String(values[1]), approved_at: `2026-09-0${++seq}T00:00:00Z` });
      return [];
    }
    if (text.includes("INSERT INTO ops.agent_run")) {
      return [{ id: `run-${++seq}-0000-0000-0000-000000000000` }];
    }
    // look-back de idempotência do startBrainRuns: nada recente.
    return [];
  }) as unknown as postgres.Sql;
}

const fakeRedis = {} as unknown as Redis;

describe("armazém durável — round-trip e fail-soft (mergeado ≠ produção)", () => {
  it("round-trip: store grava, activeMemoryLessons devolve a versão mais NOVA", async () => {
    const world = { rows: [] as Array<{ lessons: string; approved_at: string }>, tableExists: true };
    const ports = buildPorts(fakeStoreSql(world), fakeRedis);

    expect(await ports.substrate.activeMemoryLessons!()).toBeNull(); // loja vazia = null, nunca placeholder

    const r1 = await ports.substrate.storeMemoryLessons!({ runId: "11111111-1111-1111-1111-111111111111", lessons: "v1: primeira" });
    expect(r1.ok).toBe(true);
    const r2 = await ports.substrate.storeMemoryLessons!({ runId: "22222222-2222-2222-2222-222222222222", lessons: LESSONS_TEXT });
    expect(r2.ok).toBe(true);

    // Append-only: a linha mais nova vence na leitura.
    expect(world.rows).toHaveLength(2);
    expect(await ports.substrate.activeMemoryLessons!()).toBe(LESSONS_TEXT);
  });

  it("migração ausente (42P01): leitura fail-open (null) e store fail-soft com a ação nominal que destrava", async () => {
    const world = { rows: [], tableExists: false };
    const ports = buildPorts(fakeStoreSql(world), fakeRedis);

    expect(await ports.substrate.activeMemoryLessons!()).toBeNull();
    const res = await ports.substrate.storeMemoryLessons!({ runId: "33333333-3333-3333-3333-333333333333", lessons: "x" });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("ops.memory_lesson ausente");
    expect(res.reason).toContain("20260827000001_ops_memory_lesson");
  });

  it("cron mensal: sem a tabela a feature se declara DESLIGADA e NÃO inicia run (não queima LLM num run condenado)", async () => {
    const world = { rows: [], tableExists: false };
    const sql = fakeStoreSql(world);
    expect(await memoryLessonStoreReady(sql)).toBe(false);
    const res = await runMemoryConsolidationMonthly(sql);
    expect(res.started).toEqual([]);
    expect(res.skipped).toEqual(["memory-consolidation"]);
  });

  it("cron mensal: com a tabela, inicia UM run com trigger cron:memory-consolidation", async () => {
    const world = { rows: [], tableExists: true };
    const sql = fakeStoreSql(world);
    expect(await memoryLessonStoreReady(sql)).toBe(true);
    const res = await runMemoryConsolidationMonthly(sql, { hermesToken: "t" });
    expect(res.started).toHaveLength(1);
    expect(res.started[0]).toContain("memory-consolidation:");
    expect(res.capped).toEqual([]);
  });
});
