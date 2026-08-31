/**
 * 5.F.7 — postmortem→código: incidente → anti-pattern → contexto dos agentes.
 *
 * Antes, a seção "## Licoes propostas" do rascunho de postmortem aprovado
 * morria no report: um humano precisava copiá-la para docs/learning/
 * anti-patterns.md, e os críticos dos grafos nunca leem esse arquivo (leem
 * [__memory__] e [__lessons__]). O 5.F.7 fecha o loop SEM segundo gate e SEM
 * commit de máquina em docs/:
 *
 *  - a aprovação do RASCUNHO no Telegram é a aprovação das lições — linhas
 *    verbatim que o founder leu; o nó store-lessons (gated pelo approval,
 *    validateGraph exige) grava UMA linha em ops.memory_lesson com o prefixo
 *    LICOES DE INCIDENTE;
 *  - a extração é CÓDIGO (regex no header + formato pinado 'NUNCA <padrao>.
 *    Em vez disso: <pratica>') — nunca um LLM; seção ausente/malformada =
 *    NADA gravado + aviso alto (nunca um palpite);
 *  - tabela ausente (migração 5.F.1 pendente) = step SKIPPED com a ação
 *    nominal; o postmortem (report, run status) completa exatamente como
 *    antes do 5.F.7 — a memória lateral nunca mata o postmortem;
 *  - ENTREGA (achado do #5): [__memory__] só chega a críticos debate de
 *    grafos MARKETING — lição de incidente é de OPS, então ela aparece na
 *    seção 'Licoes de incidentes ativas' do snapshot 'ops' (daily-watchdog +
 *    weekly-report), e activeMemoryLessons EXCLUI o prefixo para a linha de
 *    incidente nunca deslocar a consolidação mensal do 5.F.1 (newest-wins);
 *  - docs/learning/ segue 100% humano: o report ainda nomeia o passo manual.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import {
  advanceRun,
  GRAPH_REGISTRY,
  INCIDENT_LESSON_PREFIX,
  extractIncidentLessons,
  incidentLessonBlock,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { INCIDENT_POSTMORTEM_GRAPH, validateGraph, type GraphDefinition } from "../../apps/api/src/lib/agent-graphs";
import { buildSnapshot, buildPorts } from "../../apps/worker/src/jobs/graph-tick";

// ---------------------------------------------------------------------------
// O rascunho no formato pinado pelo prompt postmortem-compose.
// ---------------------------------------------------------------------------

const LESSON_A =
  "NUNCA pinar o engine no chamador quando existe cadeia de fallback no servidor. Em vez disso: pedir a cadeia e registrar qual engine respondeu.";
const LESSON_B = "NUNCA deixar aprovacao humana sem timeout. Em vez disso: timeout 96h = rejeicao por silencio.";

const DRAFT_WITH_LESSONS = [
  "> RASCUNHO DE MAQUINA (incident-postmortem) — pendente validacao humana.",
  "# Postmortem — 5 falhas no daily-video",
  "## O que aconteceu",
  "5 steps falharam com \"oauth expired\".",
  "## Licoes propostas (→ anti-patterns)",
  `- ${LESSON_A}`,
  `- ${LESSON_B}`,
  "PROXIMO PASSO (humano): colar este rascunho em docs/learning/postmortems/ e, se as licoes valerem, em docs/learning/anti-patterns.md — a maquina nao escreve nos docs.",
].join("\n");

const DRAFT_MALFORMED = [
  "> RASCUNHO DE MAQUINA (incident-postmortem) — pendente validacao humana.",
  "# Postmortem — algo quebrou",
  "## Licoes propostas (→ anti-patterns)",
  "- evitar oauth expirado (sem o formato pinado)",
  "- NUNCA sem a segunda metade do formato",
].join("\n");

// ---------------------------------------------------------------------------
// Extração — código puro, formato pinado, nunca um palpite.
// ---------------------------------------------------------------------------

describe("extractIncidentLessons — parsing é código, nunca LLM", () => {
  it("caminho feliz: extrai só as linhas no formato 'NUNCA ... Em vez disso: ...'", () => {
    const lessons = extractIncidentLessons(DRAFT_WITH_LESSONS);
    expect(lessons).toEqual([LESSON_A, LESSON_B]);
  });

  it("tolera acentos no header, numeração e aspas nas linhas", () => {
    const draft = [
      "# Postmortem — x",
      "## Lições propostas",
      `1) '${LESSON_A}'`,
      `2. "${LESSON_B}"`,
    ].join("\n");
    expect(extractIncidentLessons(draft)).toEqual([LESSON_A, LESSON_B]);
  });

  it("a seção termina no próximo header — uma linha NUNCA fora dela não entra", () => {
    const draft = [
      "## Licoes propostas (→ anti-patterns)",
      `- ${LESSON_A}`,
      "## Outra secao",
      `- ${LESSON_B}`,
    ].join("\n");
    expect(extractIncidentLessons(draft)).toEqual([LESSON_A]);
  });

  it("linha com só metade do formato é DESCARTADA — nunca se grava um palpite", () => {
    expect(extractIncidentLessons(DRAFT_MALFORMED)).toEqual([]);
  });

  it("sem a seção (ou rascunho vazio): []", () => {
    expect(extractIncidentLessons("# Postmortem sem licoes\n## Impacto\nnada")).toEqual([]);
    expect(extractIncidentLessons("")).toEqual([]);
  });
});

describe("o prefixo é o contrato de roteamento — pinado", () => {
  it("INCIDENT_LESSON_PREFIX e o bloco gravado têm formato exato", () => {
    expect(INCIDENT_LESSON_PREFIX).toBe("LICOES DE INCIDENTE");
    const block = incidentLessonBlock([LESSON_A], "2026-08-27");
    expect(block).toBe(`LICOES DE INCIDENTE (postmortem aprovado 2026-08-27):\n- ${LESSON_A}`);
    // O roteamento dos reads (LIKE 'LICOES DE INCIDENTE%') depende disto:
    expect(block.startsWith(INCIDENT_LESSON_PREFIX)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// O desenho v2 — store gated, report independente da memória lateral.
// ---------------------------------------------------------------------------

describe("incident-postmortem v2 — o desenho do 5.F.7", () => {
  it("v2 valida; store-lessons é gated pelo approval e mira incident-lessons", () => {
    expect(INCIDENT_POSTMORTEM_GRAPH.version).toBeGreaterThanOrEqual(2);
    expect(validateGraph(INCIDENT_POSTMORTEM_GRAPH).errors).toEqual([]);
    const store = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "store-lessons")!;
    expect(store.kind).toBe("store");
    expect(store.dependsOn).toEqual(["approval"]);
    expect(store.config).toMatchObject({ target: "incident-lessons" });
  });

  it("o report NÃO depende do store: a memória lateral nunca segura o postmortem", () => {
    const report = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "report")!;
    expect(report.dependsOn).not.toContain("store-lessons");
  });

  it("a pergunta do gate diz que as lições (verbatim, no texto) se ativam com o mesmo sim — e que docs/ segue manual", () => {
    const approval = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "approval")!;
    const q = String(approval.config?.["question"]);
    expect(q).toContain("Licoes propostas");
    expect(q).toContain("verbatim");
    expect(q).toContain("manual");
  });
});

// ---------------------------------------------------------------------------
// Harness do runner (molde de memory-consolidation.test.ts).
// ---------------------------------------------------------------------------

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  stored: Array<{ runId: string; lessons: string }>;
  clock: { now: Date };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  opts: {
    composeOutput?: string;
    /** false = porta storeMemoryLessons ausente; fn própria para simular falha. */
    store?: false | ((input: { runId: string; lessons: string }) => Promise<{ ok: boolean; reason?: string }>);
  } = {}
): FakeWorld {
  const def: GraphDefinition = INCIDENT_POSTMORTEM_GRAPH;
  const clock = { now: new Date("2026-08-27T07:10:00Z") };
  const run: RunRow = { id: "run-pm2", graph: def.slug, status: "running", started_at: clock.now.toISOString() };
  const steps: FakeWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: FakeWorld = {
    run,
    steps,
    telegrams: [],
    stored: [],
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
          return "outcome-never";
        },
        publishedToday: async () => 0,
        async readHarvest() {
          return { n: 0, total: 0 };
        },
        async snapshot() {
          return "ASSINATURAS DE INCIDENTE (scan SQL sobre ops.*, ultimas 24h): cluster daily-video ×5";
        },
        async startRun() {
          throw new Error("incident-postmortem must never spawn");
        },
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
        async task() {
          const node = steps[steps.length - 1]?.node ?? "?";
          const out = node === "compose" ? (opts.composeOutput ?? DRAFT_WITH_LESSONS) : `OUT[${node}]`;
          return { ok: true, output: out, engineUsed: "claude", ms: 10 };
        },
        async publish() {
          throw new Error("incident-postmortem must never publish");
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

async function tickUntil(world: FakeWorld, done: () => boolean, max = 20): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(INCIDENT_POSTMORTEM_GRAPH, world.run.id, world.ports);
}

describe("5.F.7 — o run inteiro: extração após o sim, verbatim, com prefixo", () => {
  it("caminho feliz: aprovação → grava SÓ a seção de lições (prefixada, com a data), nunca o rascunho inteiro; report sai; run SUCCEEDED", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    // A caixa do gate nomeia a ativação das lições no watchdog.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask).toBeTruthy();
    expect(ask).toContain("memória de incidentes");
    expect(ask).toContain("watchdog");

    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stored).toHaveLength(1);
    const storedText = world.stored[0]!.lessons;
    expect(world.stored[0]!.runId).toBe(world.run.id);
    // Prefixo pinado + data da aprovação (clock do runner).
    expect(storedText).toBe(
      [`${INCIDENT_LESSON_PREFIX} (postmortem aprovado 2026-08-27):`, `- ${LESSON_A}`, `- ${LESSON_B}`].join("\n")
    );
    // Só a seção — nunca o rascunho inteiro nem o passo humano.
    expect(storedText).not.toContain("RASCUNHO DE MAQUINA");
    expect(storedText).not.toContain("PROXIMO PASSO");

    expect(world.stepByNode("store-lessons")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
    // O report ainda nomeia o passo humano — docs/learning/ segue do founder.
    const report = world.telegrams.find((t) => t.includes("POSTMORTEM APROVADO"));
    expect(report).toContain("commit manual em docs/learning/postmortems/");
  });

  it("seção malformada (compose fora do formato): NADA gravado, aviso alto, e o postmortem completa como sempre", async () => {
    const world = makeWorld({ composeOutput: DRAFT_MALFORMED });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.stored).toEqual([]);
    const store = world.stepByNode("store-lessons")!;
    expect(store.status).toBe("succeeded"); // no-op honesto, não falha o run
    expect(store.summary).toContain("nada gravado");
    expect(world.telegrams.join("\n")).toContain("LIÇÕES DE INCIDENTE NÃO EXTRAÍDAS");
    // O fluxo do postmortem segue exatamente como hoje.
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
  });

  it("rejeição do founder: o store nunca roda, nada é gravado", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    const approval = world.stepByNode("approval")!;
    approval.status = "failed";
    approval.summary = "rejected: numeros nao batem";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stored).toEqual([]);
    expect(world.stepByNode("store-lessons")).toBeUndefined();
  });

  it("timeout de 96h = rejeição por silêncio: nada gravado", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.clock.now = new Date(world.clock.now.getTime() + 97 * 3_600_000);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stored).toEqual([]);
    expect(world.stepByNode("store-lessons")).toBeUndefined();
  });

  it("tabela ausente (migração 5.F.1 pendente): store SKIPPED com a ação nominal, Telegram avisa, e o run SUCCEEDED — o postmortem nunca morre pela memória lateral", async () => {
    const world = makeWorld({
      store: async () => ({
        ok: false,
        reason: "tabela ops.memory_lesson ausente — founder aplica a migracao 20260827000001_ops_memory_lesson",
      }),
    });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    const store = world.stepByNode("store-lessons")!;
    expect(store.status).toBe("skipped");
    expect(store.summary).toContain("store OFF");
    expect(store.summary).toContain("ops.memory_lesson ausente");
    expect(world.telegrams.join("\n")).toContain("LIÇÕES DE INCIDENTE NÃO GRAVADAS");
    expect(world.telegrams.join("\n")).toContain("20260827000001_ops_memory_lesson");
    // O fluxo completa exatamente como antes do 5.F.7:
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
  });

  it("worker sem a porta de store: SKIPPED declarando a feature OFF, run SUCCEEDED", async () => {
    const world = makeWorld({ store: false });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    const store = world.stepByNode("store-lessons")!;
    expect(store.status).toBe("skipped");
    expect(store.summary).toContain("port ausente");
    expect(world.run.status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// Entrega (#5): quem lê a lição — watchdog SIM, críticos de marketing NÃO.
// ---------------------------------------------------------------------------

const INCIDENT_ROW = `${INCIDENT_LESSON_PREFIX} (postmortem aprovado 2026-08-27):\n- ${LESSON_A}`;
const MONTHLY_ROW = "LICOES CONSOLIDADAS (ultimos 30d — regua de VETO, nao sugestao):\n- linkedin: evitar tom vendedor.";

function fakeMemoryTableSql(world: { rows: Array<{ lessons: string; approved_at: string }>; tableExists: boolean }) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    const throw42P01 = () => {
      const err = new Error('relation "ops.memory_lesson" does not exist') as Error & { code: string };
      err.code = "42P01";
      throw err;
    };
    if (text.includes("memory:active-read")) {
      if (!world.tableExists) throw42P01();
      // Emula o filtro do read: o padrão NOT LIKE viaja como parâmetro.
      expect(text).toContain("NOT LIKE");
      const pattern = String(values.find((v) => typeof v === "string" && String(v).endsWith("%")) ?? "%");
      const prefix = pattern.slice(0, -1);
      const eligible = world.rows.filter((r) => !r.lessons.startsWith(prefix));
      const newest = [...eligible].sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0];
      return newest ? [{ lessons: newest.lessons }] : [];
    }
    if (text.includes("memory:store")) {
      if (!world.tableExists) throw42P01();
      world.rows.push({ lessons: String(values[1]), approved_at: `2026-09-0${world.rows.length + 1}T00:00:00Z` });
      return [];
    }
    return [];
  }) as unknown as postgres.Sql;
}

const fakeRedis = {} as unknown as Redis;

describe("[__memory__] (activeMemoryLessons) EXCLUI as lições de incidente", () => {
  it("linha de incidente mais nova NÃO desloca a consolidação mensal — os críticos seguem vendo o 5.F.1", async () => {
    const world = {
      rows: [
        { lessons: MONTHLY_ROW, approved_at: "2026-09-01T00:00:00Z" },
        { lessons: INCIDENT_ROW, approved_at: "2026-09-02T00:00:00Z" }, // mais nova
      ],
      tableExists: true,
    };
    const ports = buildPorts(fakeMemoryTableSql(world), fakeRedis);
    expect(await ports.substrate.activeMemoryLessons!()).toBe(MONTHLY_ROW);
  });

  it("só lições de incidente na loja: [__memory__] fica vazio (null) — nunca lição de ops num crítico de conteúdo", async () => {
    const world = { rows: [{ lessons: INCIDENT_ROW, approved_at: "2026-09-02T00:00:00Z" }], tableExists: true };
    const ports = buildPorts(fakeMemoryTableSql(world), fakeRedis);
    expect(await ports.substrate.activeMemoryLessons!()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// O snapshot 'ops' (watchdog diário + weekly-report) carrega as lições.
// ---------------------------------------------------------------------------

const PER_GRAPH = [
  { graph: "daily-watchdog", runs: "14", succeeded: "13", failed: "1", running: "0", cost_cents: "420", avg_seconds: "95" },
];

function fakeOpsSql(opts: { incidentRows?: Array<{ lessons: string; approved_at: string }>; tableMissing?: boolean }) {
  return (async (strings: TemplateStringsArray) => {
    const text = strings.join("$");
    if (text.includes("snap:incident-lessons")) {
      if (opts.tableMissing) {
        const err = new Error('relation "ops.memory_lesson" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      return opts.incidentRows ?? [];
    }
    if (text.includes("GROUP BY graph")) return PER_GRAPH;
    return []; // hotspots, dupes, tenant-cost: dia quieto
  }) as unknown as postgres.Sql;
}

describe("buildSnapshot('ops') — 'Licoes de incidentes ativas' para o cérebro de ops", () => {
  it("com linha gravada: a seção aparece com o texto da lição", async () => {
    const snap = await buildSnapshot(
      fakeOpsSql({ incidentRows: [{ lessons: INCIDENT_ROW, approved_at: "2026-08-27T10:00:00Z" }] }),
      "ops",
      14
    );
    expect(snap).toContain("Licoes de incidentes ativas");
    expect(snap).toContain(`${INCIDENT_LESSON_PREFIX} (postmortem aprovado 2026-08-27):`);
    expect(snap).toContain("NUNCA pinar o engine no chamador");
  });

  it("loja vazia: NENHUMA seção — sem placeholder", async () => {
    const snap = await buildSnapshot(fakeOpsSql({}), "ops", 14);
    expect(snap).not.toContain("Licoes de incidentes ativas");
    expect(snap).toContain("daily-watchdog"); // o resto do digest intacto
  });

  it("tabela ausente (42P01): fail-open — snapshot inteiro segue funcionando", async () => {
    const snap = await buildSnapshot(fakeOpsSql({ tableMissing: true }), "ops", 14);
    expect(snap).toContain("daily-watchdog");
    expect(snap).not.toContain("Licoes de incidentes ativas");
  });
});
