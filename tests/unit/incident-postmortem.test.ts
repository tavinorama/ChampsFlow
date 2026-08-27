/**
 * incident-postmortem (5.D.2) — o postmortem automático, pregado.
 *
 * A semana de 18-22/08 rendeu 3 postmortems escritos à mão, depois que o
 * founder achou o buraco por SQL manual. O que está pregado aqui:
 *
 *  - DETECÇÃO É SQL/CÓDIGO, nunca palpite de LLM ("vigia também mente"):
 *    thresholds em TS testáveis — 2 falhas ≠ incidente, 3 = incidente;
 *    1 reconciliação starved/órfã já é incidente; timeouts de aprovação só
 *    "em massa" (>=3); rejeição do founder NUNCA conta (decisão humana);
 *  - DIA QUIETO É SILÊNCIO AUDITÁVEL: zero runs do grafo, zero Telegram —
 *    só um registro '__quiet__' no substrate (um 🟢 diário treinaria o
 *    founder a ignorar o canal);
 *  - EVIDÊNCIA SÓ DE SQL: todo número do rascunho vem do bloco [evidence]
 *    que o runner agregou; o compose é proibido de inventar;
 *  - GATE DO FOUNDER: nada vira postmortem sem o sim; timeout de 96h =
 *    rejeição por silêncio = nada entregue, nada armazenado;
 *  - O COMMIT EM docs/learning/ SEGUE HUMANO — o report aprovado diz isso
 *    com todas as letras (v1 honesta, sem store durável).
 *
 * Fake sql roteado pelos marcadores /* pm:* *\/ das próprias queries (o
 * padrão de graph-tick-starvation.test.ts): o teste pinça o USO que o código
 * faz das queries (thresholds, exclusões, caps), não o motor SQL.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import {
  detectIncidentSignatures,
  incidentEvidenceBlock,
  runIncidentPostmortemDaily,
  FAILURE_CLUSTER_MIN,
  APPROVAL_TIMEOUT_MASS_MIN,
  QUIET_SUMMARY,
} from "../../apps/worker/src/jobs/graph-tick";
import {
  advanceRun,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { INCIDENT_POSTMORTEM_GRAPH, validateGraph } from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, PROMPT_SLUGS } from "../../apps/api/src/lib/graph-prompts";

// ---------------------------------------------------------------------------
// Fake sql world for the DETECTION + daily scan, routed on /* pm:* */ markers.
// Raw failed steps in, documented SQL semantics emulated in memory — so the
// exclusion rules (approval fora do cluster, steps sintéticos fora, rejeição
// nunca conta) are exercised, not assumed.
// ---------------------------------------------------------------------------

interface FailedStep {
  graph: string;
  node: string;
  summary: string;
}

function makeScanWorld(input: {
  failedSteps?: FailedStep[];
  /** Existing incident-postmortem run inside the 20h look-back? */
  hasRecentRun?: boolean;
}) {
  const failed = input.failedSteps ?? [];
  const inserts: Array<{ marker: string; values: unknown[] }> = [];
  const telegrams: string[] = [];

  const isSynthetic = (n: string) => n === "__starved__" || n === "__orphan__";
  const isApproval = (n: string) => n.toLowerCase().includes("approval");
  const clusterable = failed.filter((s) => !isSynthetic(s.node) && !isApproval(s.node));

  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("pm:recent-run")) {
      return input.hasRecentRun ? [{ id: "run-recent" }] : [];
    }
    if (text.includes("pm:failed-clusters")) {
      const byGraph = new Map<string, number>();
      for (const s of clusterable) byGraph.set(s.graph, (byGraph.get(s.graph) ?? 0) + 1);
      return [...byGraph.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([graph, fails]) => ({
          graph,
          fails: String(fails),
          first_at: "2026-08-26T09:00:00Z",
          last_at: "2026-08-26T21:00:00Z",
        }));
    }
    if (text.includes("pm:failed-samples")) {
      const graphs = values.find((v) => Array.isArray(v)) as string[];
      const perGraph = new Map<string, number>();
      const out: Array<{ graph: string; summary: string }> = [];
      for (const s of clusterable) {
        if (!graphs.includes(s.graph)) continue;
        const n = perGraph.get(s.graph) ?? 0;
        if (n >= 3) continue; // ROW_NUMBER() <= 3
        perGraph.set(s.graph, n + 1);
        out.push({ graph: s.graph, summary: (s.summary || "sem resumo").slice(0, 160) }); // LEFT(...,160)
      }
      return out;
    }
    if (text.includes("pm:reconciliations")) {
      const byNode = new Map<string, { n: number; graphs: Set<string> }>();
      for (const s of failed) {
        if (!isSynthetic(s.node)) continue;
        const e = byNode.get(s.node) ?? { n: 0, graphs: new Set<string>() };
        e.n += 1;
        e.graphs.add(s.graph);
        byNode.set(s.node, e);
      }
      return [...byNode.entries()].map(([node, e]) => ({
        node,
        n: String(e.n),
        first_at: "2026-08-26T07:10:00Z",
        last_at: "2026-08-26T07:10:00Z",
        graphs: [...e.graphs].sort().join(", "),
      }));
    }
    if (text.includes("pm:approval-timeouts")) {
      const t = failed.filter((s) => isApproval(s.node) && s.summary.startsWith("approval timed out"));
      // COUNT(*) devolve sempre UMA linha, n='0' quando não há timeout.
      return [
        {
          n: String(t.length),
          first_at: t.length > 0 ? "2026-08-25T10:00:00Z" : null,
          last_at: t.length > 0 ? "2026-08-26T04:00:00Z" : null,
          graphs: t.length > 0 ? [...new Set(t.map((s) => s.graph))].sort().join(", ") : null,
        },
      ];
    }
    if (text.includes("pm:quiet-run")) {
      inserts.push({ marker: "pm:quiet-run", values });
      return [{ id: "run-quiet-1" }];
    }
    if (text.includes("pm:quiet-step")) {
      inserts.push({ marker: "pm:quiet-step", values });
      return [];
    }
    if (text.includes("pm:incident-run")) {
      inserts.push({ marker: "pm:incident-run", values });
      return [{ id: "run-incident-abcdef12" }];
    }
    throw new Error(`unrouted query in fake sql: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;

  const scan = () =>
    runIncidentPostmortemDaily(sql, {
      hermesToken: "test-token",
      telegram: async (t: string) => {
        telegrams.push(t);
      },
    });

  return { sql, inserts, telegrams, scan };
}

// ---------------------------------------------------------------------------
// O desenho do grafo — registry, validação, gate antes do report.
// ---------------------------------------------------------------------------

describe("incident-postmortem (5.D.2) — o desenho", () => {
  it("está no registry, valida, é do CEO (nunca conta na válvula de marketing)", () => {
    const def = GRAPH_REGISTRY["incident-postmortem"];
    expect(def, "incident-postmortem fora do registry — o cron não iniciaria nada").toBeTruthy();
    expect(def).toBe(INCIDENT_POSTMORTEM_GRAPH);
    expect(def!.vpOwner).toBe("ceo");
    expect(validateGraph(def!).errors).toEqual([]);
    expect(def!.nodes.map((n) => n.id)).toEqual(["evidence", "compose", "approval", "report"]);
  });

  it("a máquina propõe, nunca registra: sem publish, sem spawn, sem harvest, sem store", () => {
    const kinds = new Set(INCIDENT_POSTMORTEM_GRAPH.nodes.map((n) => String(n.kind)));
    for (const forbidden of ["publish", "spawn", "harvest", "store"]) {
      expect(kinds.has(forbidden), `incident-postmortem não pode ter nó '${forbidden}'`).toBe(false);
    }
  });

  it("evidência é SQL (snapshot source 'incidents', 24h) e o gate fica ANTES do report", () => {
    const evidence = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "evidence")!;
    expect(evidence.kind).toBe("snapshot");
    expect(evidence.config).toMatchObject({ source: "incidents", days: 1 });

    const approval = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "approval")!;
    expect(approval.kind).toBe("approval");
    // Timeout declarado = 96h; silêncio é rejeição, nunca aprovação.
    expect(approval.config).toMatchObject({ channel: "telegram", timeoutHours: 96 });
    expect(approval.config?.["optional"]).toBeUndefined(); // rejeição fecha o run, alto e claro

    // O report exige a aprovação E carrega o rascunho (o artefato do compose).
    const report = INCIDENT_POSTMORTEM_GRAPH.nodes.find((n) => n.id === "report")!;
    expect(report.dependsOn).toContain("approval");
    expect(report.dependsOn).toContain("compose");
    expect(String(report.config?.["title"])).toContain("commit manual");
  });

  it("o prompt postmortem-compose resolve, é PT, se declara RASCUNHO DE MÁQUINA e proíbe inventar", () => {
    expect(PROMPT_SLUGS).toContain("postmortem-compose");
    const p = buildPrompt("task", { prompt: "postmortem-compose" }, []) ?? "";
    expect(p).toBeTruthy();
    expect(p).toContain("EM PORTUGUES");
    expect(p).toContain("RASCUNHO DE MAQUINA");
    // Causa raiz é sempre hipótese, com todas as letras.
    expect(p).toContain("HIPOTESE");
    expect(p).toContain("nao confirmada por humano");
    // Só os números do [evidence] — nunca inventa.
    expect(p).toContain("NUNCA invente");
    // O formato da casa (docs/learning/postmortems/*.md).
    for (const section of ["O que aconteceu", "Impacto", "O que nos protegeu / o que nao", "Licoes propostas"]) {
      expect(p, `secao '${section}' ausente do compose`).toContain(section);
    }
    // O passo final é humano — o rascunho diz isso a quem o lê.
    expect(p).toContain("a maquina nao escreve nos docs");
    // Re-checagem vazia degrada honesta, sem fabricar incidente.
    expect(p).toContain("SEM INCIDENTE CONFIRMADO NA RE-CHECAGEM");
  });
});

// ---------------------------------------------------------------------------
// Detecção — thresholds em TS, exclusões e caps.
// ---------------------------------------------------------------------------

describe("detecção — SQL decide, com thresholds testáveis", () => {
  it("2 falhas no mesmo graph NÃO são incidente; 3 SÃO (threshold em TS, não em HAVING)", async () => {
    expect(FAILURE_CLUSTER_MIN).toBe(3);
    const two = makeScanWorld({
      failedSteps: [
        { graph: "daily-video", node: "briefing", summary: "hermes task failed: oauth expired" },
        { graph: "daily-video", node: "angle-a", summary: "hermes task failed: oauth expired" },
      ],
    });
    expect(await detectIncidentSignatures(two.sql, 24)).toEqual([]);

    const three = makeScanWorld({
      failedSteps: [
        { graph: "daily-video", node: "briefing", summary: "hermes task failed: oauth expired" },
        { graph: "daily-video", node: "angle-a", summary: "hermes task failed: oauth expired" },
        { graph: "daily-video", node: "angle-b", summary: "hermes task failed: oauth expired" },
      ],
    });
    const sigs = await detectIncidentSignatures(three.sql, 24);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ kind: "failure-cluster", graph: "daily-video", count: 3 });
    // A evidência carrega o erro LITERAL — o rascunho cita, não parafraseia.
    expect(sigs[0]!.detail).toContain('"hermes task failed: oauth expired"');
  });

  it("2 falhas aqui + 2 falhas ali (graphs diferentes) seguem abaixo do threshold — cluster é POR GRAPH", async () => {
    const world = makeScanWorld({
      failedSteps: [
        { graph: "daily-video", node: "briefing", summary: "x" },
        { graph: "daily-video", node: "angle-a", summary: "x" },
        { graph: "sphere-x", node: "signal", summary: "y" },
        { graph: "sphere-x", node: "briefing", summary: "y" },
      ],
    });
    expect(await detectIncidentSignatures(world.sql, 24)).toEqual([]);
  });

  it("rejeição do founder e timeout de aprovação NUNCA entram no cluster de falhas", async () => {
    const world = makeScanWorld({
      failedSteps: [
        // 2 falhas reais + 1 rejeição + 1 timeout no MESMO graph: sem cluster.
        { graph: "sphere-linkedin", node: "briefing", summary: "hermes task failed" },
        { graph: "sphere-linkedin", node: "critic", summary: "hermes task failed" },
        { graph: "sphere-linkedin", node: "approval", summary: "rejected: tom vendedor" },
        { graph: "sphere-linkedin", node: "founder-approval", summary: "approval timed out after 96h — no decision" },
      ],
    });
    const sigs = await detectIncidentSignatures(world.sql, 24);
    expect(sigs.filter((s) => s.kind === "failure-cluster")).toEqual([]);
    // ...e 1 timeout sozinho também não é "em massa".
    expect(sigs.filter((s) => s.kind === "approval-timeout-mass")).toEqual([]);
  });

  it("UMA reconciliação starved já é incidente (a fome de 18-20/08 começou com uma)", async () => {
    const world = makeScanWorld({
      failedSteps: [{ graph: "daily-watchdog", node: "__starved__", summary: "starved: scheduler starvation (fix PR)" }],
    });
    const sigs = await detectIncidentSignatures(world.sql, 24);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ kind: "reconciliation", count: 1 });
    expect(sigs[0]!.detail).toContain("__starved__");
    expect(sigs[0]!.detail).toContain("daily-watchdog");
  });

  it("timeouts de aprovação: 2 não são massa; 3 são", async () => {
    expect(APPROVAL_TIMEOUT_MASS_MIN).toBe(3);
    const mk = (n: number) =>
      makeScanWorld({
        failedSteps: Array.from({ length: n }, (_, i) => ({
          graph: `graph-${i}`,
          node: "approval",
          summary: "approval timed out after 96h — no decision",
        })),
      });
    expect(await detectIncidentSignatures(mk(2).sql, 24)).toEqual([]);
    const sigs = await detectIncidentSignatures(mk(3).sql, 24);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ kind: "approval-timeout-mass", count: 3 });
    expect(sigs[0]!.detail).toContain("graph-0");
  });

  it("resumo de erro entra LITERAL mas com tamanho capado (160 chars por amostra)", async () => {
    const long = "e".repeat(500);
    const world = makeScanWorld({
      failedSteps: [1, 2, 3].map((i) => ({ graph: "daily-video", node: `n${i}`, summary: long })),
    });
    const sigs = await detectIncidentSignatures(world.sql, 24);
    expect(sigs[0]!.detail).toContain("e".repeat(160));
    expect(sigs[0]!.detail).not.toContain("e".repeat(161));
  });

  it("o bloco de evidência é só formatação dos números do SQL — vazio quando não há assinatura", () => {
    expect(incidentEvidenceBlock([])).toBe("");
    const block = incidentEvidenceBlock([
      {
        kind: "failure-cluster",
        graph: "daily-video",
        count: 5,
        firstAt: "2026-08-26T09:00:00Z",
        lastAt: "2026-08-26T21:00:00Z",
        detail: 'erros: "oauth expired"',
      },
    ]);
    expect(block).toContain("ASSINATURAS DE INCIDENTE (scan SQL");
    expect(block).toContain("CLUSTER DE FALHAS em daily-video: 5 ocorrencia(s)");
    expect(block).toContain("2026-08-26T09:00:00Z → 2026-08-26T21:00:00Z");
    expect(block).toContain('"oauth expired"');
    // O contrato do compose está escrito NO próprio bloco.
    expect(block).toContain("nada foi estimado");
  });
});

// ---------------------------------------------------------------------------
// O scan diário — quieto em dia quieto, alto em dia de incidente.
// ---------------------------------------------------------------------------

describe("scan diário — dia quieto é silêncio auditável", () => {
  it("sem assinatura: NENHUM run do grafo inicia, ZERO Telegram — só o registro '__quiet__'", async () => {
    const world = makeScanWorld({ failedSteps: [] });
    const res = await world.scan();

    expect(res.quiet).toBe(true);
    expect(res.started).toEqual([]);
    // Silêncio no telefone (um 🟢 diário viraria ruído ignorado)…
    expect(world.telegrams).toEqual([]);
    // …mas registro auditável no substrate ("todo job auditável").
    expect(world.inserts.map((i) => i.marker)).toEqual(["pm:quiet-run", "pm:quiet-step"]);
    const step = world.inserts.find((i) => i.marker === "pm:quiet-step")!;
    expect(step.values).toContain(QUIET_SUMMARY);
    // E o run de verdade nunca nasceu.
    expect(world.inserts.some((i) => i.marker === "pm:incident-run")).toBe(false);
  });

  it("com assinatura: inicia o run e avisa UMA vez, nomeando o que o SQL viu", async () => {
    const world = makeScanWorld({
      failedSteps: [
        { graph: "daily-video", node: "briefing", summary: "oauth expired" },
        { graph: "daily-video", node: "angle-a", summary: "oauth expired" },
        { graph: "daily-video", node: "angle-b", summary: "oauth expired" },
      ],
    });
    const res = await world.scan();

    expect(res.quiet).toBe(false);
    expect(res.started).toEqual(["incident-postmortem:run-inci"]);
    expect(world.inserts.map((i) => i.marker)).toEqual(["pm:incident-run"]);
    expect(world.telegrams).toHaveLength(1);
    expect(world.telegrams[0]).toContain("INCIDENTE DETECTADO");
    expect(world.telegrams[0]).toContain("failure-cluster(daily-video)×3");
    expect(world.telegrams[0]).toContain("commit em docs/learning/ segue manual");
  });

  it("idempotente por dia: run recente na janela de 20h → skip, nada inserido, nada enviado", async () => {
    const world = makeScanWorld({ failedSteps: [], hasRecentRun: true });
    const res = await world.scan();
    expect(res.skipped).toEqual(["incident-postmortem"]);
    expect(res.quiet).toBe(false);
    expect(world.inserts).toEqual([]);
    expect(world.telegrams).toEqual([]);
  });

  it("incidente + HERMES_TASK_TOKEN ausente = grita com a ação que destrava, e NÃO cria run condenado", async () => {
    const world = makeScanWorld({
      failedSteps: [1, 2, 3].map((i) => ({ graph: "daily-video", node: `n${i}`, summary: "boom" })),
    });
    const res = await runIncidentPostmortemDaily(world.sql, {
      hermesToken: "",
      telegram: async (t: string) => {
        world.telegrams.push(t);
      },
    });
    expect(res.started).toEqual([]);
    expect(res.skipped).toEqual(["incident-postmortem"]);
    expect(world.inserts.some((i) => i.marker === "pm:incident-run")).toBe(false);
    expect(world.telegrams).toHaveLength(1);
    expect(world.telegrams[0]).toContain("SEM EXECUTOR");
    expect(world.telegrams[0]).toContain("HERMES_TASK_TOKEN");
  });
});

// ---------------------------------------------------------------------------
// O run inteiro no harness do runner — evidência → rascunho → gate → report.
// ---------------------------------------------------------------------------

const EVIDENCE_TEXT = [
  "ASSINATURAS DE INCIDENTE (scan SQL sobre ops.*, ultimas 24h):",
  "",
  '- CLUSTER DE FALHAS em daily-video: 5 ocorrencia(s) · janela 2026-08-26T09:00:00Z → 2026-08-26T21:00:00Z (UTC) · erros: "oauth expired"',
  "",
  "(Todo numero acima veio de agregacao SQL sobre ops.agent_step/ops.agent_run — nada foi estimado. O rascunho so pode usar o que esta neste bloco.)",
].join("\n");

const DRAFT_TEXT = "> RASCUNHO DE MAQUINA (incident-postmortem) — pendente validacao humana.\n# Postmortem — 5 falhas no daily-video";

interface RunWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  published: Array<{ channel: string; post: string }>;
  snapshotCalls: Array<{ source: string; days: number }>;
  taskPromptsByNode: Record<string, string>;
  clock: { now: Date };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeRunWorld(): RunWorld {
  const clock = { now: new Date("2026-08-27T07:10:00Z") };
  const run: RunRow = {
    id: "run-pm",
    graph: INCIDENT_POSTMORTEM_GRAPH.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: RunWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: RunWorld = {
    run,
    steps,
    telegrams: [],
    published: [],
    snapshotCalls: [],
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
          return "outcome-never";
        },
        publishedToday: async () => 0,
        async readHarvest() {
          return { n: 0, total: 0 };
        },
        async snapshot(input) {
          world.snapshotCalls.push({ source: input.source, days: input.days });
          return input.source === "incidents" ? EVIDENCE_TEXT : "";
        },
        async startRun() {
          throw new Error("incident-postmortem must never spawn");
        },
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          return { ok: true, output: DRAFT_TEXT, engineUsed: "claude", ms: 50 };
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

async function tick(world: RunWorld, n = 1): Promise<void> {
  for (let i = 0; i < n && world.run.status === "running"; i++) {
    await advanceRun(INCIDENT_POSTMORTEM_GRAPH, world.run.id, world.ports);
  }
}

describe("incident-postmortem — o run inteiro no harness do runner", () => {
  it("evidência SQL → compose vê SÓ os fatos → gate; o report NÃO sai antes do sim", async () => {
    const world = makeRunWorld();
    await tick(world, 3); // evidence → compose → approval parks

    // A evidência veio do snapshot 'incidents' de 24h — e só dele.
    expect(world.snapshotCalls).toEqual([{ source: "incidents", days: 1 }]);

    // O compose recebeu o bloco [evidence] com os números literais do SQL.
    const composePrompt = world.taskPromptsByNode["compose"] ?? "";
    expect(composePrompt).toContain("[evidence]");
    expect(composePrompt).toContain("CLUSTER DE FALHAS em daily-video: 5 ocorrencia(s)");
    expect(composePrompt).toContain("NUNCA invente numero");

    // O gate parou o run: approval waiting, report nem começou.
    expect(world.stepByNode("approval")?.status).toBe("waiting");
    expect(world.stepByNode("report")).toBeUndefined();
    expect(world.run.status).toBe("running");

    // A pergunta do gate deixa claro que o commit nos docs é humano.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask, "o pedido de aprovação não chegou ao Telegram").toBeTruthy();
    expect(ask).toContain("commit em docs/learning/");
    expect(ask).toContain("RASCUNHO DE MAQUINA");
  });

  it("aprovado: o rascunho INTEIRO chega ao founder com o passo manual; run SUCCEEDED, nada publicado", async () => {
    const world = makeRunWorld();
    await tick(world, 3);

    // O founder toca ✅ — o webhook #445 finaliza o step como succeeded.
    const approval = world.stepByNode("approval")!;
    approval.status = "succeeded";
    approval.summary = "approved via telegram";
    await tick(world, 2);

    expect(world.stepByNode("report")?.status).toBe("succeeded");
    const delivered = world.telegrams.find((t) => t.includes("POSTMORTEM APROVADO"));
    expect(delivered, "o report do rascunho aprovado não chegou").toBeTruthy();
    // O texto integral do rascunho (é o artefato do compose) + o passo humano.
    expect(delivered).toContain(DRAFT_TEXT);
    expect(delivered).toContain("commit manual em docs/learning/postmortems/");

    expect(world.run.status).toBe("succeeded");
    expect(world.published).toEqual([]);
  });

  it("timeout de 96h = rejeição por silêncio: run FAILED, report nunca sai, nada é armazenado", async () => {
    const world = makeRunWorld();
    await tick(world, 3);
    expect(world.stepByNode("approval")?.status).toBe("waiting");

    // 97h de silêncio do founder.
    world.clock.now = new Date(world.clock.now.getTime() + 97 * 3_600_000);
    await tick(world, 2);

    expect(world.stepByNode("approval")?.status).toBe("failed");
    expect(world.stepByNode("approval")?.summary).toContain("timed out");
    expect(world.run.status).toBe("failed");
    // Nada entregue como postmortem, nada publicado — silêncio nunca aprova.
    expect(world.stepByNode("report")).toBeUndefined();
    expect(world.telegrams.some((t) => t.includes("POSTMORTEM APROVADO"))).toBe(false);
    expect(world.telegrams.some((t) => t.includes("APROVAÇÃO EXPIROU"))).toBe(true);
    expect(world.published).toEqual([]);
  });

  it("rejeição explícita do founder também fecha o run sem entregar nada", async () => {
    const world = makeRunWorld();
    await tick(world, 3);
    const approval = world.stepByNode("approval")!;
    approval.status = "failed";
    approval.summary = "rejected: números não batem com o que vi";
    await tick(world, 2);

    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("report")).toBeUndefined();
    expect(world.telegrams.some((t) => t.includes("POSTMORTEM APROVADO"))).toBe(false);
  });
});
