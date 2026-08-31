/**
 * 5.F.2 — prompt-tuning gated.
 *
 * Os prompts das esferas eram CÓDIGO ESTÁTICO: melhorar um prompt exigia PR
 * humano, então os vereditos e as rejeições registrados toda semana não
 * mudavam nada. O grafo semanal prompt-tuner fecha o loop, founder-gated:
 * evidência agregada por SQL → NO MÁXIMO UMA proposta → aprovação no
 * Telegram → override append-only em ops.prompt_override → o runner resolve
 * cada prompt primeiro no override (mais novo por chave vence).
 *
 * O que está pregado aqui:
 *  - override vence o estático; body vazio reverte ao estático; chave fora da
 *    allowlist é IGNORADA na leitura e RECUSADA no store (não só no prompt);
 *  - a régua LESSONS_VETO_RULE nunca sai de um crítico com override, e o
 *    [__lessons__]/CONTENT_LESSONS segue injetado pelo runner por fora;
 *  - a agregação é SQL (snapshot source 'tuning', fake sql por markers);
 *  - gate do founder: rejeição e timeout (96h) NUNCA gravam override;
 *  - o parser impõe NO MÁXIMO UMA mudança por rodada;
 *  - round-trip do armazém real (buildPorts): newest-row-wins; 42P01 =
 *    fail-open na leitura, fail-soft no store, cron declara a feature OFF
 *    com a ação nominal ("mergeado ≠ produção").
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import {
  advanceRun,
  GRAPH_REGISTRY,
  LESSONS_ARTIFACT,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  PROMPT_TUNER_GRAPH,
  SPHERE_X_GRAPH,
  validateGraph,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import {
  buildPrompt,
  PROMPT_SLUGS,
  TUNABLE_PROMPT_KEYS,
  isTunablePromptKey,
  parsePromptProposal,
} from "../../apps/api/src/lib/graph-prompts";
import {
  buildSnapshot,
  buildPorts,
  runPromptTunerWeekly,
  promptOverrideStoreReady,
  isGatedMarketingGraph,
  PROMPT_OVERRIDE_MISSING_ACTION,
} from "../../apps/worker/src/jobs/graph-tick";

const NEW_BODY =
  "Voce e o critico da esfera X v2: alem das 3 perguntas, VETE gancho que ja rendeu 0 impressions duas vezes.";

const PROPOSAL_TEXT = [
  "PROMPT_KEY: x-critic",
  "DIFF: adiciona veto explicito a gancho reincidente com 0 impressions",
  "EVIDENCIA: - 2026-08-20 (sphere-x): verdict x_impressions: total=0 n=4",
  "ROLLBACK: para reverter, aprovar na proxima rodada uma linha nova com o body anterior — ou body vazio para voltar ao prompt estatico do codigo",
  "[BODY]",
  NEW_BODY,
  "[/BODY]",
].join("\n");

// ---------------------------------------------------------------------------
// O desenho do grafo + trilhos de segurança estruturais.
// ---------------------------------------------------------------------------

describe("prompt-tuner (5.F.2) — o desenho", () => {
  it("está no registry, valida, é CEO-owned e tem os 5 nós do desenho", () => {
    const def = GRAPH_REGISTRY["prompt-tuner"];
    expect(def, "prompt-tuner fora do registry — o cron semanal não iniciaria nada").toBeTruthy();
    expect(def).toBe(PROMPT_TUNER_GRAPH);
    expect(def!.vpOwner).toBe("ceo");
    expect(validateGraph(def!).errors).toEqual([]);
    expect(def!.nodes.map((n) => n.id)).toEqual(["evidence", "compose", "approval", "store", "report"]);
  });

  it("o input é o snapshot 'tuning' de 21d e o compose depende SÓ dele", () => {
    const evidence = PROMPT_TUNER_GRAPH.nodes.find((n) => n.id === "evidence")!;
    expect(evidence.kind).toBe("snapshot");
    expect(evidence.config).toMatchObject({ source: "tuning", days: 21 });
    const compose = PROMPT_TUNER_GRAPH.nodes.find((n) => n.id === "compose")!;
    expect(compose.dependsOn).toEqual(["evidence"]);
  });

  it("o store é o MESMO kind do 5.F.1 (roteado por target) e é gated: validateGraph rejeita store sem approval", () => {
    const store = PROMPT_TUNER_GRAPH.nodes.find((n) => n.id === "store")!;
    expect(store.kind).toBe("store");
    expect(store.config).toMatchObject({ target: "prompt-override" });
    expect(store.dependsOn).toEqual(["approval"]);
    const approval = PROMPT_TUNER_GRAPH.nodes.find((n) => n.id === "approval")!;
    expect(approval.config).toMatchObject({ channel: "telegram", timeoutHours: 96 });

    // A regra dura, negada: um grafo em que um prompt se auto-ativa NÃO existe.
    const rogue: GraphDefinition = {
      slug: "rogue-tuner",
      version: 1,
      vpOwner: "ceo",
      description: "store sem humano",
      nodes: [
        { id: "compose", kind: "task", dependsOn: [], config: { prompt: "prompt-tuner-compose" } },
        { id: "store", kind: "store", dependsOn: ["compose"], config: { target: "prompt-override" } },
      ],
    };
    const v = validateGraph(rogue);
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toContain("store node 'store' has no approval node upstream");
  });

  it("é CEO-owned de propósito: nunca conta na válvula de aprovações de marketing", () => {
    expect(isGatedMarketingGraph("prompt-tuner")).toBe(false);
  });

  it("allowlist: só drafts/críticos de marketing; nada de approval/publish/store; sem auto-modificação; toda chave existe", () => {
    // Toda chave tunável resolve num prompt real do registry.
    for (const key of TUNABLE_PROMPT_KEYS) {
      expect(PROMPT_SLUGS, `chave tunavel '${key}' nao existe no registry de prompts`).toContain(key);
    }
    // Auto-modificação proibida: o compose do tuner NÃO é tunável.
    expect(isTunablePromptKey("prompt-tuner-compose")).toBe(false);
    // Prompts dos brains (leitura do registro) fora da allowlist.
    for (const brainKey of ["watchdog-cost", "watchdog-synthesis", "dream-synthesis", "memory-consolidation-compose", "postmortem-compose", "weekly-report-compose"]) {
      expect(isTunablePromptKey(brainKey), `'${brainKey}' nao pode ser tunavel`).toBe(false);
    }
    // As chaves da allowlist são só criação (draft/outline/plan) e crítica.
    for (const key of TUNABLE_PROMPT_KEYS) {
      expect(
        /(-draft|draft-angle|-outline|-plan|-critic|critique)/.test(key),
        `'${key}' nao e draft nem critico`
      ).toBe(true);
    }
  });

  it("o prompt compose resolve, é estrito (uma mudança, allowlist, sem inventar, sem auto-modificação, com rollback)", () => {
    expect(PROMPT_SLUGS).toContain("prompt-tuner-compose");
    const p = buildPrompt("task", { prompt: "prompt-tuner-compose" }, []) ?? "";
    expect(p).toContain("NO MAXIMO UMA mudanca");
    expect(p).toContain("SOMENTE os fatos do bloco [evidence]");
    expect(p).toContain("NUNCA invente numero");
    expect(p).toContain("allowlist");
    expect(p).toContain("NUNCA se auto-modifica");
    expect(p).toContain("SEM MUDANCA ESTA SEMANA");
    expect(p).toContain("ROLLBACK");
    expect(p).toContain("[BODY]");
    // A allowlist inteira viaja no prompt — o modelo escolhe de uma lista fechada.
    for (const key of TUNABLE_PROMPT_KEYS) expect(p).toContain(key);
  });
});

// ---------------------------------------------------------------------------
// O parser da proposta — o contrato "no máximo uma mudança" vive em código.
// ---------------------------------------------------------------------------

describe("parsePromptProposal — contrato estrito", () => {
  it("proposta válida: extrai chave e body completo", () => {
    expect(parsePromptProposal(PROPOSAL_TEXT)).toEqual({
      kind: "proposal",
      promptKey: "x-critic",
      body: NEW_BODY,
    });
  });

  it("SEM MUDANCA é o 'nada a propor' honesto", () => {
    const r = parsePromptProposal("SEM MUDANCA ESTA SEMANA — evidencia insuficiente.");
    expect(r.kind).toBe("none");
  });

  it("duas propostas num run = INVÁLIDO (no máximo UMA — imposto no código, não pedido por favor)", () => {
    const two = `${PROPOSAL_TEXT}\nPROMPT_KEY: linkedin-critic\n[BODY]\noutro\n[/BODY]`;
    const r = parsePromptProposal(two);
    expect(r.kind).toBe("invalid");
    expect((r as { reason: string }).reason).toContain("NO MAXIMO UMA");
  });

  it("sem bloco [BODY] = inválido; body vazio = VÁLIDO (proposta de reverter ao estático)", () => {
    expect(parsePromptProposal("PROMPT_KEY: x-critic\nDIFF: x").kind).toBe("invalid");
    const revert = parsePromptProposal("PROMPT_KEY: x-critic\nDIFF: reverte\n[BODY]\n[/BODY]");
    expect(revert).toEqual({ kind: "proposal", promptKey: "x-critic", body: "" });
  });
});

// ---------------------------------------------------------------------------
// Resolução do override em buildPrompt.
// ---------------------------------------------------------------------------

describe("buildPrompt — override do banco vence o estático, com trilhos", () => {
  const upstream: Array<[string, string]> = [["briefing", "TESE: algo"]];

  it("override vence o estático e o contexto upstream segue apendado", () => {
    const p = buildPrompt("task", { prompt: "x-draft" }, upstream, { "x-draft": "PROMPT NOVO DO BANCO." }) ?? "";
    expect(p).toContain("PROMPT NOVO DO BANCO.");
    expect(p).not.toContain("Voce e um escritor de X (Twitter)"); // o corpo estático saiu
    expect(p).toContain("CONTEXTO DOS PASSOS ANTERIORES");
    expect(p).toContain("TESE: algo");
  });

  it("body vazio = reverte ao prompt estático (o contrato de rollback)", () => {
    const p = buildPrompt("task", { prompt: "x-draft" }, upstream, { "x-draft": "" }) ?? "";
    expect(p).toContain("Voce e um escritor de X (Twitter)");
  });

  it("chave fora da allowlist é IGNORADA na leitura mesmo que a linha exista", () => {
    const p =
      buildPrompt("task", { prompt: "watchdog-cost" }, upstream, { "watchdog-cost": "prompt malicioso" }) ?? "";
    expect(p).not.toContain("prompt malicioso");
    expect(p).toContain("Watchdog LEAN");
    // E o próprio tuner nunca se auto-modifica, nem via linha manual no banco.
    const own =
      buildPrompt("task", { prompt: "prompt-tuner-compose" }, [], { "prompt-tuner-compose": "hack" }) ?? "";
    expect(own).not.toContain("hack");
    expect(own).toContain("afinador de prompts");
  });

  it("crítico com override NUNCA perde a régua de veto institucional (LESSONS_VETO_RULE reapendada)", () => {
    const p = buildPrompt("debate", { prompt: "x-critic" }, upstream, { "x-critic": NEW_BODY }) ?? "";
    expect(p).toContain(NEW_BODY);
    expect(p).toContain("LICOES INSTITUCIONAIS (com VETO)");
    expect(p).toContain("[__lessons__]");
  });

  it("sem mapa de overrides (undefined/null), tudo se comporta exatamente como antes", () => {
    const a = buildPrompt("task", { prompt: "x-draft" }, upstream);
    const b = buildPrompt("task", { prompt: "x-draft" }, upstream, null);
    expect(a).toBe(b);
    expect(a).toContain("Voce e um escritor de X (Twitter)");
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
  snapshotCalls: Array<{ source: string; days: number }>;
  storedOverrides: Array<{ runId: string; promptKey: string; body: string }>;
  taskPromptsByNode: Record<string, string>;
  clock: { now: Date };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  def: GraphDefinition,
  opts: {
    /** null = sem override ativo; mapa = overrides ativos; undefined = porta ausente. */
    activeOverrides?: Record<string, string> | null;
    /** false = storePromptOverride ausente; fn própria para simular falha. */
    store?:
      | false
      | ((input: { runId: string; promptKey: string; body: string }) => Promise<{ ok: boolean; reason?: string }>);
    composeOutput?: string;
  } = {}
): FakeWorld {
  const clock = { now: new Date("2026-09-01T06:30:00Z") }; // uma terça-feira
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
    storedOverrides: [],
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
            `EVIDENCIA PARA TUNING DE PROMPTS (ops.*, ${input.days}d — fatos agregados por codigo; nada abaixo foi estimado):`,
            `VEREDITOS FECHADOS (por graph — o loop leu o proprio resultado):`,
            `- 2026-08-20 (sphere-x): verdict x_impressions: total=0 n=4`,
            `REJEICOES DO FOUNDER (motivo literal registrado — o sinal mais forte):`,
            `- 2026-08-12 (sphere-linkedin): tom vendedor`,
          ].join("\n");
        },
        async startRun() {
          throw new Error("prompt-tuner must never spawn");
        },
        ...(opts.activeOverrides !== undefined
          ? { activePromptOverrides: async () => opts.activeOverrides ?? null }
          : {}),
        ...(opts.store === false
          ? {}
          : {
              storePromptOverride:
                opts.store ??
                (async (input: { runId: string; promptKey: string; body: string }) => {
                  world.storedOverrides.push(input);
                  return { ok: true };
                }),
            }),
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          const out = node === "compose" ? (opts.composeOutput ?? PROPOSAL_TEXT) : `OUT[${node}]`;
          return { ok: true, output: out, engineUsed: "claude", ms: 10 };
        },
        async publish() {
          throw new Error("prompt-tuner must never publish");
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
// O run inteiro: compose só vê fatos, gate do founder decide, store gated.
// ---------------------------------------------------------------------------

describe("prompt-tuner — o run no harness do runner", () => {
  it("caminho feliz: snapshot tuning/21d → compose vê [evidence] → aprovação nomeia o efeito → store grava a chave+body aprovados → report", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH);
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    // O runner leu a fonte certa — e só ela.
    expect(world.snapshotCalls).toEqual([{ source: "tuning", days: 21 }]);

    // O compose recebeu os fatos agregados como [evidence] — e, sendo
    // CEO-owned, NENHUMA injeção de conteúdo de marketing.
    const composePrompt = world.taskPromptsByNode["compose"] ?? "";
    expect(composePrompt).toContain("[evidence]");
    expect(composePrompt).toContain("EVIDENCIA PARA TUNING DE PROMPTS");
    expect(composePrompt).not.toContain("[__day__]");
    expect(composePrompt).not.toContain("LICOES DA CASA");

    // A caixa de aprovação nomeia o que um "sim" ativa.
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask, "a aprovação não chegou ao Telegram").toBeTruthy();
    expect(ask).toContain("OVERRIDE de prompt");

    // Founder aprova (o webhook #445 marca o step como succeeded).
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    // O store recebeu EXATAMENTE a chave e o body que o founder aprovou.
    expect(world.storedOverrides).toEqual([{ runId: world.run.id, promptKey: "x-critic", body: NEW_BODY }]);
    expect(world.stepByNode("store")?.status).toBe("succeeded");
    expect(world.stepByNode("report")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
    const report = world.telegrams.find((t) => t.includes("PROMPT-TUNER"));
    expect(report, "o report final não chegou").toBeTruthy();
  });

  it("rejeição do founder: NADA é gravado — o store nunca roda", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH);
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    const approval = world.stepByNode("approval")!;
    approval.status = "failed";
    approval.summary = "rejected: mudanca fraca";
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.storedOverrides).toEqual([]);
    expect(world.stepByNode("store"), "store não pode nem ter começado").toBeUndefined();
  });

  it("timeout de 96h = rejeição por silêncio: NADA é gravado, dito em voz alta", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH);
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    world.clock.now = new Date(world.clock.now.getTime() + 97 * 3600 * 1000);
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.storedOverrides).toEqual([]);
    expect(world.stepByNode("store")).toBeUndefined();
    expect(world.telegrams.join("\n")).toContain("APROVAÇÃO EXPIROU");
  });

  it("TRILHO: proposta fora da allowlist é RECUSADA NO STORE (não só no prompt) — mesmo aprovada, nada grava", async () => {
    const rogueProposal = [
      "PROMPT_KEY: watchdog-synthesis", // um prompt de brain — jamais tunável
      "DIFF: hack",
      "EVIDENCIA: nenhuma",
      "ROLLBACK: n/a",
      "[BODY]",
      "prompt malicioso",
      "[/BODY]",
    ].join("\n");
    const world = makeWorld(PROMPT_TUNER_GRAPH, { composeOutput: rogueProposal });
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded"; // até um sim humano não salva chave proibida
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.storedOverrides).toEqual([]);
    const storeStep = world.stepByNode("store")!;
    expect(storeStep.status).toBe("failed");
    expect(storeStep.summary).toContain("fora da allowlist");
    expect(world.telegrams.join("\n")).toContain("OVERRIDE RECUSADO NO STORE");
  });

  it("'SEM MUDANCA' aprovado é semana válida: store conclui sem gravar nada", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH, {
      composeOutput: "SEM MUDANCA ESTA SEMANA — evidencia insuficiente.",
    });
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    expect(world.storedOverrides).toEqual([]);
    expect(world.stepByNode("store")?.status).toBe("succeeded");
    expect(world.stepByNode("store")?.summary).toContain("sem mudanca");
  });

  it("store falha (ex.: migração ausente): step falha com o motivo, Telegram grita, nada finge sucesso", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH, {
      store: async () => ({ ok: false, reason: `tabela ops.prompt_override ausente — ${PROMPT_OVERRIDE_MISSING_ACTION}` }),
    });
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    const storeStep = world.stepByNode("store")!;
    expect(storeStep.status).toBe("failed");
    expect(storeStep.summary).toContain("ops.prompt_override ausente");
    expect(world.telegrams.join("\n")).toContain("OVERRIDE NÃO GRAVADO");
  });

  it("worker sem a porta de store: falha honesta, nunca sucesso silencioso", async () => {
    const world = makeWorld(PROMPT_TUNER_GRAPH, { store: false });
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, PROMPT_TUNER_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("store")?.summary).toContain("override NAO gravado");
  });
});

// ---------------------------------------------------------------------------
// O override aplicado num grafo REAL de marketing — e as lições intactas.
// ---------------------------------------------------------------------------

describe("override em ação — sphere-x com override no crítico", () => {
  it("o critic monta com o body do override + LESSONS_VETO_RULE + [__lessons__]; os demais nós seguem estáticos", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { activeOverrides: { "x-critic": NEW_BODY } });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("approval")?.status === "waiting", 25);

    const critic = world.taskPromptsByNode["critic"] ?? "";
    expect(critic, "critic nunca rodou").toBeTruthy();
    expect(critic).toContain(NEW_BODY); // o override venceu
    expect(critic).not.toContain("Voce e o critico da esfera X da Ozvor. Abaixo: 2 versoes"); // o estático saiu
    // As garantias que o override não desliga: a régua reapendada + o bloco
    // [__lessons__] (CONTENT_LESSONS) injetado pelo runner por fora.
    expect(critic).toContain("LICOES INSTITUCIONAIS (com VETO)");
    expect(critic).toContain(`[${LESSONS_ARTIFACT}]`);
    expect(critic).toContain("LICOES DA CASA");
    // Nós sem override seguem 100% estáticos.
    expect(world.taskPromptsByNode["signal"]).toContain("agente de sinais da esfera X");
    expect(world.taskPromptsByNode["draft-punchy"]).toContain("Voce e um escritor de X (Twitter)");
  });

  it("porta ausente (worker antigo) e loja vazia (null): células rodam exatamente como antes", async () => {
    const semPorta = makeWorld(SPHERE_X_GRAPH);
    await tickUntil(semPorta, SPHERE_X_GRAPH, () => semPorta.stepByNode("approval")?.status === "waiting", 25);
    expect(semPorta.taskPromptsByNode["critic"]).toContain("Voce e o critico da esfera X da Ozvor");

    const lojaVazia = makeWorld(SPHERE_X_GRAPH, { activeOverrides: null });
    await tickUntil(lojaVazia, SPHERE_X_GRAPH, () => lojaVazia.stepByNode("approval")?.status === "waiting", 25);
    expect(lojaVazia.taskPromptsByNode["critic"]).toContain("Voce e o critico da esfera X da Ozvor");
  });
});

// ---------------------------------------------------------------------------
// A agregação é SQL/código — snapshot source 'tuning' (fake sql por marker).
// ---------------------------------------------------------------------------

interface TuningRows {
  verdicts?: Array<{ graph: string; summary: string; started_at: string }>;
  rejections?: Array<{ graph: string; summary: string; started_at: string }>;
  rejectionCounts?: Array<{ graph: string; n: string }>;
  timeouts?: Array<{ graph: string; n: string }>;
  overrides?: Array<{ prompt_key: string; body_len: string; approved_at: string }>;
  overridesTableMissing?: boolean;
}

function fakeTuningSql(rows: TuningRows): postgres.Sql {
  return (async (strings: TemplateStringsArray) => {
    const text = strings.join("$");
    if (text.includes("snap:tuning-verdicts")) return rows.verdicts ?? [];
    if (text.includes("snap:tuning-rejection-counts")) return rows.rejectionCounts ?? [];
    if (text.includes("snap:tuning-rejections")) return rows.rejections ?? [];
    if (text.includes("snap:tuning-timeouts")) return rows.timeouts ?? [];
    if (text.includes("snap:tuning-overrides")) {
      if (rows.overridesTableMissing) {
        const err = new Error('relation "ops.prompt_override" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      return rows.overrides ?? [];
    }
    throw new Error(`unrouted query in fake tuning sql: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;
}

describe("snapshot source 'tuning' — fatos agregados por código, por graph", () => {
  it("agrega vereditos, rejeições (contagem POR GRAPH + motivo literal), timeouts e overrides ativos", async () => {
    const snap = await buildSnapshot(
      fakeTuningSql({
        verdicts: [{ graph: "sphere-x", summary: "verdict x_impressions: total=0 n=4", started_at: "2026-08-20T08:00:00Z" }],
        rejections: [{ graph: "sphere-linkedin", summary: "rejected: tom vendedor", started_at: "2026-08-12T09:00:00Z" }],
        rejectionCounts: [{ graph: "sphere-linkedin", n: "3" }],
        timeouts: [{ graph: "daily-video", n: "2" }],
        overrides: [{ prompt_key: "x-critic", body_len: "120", approved_at: "2026-08-25T06:30:00Z" }],
      }),
      "tuning",
      21
    );
    expect(snap).toContain("EVIDENCIA PARA TUNING DE PROMPTS");
    expect(snap).toContain("- 2026-08-20 (sphere-x): verdict x_impressions: total=0 n=4");
    expect(snap).toContain("- sphere-linkedin: 3 rejeicao(oes)"); // contagem por SQL, nunca pelo modelo
    expect(snap).toContain("- 2026-08-12 (sphere-linkedin): tom vendedor"); // o motivo literal
    expect(snap).toContain("- daily-video: 2 aprovacao(oes) expiraram sem decisao");
    expect(snap).toContain("- x-critic: desde 2026-08-25 (120 chars)");
  });

  it("tabela de overrides ausente: linha honesta, o resto do snapshot sobrevive", async () => {
    const snap = await buildSnapshot(
      fakeTuningSql({
        verdicts: [{ graph: "sphere-x", summary: "verdict x_impressions: total=0 n=4", started_at: "2026-08-20T08:00:00Z" }],
        overridesTableMissing: true,
      }),
      "tuning",
      21
    );
    expect(snap).toContain("verdict x_impressions");
    expect(snap).toContain("tabela ops.prompt_override indisponivel");
  });

  it("janela sem NADA = string vazia (o runner vira SEM DADOS — honesto, nunca inventado)", async () => {
    expect(await buildSnapshot(fakeTuningSql({}), "tuning", 21)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Round-trip do armazém real (buildPorts) + o cron semanal com fail-soft.
// ---------------------------------------------------------------------------

function fakeStoreSql(world: {
  rows: Array<{ prompt_key: string; body: string; approved_at: string }>;
  tableExists: boolean;
}) {
  let seq = 0;
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("override:table-check")) {
      return [{ t: world.tableExists ? "ops.prompt_override" : null }];
    }
    if (text.includes("override:active-read")) {
      if (!world.tableExists) {
        const err = new Error('relation "ops.prompt_override" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      // DISTINCT ON (prompt_key) ... ORDER BY approved_at DESC — a mais nova por chave.
      const byKey = new Map<string, { prompt_key: string; body: string; approved_at: string }>();
      for (const r of [...world.rows].sort((a, b) => b.approved_at.localeCompare(a.approved_at))) {
        if (!byKey.has(r.prompt_key)) byKey.set(r.prompt_key, r);
      }
      return [...byKey.values()].map((r) => ({ prompt_key: r.prompt_key, body: r.body }));
    }
    if (text.includes("override:store")) {
      if (!world.tableExists) {
        const err = new Error('relation "ops.prompt_override" does not exist') as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      world.rows.push({
        prompt_key: String(values[1]),
        body: String(values[2]),
        approved_at: `2026-09-0${++seq}T00:00:00Z`,
      });
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
  it("round-trip: store grava append-only e a leitura devolve a versão mais NOVA por chave (newest-row-wins)", async () => {
    const world = { rows: [] as Array<{ prompt_key: string; body: string; approved_at: string }>, tableExists: true };
    const ports = buildPorts(fakeStoreSql(world), fakeRedis);

    expect(await ports.substrate.activePromptOverrides!()).toBeNull(); // loja vazia = null, nunca placeholder

    const r1 = await ports.substrate.storePromptOverride!({
      runId: "11111111-1111-1111-1111-111111111111",
      promptKey: "x-critic",
      body: "v1",
    });
    expect(r1.ok).toBe(true);
    const r2 = await ports.substrate.storePromptOverride!({
      runId: "22222222-2222-2222-2222-222222222222",
      promptKey: "x-critic",
      body: NEW_BODY,
    });
    expect(r2.ok).toBe(true);

    // Append-only: as duas linhas existem; a mais nova vence na leitura.
    expect(world.rows).toHaveLength(2);
    expect(await ports.substrate.activePromptOverrides!()).toEqual({ "x-critic": NEW_BODY });

    // Rollback por linha nova com body vazio: a leitura devolve '' e o
    // buildPrompt reverte ao estático.
    const r3 = await ports.substrate.storePromptOverride!({
      runId: "33333333-3333-3333-3333-333333333333",
      promptKey: "x-critic",
      body: "",
    });
    expect(r3.ok).toBe(true);
    const map = await ports.substrate.activePromptOverrides!();
    expect(map).toEqual({ "x-critic": "" });
    const p = buildPrompt("debate", { prompt: "x-critic" }, [], map) ?? "";
    expect(p).toContain("Voce e o critico da esfera X da Ozvor");
  });

  it("migração ausente (42P01): leitura fail-open (null) e store fail-soft com a ação nominal que destrava", async () => {
    const world = { rows: [], tableExists: false };
    const ports = buildPorts(fakeStoreSql(world), fakeRedis);

    expect(await ports.substrate.activePromptOverrides!()).toBeNull();
    const res = await ports.substrate.storePromptOverride!({
      runId: "44444444-4444-4444-4444-444444444444",
      promptKey: "x-critic",
      body: "x",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("ops.prompt_override ausente");
    expect(res.reason).toContain("20260831000001_ops_prompt_override");
  });

  it("cron semanal: sem a tabela a feature se declara DESLIGADA e NÃO inicia run (não queima LLM num run condenado)", async () => {
    const world = { rows: [], tableExists: false };
    const sql = fakeStoreSql(world);
    expect(await promptOverrideStoreReady(sql)).toBe(false);
    const res = await runPromptTunerWeekly(sql);
    expect(res.started).toEqual([]);
    expect(res.skipped).toEqual(["prompt-tuner"]);
  });

  it("cron semanal: com a tabela, inicia UM run com trigger cron:prompt-tuner", async () => {
    const world = { rows: [], tableExists: true };
    const sql = fakeStoreSql(world);
    expect(await promptOverrideStoreReady(sql)).toBe(true);
    const res = await runPromptTunerWeekly(sql, { hermesToken: "t" });
    expect(res.started).toHaveLength(1);
    expect(res.started[0]).toContain("prompt-tuner:");
    expect(res.capped).toEqual([]);
  });
});
