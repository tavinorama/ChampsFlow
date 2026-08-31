/**
 * 5.F.6 — auto-cura ampliada: retry budget por node + circuit breaker por
 * canal Postiz, pregados no harness do runner (fake worlds, portas em memória).
 *
 * O buraco que isto fecha: um node que falhava UMA vez matava o run para
 * sempre (o publish do LinkedIn aprovado de sáb 29/08 morreu num crash do
 * worker — um único retry o teria salvado), e um canal quebrado (ex.: OAuth
 * do LinkedIn no Postiz) queimava todo graph que publica nele, dia após dia.
 *
 * O que está pregado aqui:
 *  - retry salva o run na 2ª tentativa; budget esgotado falha com carimbo
 *    honesto ("retry budget esgotado (N tentativas)"); env 0 desliga;
 *  - approval e store NUNCA são retried (decisão humana não se repete;
 *    store é INSERT append-only, não idempotente);
 *  - guarda de idempotência do publish: falha CONHECIDA (Postiz respondeu
 *    erro) re-dispara sozinha; falha AMBÍGUA (crash pós-aprovação) NUNCA
 *    re-dispara sozinha — parka e pergunta ao founder (um duplicado seria
 *    uma publicação que ninguém aprovou);
 *  - circuito por canal: 3 falhas consecutivas abrem; aberto = publish
 *    aprovado PARKA (nunca descartado) com o porquê no summary; alarme
 *    1x/6h; sucesso fecha e o parked libera sozinho.
 */

import { describe, it, expect, afterEach } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import {
  advanceRun,
  nodeRetryBudget,
  DEFAULT_NODE_RETRY_BUDGET,
  RETRY_GATE_SUMMARY,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_PARK_SUMMARY_PREFIX,
  DEFAULT_APPROVAL_TIMEOUT_HOURS,
  type CircuitPort,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  SPHERE_LINKEDIN_GRAPH,
  MEMORY_CONSOLIDATION_GRAPH,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import { buildPorts } from "../../apps/worker/src/jobs/graph-tick";

// ---------------------------------------------------------------------------
// Fake world — o padrão de graph-runner.test.ts, com controles de falha.
// ---------------------------------------------------------------------------

interface World {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  telegramButtons: string[][];
  published: Array<{ channel: string; post: string }>;
  publishCalls: number;
  clock: { now: Date };
  /** Quantas chamadas de hermes.task ainda devem FALHAR (ordem de chegada). */
  failFirstTasks: number;
  /** Comportamento por chamada de hermes.publish; esgotado → "ok". */
  publishPlan: Array<"ok" | "fail" | "throw">;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
  stepsOf(node: string): Array<StepRow & { summary?: string | null }>;
}

function makeWorld(def: GraphDefinition, circuit?: CircuitPort): World {
  const clock = { now: new Date("2026-08-30T10:00:00Z") };
  const run: RunRow = { id: "run-1", graph: def.slug, status: "running", started_at: clock.now.toISOString() };
  const steps: World["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;

  const world: World = {
    run,
    steps,
    telegrams: [],
    telegramButtons: [],
    published: [],
    publishCalls: 0,
    clock,
    failFirstTasks: 0,
    publishPlan: [],
    stepByNode: (node) => [...steps].reverse().find((s) => s.node === node),
    stepsOf: (node) => steps.filter((s) => s.node === node),
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
          return "RESULTADOS REAIS (ops.agent_outcome, 30d)";
        },
        async startRun() {
          return "child-1";
        },
      },
      hermes: {
        async task(prompt) {
          if (world.failFirstTasks > 0) {
            world.failFirstTasks -= 1;
            return { ok: false, output: "engine exploded (transient)", engineUsed: "claude", ms: 10 };
          }
          return { ok: true, output: `OUT[${prompt.slice(0, 40)}]`, engineUsed: "claude", ms: 100 };
        },
        async publish(payload) {
          world.publishCalls += 1;
          const behavior = world.publishPlan.shift() ?? "ok";
          if (behavior === "throw") throw new Error("worker crashed mid-publish");
          if (behavior === "fail") return { ok: false, detail: "postiz 502: channel oauth broken" };
          world.published.push(payload);
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
        world.telegrams.push(text);
        if (buttons) world.telegramButtons.push(buttons.map((b) => b.data));
      },
      now: () => clock.now,
      ...(circuit ? { circuit } : {}),
    },
  };
  return world;
}

async function tick(world: World, def: GraphDefinition): Promise<void> {
  await advanceRun(def, world.run.id, world.ports);
}

async function tickUntil(world: World, def: GraphDefinition, done: () => boolean, max = 25): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await tick(world, def);
}

async function approve(world: World, node = "approval"): Promise<void> {
  await world.ports.substrate.finishStep(world.stepByNode(node)!.id, {
    status: "succeeded",
    summary: "founder approved via Telegram button",
  });
}

/** Circuito fake em memória — mesma semântica do wiring Redis do worker. */
function makeFakeCircuit() {
  const fails = new Map<string, number>();
  let alarmArmed = true;
  const port: CircuitPort = {
    async status(channel) {
      const failures = fails.get(channel) ?? 0;
      return { open: failures >= CIRCUIT_BREAKER_THRESHOLD, failures };
    },
    async record(channel, ok) {
      if (ok) {
        fails.set(channel, 0);
        return { open: false, failures: 0 };
      }
      const failures = (fails.get(channel) ?? 0) + 1;
      fails.set(channel, failures);
      return { open: failures >= CIRCUIT_BREAKER_THRESHOLD, failures };
    },
    async alarmOnce() {
      const first = alarmArmed;
      alarmArmed = false;
      return first;
    },
  };
  return {
    port,
    fails,
    close(channel: string) {
      fails.set(channel, 0);
    },
    rearmAlarm() {
      alarmArmed = true;
    },
  };
}

afterEach(() => {
  delete process.env["NODE_RETRY_BUDGET"];
});

// ---------------------------------------------------------------------------
// Env knob.
// ---------------------------------------------------------------------------

describe("nodeRetryBudget — o botão de env", () => {
  it("default 2, NODE_RETRY_BUDGET vence, 0 desliga, lixo cai no default", () => {
    expect(nodeRetryBudget({})).toBe(DEFAULT_NODE_RETRY_BUDGET);
    expect(nodeRetryBudget({ NODE_RETRY_BUDGET: "5" })).toBe(5);
    expect(nodeRetryBudget({ NODE_RETRY_BUDGET: "0" })).toBe(0);
    expect(nodeRetryBudget({ NODE_RETRY_BUDGET: "banana" })).toBe(DEFAULT_NODE_RETRY_BUDGET);
    expect(nodeRetryBudget({ NODE_RETRY_BUDGET: "-3" })).toBe(DEFAULT_NODE_RETRY_BUDGET);
  });
});

// ---------------------------------------------------------------------------
// Retry budget por node.
// ---------------------------------------------------------------------------

describe("retry budget — um node que falha ganha novas tentativas", () => {
  it("falha transitória de LLM não mata o run: a 2ª tentativa salva (o caso que faltou sáb 29/08)", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.failFirstTasks = 1; // a 1ª chamada (node 'signal') explode; o resto passa
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");

    // O node falhado ganhou um step NOVO (o record guarda as duas tentativas)…
    const signalSteps = world.stepsOf("signal");
    expect(signalSteps).toHaveLength(2);
    expect(signalSteps[0]!.status).toBe("failed");
    expect(signalSteps[1]!.status).toBe("succeeded");
    // …e o run seguiu vivo até o gate humano, sem grito de morte.
    expect(world.run.status).toBe("running");
    expect(world.telegrams.some((t) => t.includes("FALHOU"))).toBe(false);
  });

  it("budget esgotado → run falha como antes, com o carimbo 'retry budget esgotado (N tentativas)'", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.failFirstTasks = 999; // falha permanente
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    // 1 tentativa original + 2 retries (default) = 3 steps falhados do node.
    expect(world.stepsOf("signal")).toHaveLength(1 + DEFAULT_NODE_RETRY_BUDGET);
    const obituary = world.telegrams.find((t) => t.includes("FALHOU"));
    expect(obituary).toContain("retry budget esgotado (3 tentativas)");
  });

  it("NODE_RETRY_BUDGET=0 desliga a feature: fail-fast de sempre, uma tentativa só", async () => {
    process.env["NODE_RETRY_BUDGET"] = "0";
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.failFirstTasks = 999;
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepsOf("signal")).toHaveLength(1);
    expect(world.telegrams.find((t) => t.includes("FALHOU"))).not.toContain("retry budget");
  });

  it("approval rejeitado NUNCA é retried — decisão humana não se repete", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await world.ports.substrate.finishStep(world.stepByNode("approval")!.id, {
      status: "failed",
      summary: "rejected: tom vendedor",
    });
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepsOf("approval")).toHaveLength(1); // nenhuma segunda pergunta
    expect(world.published).toEqual([]);
  });

  it("store falhado NUNCA é retried — INSERT append-only não é idempotente (checado 31/08)", async () => {
    // ops.memory_lesson/ops.prompt_override são INSERTs puros: um crash entre
    // o INSERT commitar e o finishStep gravaria o lote DUAS vezes num retry.
    // Sem porta de store o step falha ("feature desligada") — e fica falhado.
    const world = makeWorld(MEMORY_CONSOLIDATION_GRAPH);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, MEMORY_CONSOLIDATION_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepsOf("store")).toHaveLength(1);
    expect(world.stepByNode("store")?.summary).toContain("store port ausente");
  });
});

// ---------------------------------------------------------------------------
// Guarda de idempotência do publish — a ambiguidade de sáb 29/08.
// ---------------------------------------------------------------------------

describe("publish retry — a guarda de idempotência", () => {
  it("falha CONHECIDA (Postiz respondeu erro) re-dispara sozinha: nada saiu, retry é seguro", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.publishPlan = ["fail"]; // 1ª tentativa: Postiz 502; 2ª: ok
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("publish")?.status === "succeeded");

    expect(world.published).toHaveLength(1);
    expect(world.stepsOf("publish")).toHaveLength(2); // falha + retry ok
    // Sem pergunta ao founder: a falha provou que nada foi enviado.
    expect(world.telegrams.some((t) => t.includes("retry automatico seguro"))).toBe(false);
  });

  it("falha AMBÍGUA (crash pós-aprovação) NUNCA re-dispara sozinha: parka e PERGUNTA ao founder", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.publishPlan = ["throw"]; // o worker morre no meio do publish
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    // O crash: advanceRun explode com o step de publish preso em 'running'.
    await expect(tick(world, SPHERE_LINKEDIN_GRAPH)).rejects.toThrow("worker crashed mid-publish");
    expect(world.stepByNode("publish")?.status).toBe("running");

    // 3h depois, o crash-recovery marca o step como stale…
    world.clock.now = new Date(world.clock.now.getTime() + 3 * 3_600_000);
    await tick(world, SPHERE_LINKEDIN_GRAPH);

    // …e em vez de re-disparar às cegas, o runner parka um GATE e pergunta.
    const pubSteps = world.stepsOf("publish");
    expect(pubSteps).toHaveLength(2);
    expect(pubSteps[0]!.status).toBe("failed"); // o stale
    expect(pubSteps[0]!.summary).toContain("worker crash presumed");
    expect(pubSteps[1]!.status).toBe("waiting"); // o gate
    expect(pubSteps[1]!.summary).toBe(RETRY_GATE_SUMMARY);
    // NADA foi reenviado ao Postiz por conta própria.
    expect(world.published).toEqual([]);
    const ask = world.telegrams.find((t) => t.includes("retry automatico seguro"));
    expect(ask, "a pergunta de retry não chegou ao founder").toBeTruthy();
    expect(ask).toContain("duplicaria uma publicação que ninguém aprovou");
    // Botões do #445: ap:/rj: com o id do gate.
    expect(world.telegramButtons.at(-1)).toEqual([`ap:${pubSteps[1]!.id}`, `rj:${pubSteps[1]!.id}`]);
    expect(world.run.status).toBe("running"); // parkado, não morto
  });

  it("founder responde SIM → reposta exatamente UMA vez e o run segue", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.publishPlan = ["throw"];
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await expect(tick(world, SPHERE_LINKEDIN_GRAPH)).rejects.toThrow();
    world.clock.now = new Date(world.clock.now.getTime() + 3 * 3_600_000);
    await tick(world, SPHERE_LINKEDIN_GRAPH); // gate parkado

    // O founder toca ✅ — o webhook #445 finaliza o gate como succeeded.
    const gate = world.stepByNode("publish")!;
    await world.ports.substrate.finishStep(gate.id, {
      status: "succeeded",
      summary: "founder approved via Telegram button",
    });
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("wait-72h")?.status === "waiting");

    expect(world.published).toHaveLength(1); // uma vez — nunca duplicado
    expect(world.stepByNode("publish")?.status).toBe("succeeded");
    expect(world.stepByNode("publish")?.summary).toContain("published via");
    expect(world.run.status).toBe("running"); // seguiu para o wait/harvest
  });

  it("founder responde NÃO → nada reposta, o run falha honesto e nenhum novo gate nasce", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.publishPlan = ["throw"];
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await expect(tick(world, SPHERE_LINKEDIN_GRAPH)).rejects.toThrow();
    world.clock.now = new Date(world.clock.now.getTime() + 3 * 3_600_000);
    await tick(world, SPHERE_LINKEDIN_GRAPH); // gate parkado

    const gate = world.stepByNode("publish")!;
    await world.ports.substrate.finishStep(gate.id, {
      status: "failed",
      summary: "founder rejected via Telegram button (no reason captured)",
    });
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.published).toEqual([]);
    expect(world.stepsOf("publish")).toHaveLength(2); // stale + gate; nunca um 3º
  });

  it("silêncio de 96h no gate = rejeição por silêncio: nada reposta, run falha", async () => {
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH);
    world.publishPlan = ["throw"];
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await expect(tick(world, SPHERE_LINKEDIN_GRAPH)).rejects.toThrow();
    world.clock.now = new Date(world.clock.now.getTime() + 3 * 3_600_000);
    await tick(world, SPHERE_LINKEDIN_GRAPH); // gate parkado

    world.clock.now = new Date(world.clock.now.getTime() + (DEFAULT_APPROVAL_TIMEOUT_HOURS + 1) * 3_600_000);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.published).toEqual([]);
    expect(world.stepByNode("publish")?.summary).toContain("rejeicao por silencio");
    expect(world.telegrams.some((t) => t.includes("RETRY DE PUBLISH EXPIROU"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker por canal Postiz.
// ---------------------------------------------------------------------------

describe("circuit breaker — um canal quebrado não queima a empresa", () => {
  it("3 falhas consecutivas abrem o circuito, com UM alarme (não três)", async () => {
    const circuit = makeFakeCircuit();
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH, circuit.port);
    world.publishPlan = ["fail", "fail", "fail"]; // canal morto
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.run.status !== "running");

    // O run que ABRIU o circuito queimou o próprio budget honestamente…
    expect(world.run.status).toBe("failed");
    expect(circuit.fails.get("linkedin")).toBe(CIRCUIT_BREAKER_THRESHOLD);
    // …e o alarme de circuito saiu exatamente uma vez (NX de 6h).
    expect(world.telegrams.filter((t) => t.includes("CIRCUITO ABERTO"))).toHaveLength(1);
    expect(world.telegrams.find((t) => t.includes("CIRCUITO ABERTO"))).toContain("reconectar/reautorizar o canal no Postiz");
  });

  it("circuito aberto → o próximo publish aprovado PARKA dizendo por quê, sem queimar tentativa", async () => {
    const circuit = makeFakeCircuit();
    circuit.fails.set("linkedin", CIRCUIT_BREAKER_THRESHOLD); // aberto por outro run
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH, circuit.port);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("publish") != null);

    const pub = world.stepByNode("publish")!;
    expect(pub.status).toBe("waiting");
    expect(pub.summary).toContain(CIRCUIT_PARK_SUMMARY_PREFIX);
    expect(pub.summary).toContain("linkedin");
    // NENHUMA chamada ao Postiz foi queimada.
    expect(world.publishCalls).toBe(0);
    expect(world.run.status).toBe("running"); // parkado, nunca descartado
    expect(world.telegrams.filter((t) => t.includes("CIRCUITO ABERTO"))).toHaveLength(1);

    // Ticks seguintes com o circuito ainda aberto: segue parkado, alarme NÃO repete na janela.
    await tick(world, SPHERE_LINKEDIN_GRAPH);
    await tick(world, SPHERE_LINKEDIN_GRAPH);
    expect(world.publishCalls).toBe(0);
    expect(world.telegrams.filter((t) => t.includes("CIRCUITO ABERTO"))).toHaveLength(1);
  });

  it("circuito fecha (canal curado) → o parked libera sozinho e publica, com nota honesta", async () => {
    const circuit = makeFakeCircuit();
    circuit.fails.set("linkedin", CIRCUIT_BREAKER_THRESHOLD);
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH, circuit.port);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("publish")?.status === "waiting");

    circuit.close("linkedin"); // founder reconectou o canal / janela de re-teste
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("publish")?.status === "succeeded");

    expect(world.published).toHaveLength(1);
    expect(world.published[0]!.channel).toBe("linkedin");
    expect(world.stepByNode("publish")?.summary).toContain("apos circuito fechado");
  });

  it("sucesso RESETA o contador — consecutivas, não cumulativas", async () => {
    const circuit = makeFakeCircuit();
    const world = makeWorld(SPHERE_LINKEDIN_GRAPH, circuit.port);
    world.publishPlan = ["fail"]; // 1 falha, depois ok (o retry salva)
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, SPHERE_LINKEDIN_GRAPH, () => world.stepByNode("publish")?.status === "succeeded");

    expect(world.published).toHaveLength(1);
    expect(circuit.fails.get("linkedin")).toBe(0); // o sucesso fechou a conta
  });
});

// ---------------------------------------------------------------------------
// O wiring Redis real do worker (buildPorts) — chaves, threshold, NX.
// ---------------------------------------------------------------------------

describe("buildPorts.circuit — o padrão Redis (chave circuit:<canal>, NX de alarme)", () => {
  function makeFakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      redis: {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: string, ...args: unknown[]) => {
          if (args.includes("NX") && store.has(k)) return null;
          store.set(k, String(v));
          return "OK";
        },
        del: async (k: string) => (store.delete(k) ? 1 : 0),
        incr: async (k: string) => {
          const n = Number(store.get(k) ?? 0) + 1;
          store.set(k, String(n));
          return n;
        },
        expire: async () => 1,
      } as unknown as Redis,
    };
  }

  it("conta consecutivas em circuit:<canal>, abre em 3, fecha (DEL) no sucesso; canal é case-insensitive", async () => {
    const { store, redis } = makeFakeRedis();
    const circuit = buildPorts({} as unknown as postgres.Sql, redis).circuit!;

    expect(await circuit.status("LinkedIn")).toEqual({ open: false, failures: 0 });
    expect(await circuit.record("LinkedIn", false)).toEqual({ open: false, failures: 1 });
    expect(await circuit.record("linkedin", false)).toEqual({ open: false, failures: 2 });
    expect(await circuit.record("linkedin", false)).toEqual({ open: true, failures: 3 });
    expect(store.get("circuit:linkedin")).toBe("3");
    expect((await circuit.status("linkedin")).open).toBe(true);
    // Outro canal não é afetado — o circuito é POR canal.
    expect((await circuit.status("x")).open).toBe(false);
    // Um sucesso fecha: a chave morre, consecutivas voltam a zero.
    expect(await circuit.record("linkedin", true)).toEqual({ open: false, failures: 0 });
    expect(store.has("circuit:linkedin")).toBe(false);
  });

  it("alarmOnce é NX: verdadeiro uma vez por janela por canal", async () => {
    const { redis } = makeFakeRedis();
    const circuit = buildPorts({} as unknown as postgres.Sql, redis).circuit!;
    expect(await circuit.alarmOnce("linkedin")).toBe(true);
    expect(await circuit.alarmOnce("linkedin")).toBe(false);
    expect(await circuit.alarmOnce("x")).toBe(true); // janela por canal
  });
});
