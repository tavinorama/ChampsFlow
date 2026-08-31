/**
 * 5.F.4 — experimentos contínuos: o A/B semanal (ab-experiment).
 *
 * O aprendizado por tentativa era pontual (content-experiment = um tiro, uma
 * variante, quando o founder aprovava a aposta). O ab-experiment roda toda
 * sexta um A/B DE VERDADE: duas variantes da MESMA ideia, UM eixo declarado
 * (angle|hook|format), MESMO canal, UMA aprovação combinada, veredito por
 * CÓDIGO com a linha-contrato `ab-winner: axis=... variant=... lift=...`.
 *
 * O que está pregado aqui:
 *  - o desenho: registry, validação, marketing+gated (conta na válvula),
 *    par de variantes no MESMO canal, contentNode por publish, harvest com
 *    janela por variante (sinceNode), veredito compare:'ab';
 *  - caminho feliz: a caixa de aprovação mostra eixo + AS DUAS variantes na
 *    íntegra; aprovar publica os DOIS drafts EXATOS; o veredito compara por
 *    código e grava vencedor+lift em ops.agent_outcome com a linha pinada;
 *  - válvula respeitada: cap cheio → a 2ª variante ESTACIONA (nunca fura,
 *    nunca descarta), sai no dia seguinte, e o veredito registra a janela
 *    deslocada;
 *  - rejeição degrada honestamente: cancelNote no Telegram ("experimento
 *    cancelado"), NENHUMA variante publicada — variante solitária nunca sai;
 *  - silêncio de 96h = mesmo cancelamento honesto;
 *  - SEM DADO e empate: sem vencedor, sem linha em ops.agent_outcome, dito
 *    em voz alta — o modelo nunca participa da matemática.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { AB_EXPERIMENT_GRAPH, validateGraph } from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, PROMPT_SLUGS, TUNABLE_PROMPT_KEYS } from "../../apps/api/src/lib/graph-prompts";
import { isGatedMarketingGraph } from "../../apps/worker/src/jobs/graph-tick";

const BRIEF_TEXT = [
  "EIXO: hook",
  "IDEIA: brands are vanishing from AI answers",
  "VARIANTE A: hook as a question",
  "VARIANTE B: hook as a hard number",
  "CONSTANTES: same CTA, same length, same channel",
  "METRICA: linkedinpage_impressions (janela de 48h por variante)",
].join("\n");
const POST_A = "Is your brand invisible to ChatGPT? Most are. I check mine weekly. I can show you how.";
const POST_B = "73% of buyers now ask AI first. Your brand is not in the answer. I can show you how to fix it.";

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  published: Array<{ channel: string; post: string }>;
  outcomes: Array<{ metric: string; valueBefore: number | null; valueAfter: number | null }>;
  taskPromptsByNode: Record<string, string>;
  clock: { now: Date };
  /** Mutável no teste: publicações de hoje no canal (a válvula lê daqui). */
  valve: { publishedToday: number };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  opts: {
    /** total colhido por variante (roteado pelo started_at do publish da variante). */
    harvest?: { a: { n: number; total: number }; b: { n: number; total: number } };
    briefOutput?: string;
  } = {}
): FakeWorld {
  const clock = { now: new Date("2026-09-04T06:30:00Z") }; // uma sexta-feira
  const run: RunRow = {
    id: "run-ab",
    graph: AB_EXPERIMENT_GRAPH.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;
  const harvest = opts.harvest ?? { a: { n: 2, total: 134 }, b: { n: 2, total: 100 } };

  const world: FakeWorld = {
    run,
    steps,
    telegrams: [],
    published: [],
    outcomes: [],
    taskPromptsByNode: {},
    clock,
    valve: { publishedToday: 0 },
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
          // Cada step nasce 1 min depois do anterior — timestamps únicos, o
          // que deixa o sinceNode dos harvests distinguível por variante.
          clock.now = new Date(clock.now.getTime() + 60_000);
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
          world.outcomes.push({ metric: input.metric, valueBefore: input.valueBefore, valueAfter: input.valueAfter });
          return `outcome-${world.outcomes.length}`;
        },
        publishedToday: async () => world.valve.publishedToday,
        async readHarvest(_metric, sinceIso) {
          // Janela POR VARIANTE: o runner passa o started_at do publish da
          // própria variante (config.sinceNode) — roteamos por ele.
          const pa = world.stepByNode("publish-a")?.started_at;
          return sinceIso === pa ? harvest.a : harvest.b;
        },
        async snapshot(input) {
          return `RESULTADOS REAIS (ops.agent_outcome, ${input.days}d · esfera ${input.metricPrefix ?? ""}*):\n- linkedinpage_impressions_7d (sphere-linkedin): 340`;
        },
        async startRun() {
          throw new Error("ab-experiment must never spawn");
        },
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          world.taskPromptsByNode[node] = prompt;
          const out =
            node === "brief"
              ? (opts.briefOutput ?? BRIEF_TEXT)
              : node === "draft-a"
                ? POST_A
                : node === "draft-b"
                  ? POST_B
                  : node === "critic"
                    ? "A: clean. B: clean.\nEXPERIMENTO: limpo"
                    : `OUT[${node}]`;
          return { ok: true, output: out, engineUsed: "claude", ms: 10 };
        },
        async publish(payload) {
          world.published.push(payload);
          world.valve.publishedToday += 1;
          return { ok: true, detail: `postiz:ok:${world.published.length}` };
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

async function tickUntil(world: FakeWorld, done: () => boolean, max = 30): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(AB_EXPERIMENT_GRAPH, world.run.id, world.ports);
}

/** Um tick avulso — usado para os waits NASCEREM antes de avançar o relógio. */
async function tick(world: FakeWorld): Promise<void> {
  await advanceRun(AB_EXPERIMENT_GRAPH, world.run.id, world.ports);
}

function hoursPass(world: FakeWorld, h: number): void {
  world.clock.now = new Date(world.clock.now.getTime() + h * 3600 * 1000);
}

// ---------------------------------------------------------------------------
// O desenho: par de variantes válido — um eixo, mesmo canal, um gate, código.
// ---------------------------------------------------------------------------

describe("ab-experiment (5.F.4) — o desenho", () => {
  it("está no registry, valida, é marketing e CONTA na válvula de aprovações", () => {
    const def = GRAPH_REGISTRY["ab-experiment"];
    expect(def, "ab-experiment fora do registry — o cron de sexta não iniciaria nada").toBeTruthy();
    expect(def).toBe(AB_EXPERIMENT_GRAPH);
    expect(def!.vpOwner).toBe("marketing");
    expect(validateGraph(def!).errors).toEqual([]);
    expect(isGatedMarketingGraph("ab-experiment")).toBe(true);
  });

  it("par válido: DOIS publishes no MESMO canal, cada um nomeando o SEU draft (contentNode)", () => {
    const pa = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "publish-a")!;
    const pb = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "publish-b")!;
    expect(pa.config).toMatchObject({ channel: "linkedin", contentNode: "draft-a" });
    expect(pb.config).toMatchObject({ channel: "linkedin", contentNode: "draft-b" });
    // Os dois atrás do MESMO gate humano — rejeitar um é rejeitar o par.
    expect(pa.dependsOn).toEqual(["approval"]);
    expect(pb.dependsOn).toEqual(["approval"]);
  });

  it("harvests: MESMA métrica nas duas variantes, janela ancorada no publish de cada uma (sinceNode)", () => {
    const ha = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "harvest-a")!;
    const hb = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "harvest-b")!;
    expect(ha.config?.["metric"]).toBe(hb.config?.["metric"]);
    expect(ha.config).toMatchObject({ sinceNode: "publish-a" });
    expect(hb.config).toMatchObject({ sinceNode: "publish-b" });
  });

  it("aprovação: UMA, combinada (vê brief + as duas variantes + crítico), optional com cancelNote e 96h", () => {
    const ap = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "approval")!;
    expect(ap.dependsOn).toEqual(["brief", "draft-a", "draft-b", "critic"]);
    expect(ap.config).toMatchObject({ channel: "telegram", optional: true, timeoutHours: 96 });
    expect(String(ap.config?.["cancelNote"])).toContain("EXPERIMENTO CANCELADO");
    expect(String(ap.config?.["cancelNote"])).toContain("variante rejeitada");
  });

  it("veredito é CÓDIGO: compare:'ab' sobre os dois harvests, eixo lido do brief", () => {
    const v = AB_EXPERIMENT_GRAPH.nodes.find((n) => n.id === "verdict")!;
    expect(v.kind).toBe("verdict");
    expect(v.dependsOn).toEqual(["harvest-a", "harvest-b"]);
    expect(v.config).toMatchObject({ compare: "ab", axisFrom: "brief" });
  });

  it("prompts: brief exige UM eixo declarado (linha EIXO:), critic tem veto de experimento sujo e NÃO declara vencedor", () => {
    for (const slug of ["ab-brief", "ab-draft", "ab-critic"]) expect(PROMPT_SLUGS).toContain(slug);
    const brief = buildPrompt("task", { prompt: "ab-brief" }, []) ?? "";
    expect(brief).toContain("EXATAMENTE UM eixo");
    expect(brief).toContain("EIXO: <angle|hook|format>");
    const critic = buildPrompt("debate", { prompt: "ab-critic" }, []) ?? "";
    expect(critic).toContain("VETO: experimento sujo");
    expect(critic).toContain("NAO declare vencedor");
    // 5.F.2: criação e crítica do A/B são tunáveis como as das outras células.
    expect(TUNABLE_PROMPT_KEYS).toContain("ab-draft");
    expect(TUNABLE_PROMPT_KEYS).toContain("ab-critic");
  });
});

// ---------------------------------------------------------------------------
// Caminho feliz: aprovação combinada → dois publishes → veredito por código.
// ---------------------------------------------------------------------------

describe("ab-experiment — caminho feliz", () => {
  it("a caixa de aprovação mostra o eixo e AS DUAS variantes na íntegra; aprovar publica os DOIS drafts exatos", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask, "a aprovação combinada não chegou ao Telegram").toBeTruthy();
    // O founder vê o desenho do experimento e as duas variantes VERBATIM.
    expect(ask).toContain("EIXO: hook");
    expect(ask).toContain(POST_A);
    expect(ask).toContain(POST_B);
    expect(ask).toContain("variante solitária");

    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.published.length === 2);

    // O que publica é EXATAMENTE o draft que o founder viu — mesmo canal.
    expect(world.published).toEqual([
      { channel: "linkedin", post: POST_A },
      { channel: "linkedin", post: POST_B },
    ]);
  });

  it("veredito por CÓDIGO: linha-contrato pinada + vencedor/lift em ops.agent_outcome; o LLM nunca roda no verdict", async () => {
    const world = makeWorld({ harvest: { a: { n: 2, total: 100 }, b: { n: 2, total: 134 } } });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.published.length === 2);
    await tick(world); // os waits de 48h nascem
    hoursPass(world, 49); // ... e vencem
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    // O CONTRATO machine-findable (5.F.1/5.F.2 leem summaries de node='verdict'):
    const verdictSummary = world.stepByNode("verdict")?.summary ?? "";
    expect(verdictSummary).toMatch(/^ab-winner: axis=hook variant=B lift=\+34%/);
    // A matemática em código: before=perdedor, after=vencedor, métrica ab_<eixo>.
    expect(world.outcomes).toEqual([{ metric: "ab_hook", valueBefore: 100, valueAfter: 134 }]);
    // O modelo nunca participou do veredito.
    expect(world.taskPromptsByNode["verdict"]).toBeUndefined();
    expect(world.telegrams.join("\n")).toContain("VEREDITO A/B");
  });
});

// ---------------------------------------------------------------------------
// A válvula manda: a 2ª variante estaciona e a janela deslocada é registrada.
// ---------------------------------------------------------------------------

describe("ab-experiment — válvula de cadência", () => {
  it("cap cheio: variante B ESTACIONA (nunca fura o cap), sai no dia seguinte e o veredito registra a janela deslocada", async () => {
    const world = makeWorld({ harvest: { a: { n: 2, total: 134 }, b: { n: 2, total: 100 } } });
    world.valve.publishedToday = 1; // 1 slot livre no linkedin (cap estático = 2)
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.published.length === 1, 3);

    // A publica; B estaciona como waiting — adiada, nunca descartada.
    expect(world.published).toEqual([{ channel: "linkedin", post: POST_A }]);
    const parked = world.stepByNode("publish-b")!;
    expect(parked.status).toBe("waiting");
    expect(parked.summary).toContain("channel cadence");
    expect(world.telegrams.join("\n")).toContain("CADÊNCIA LINKEDIN");

    // 00:00 UTC vira: o contador zera e a B sai sozinha, com a nota honesta.
    hoursPass(world, 24);
    world.valve.publishedToday = 0;
    await tickUntil(world, () => world.published.length === 2, 3);
    expect(world.published[1]).toEqual({ channel: "linkedin", post: POST_B });
    expect(world.stepByNode("publish-b")?.summary).toContain("apos adiamento de cadencia");

    // Janelas vencem; o veredito diz que a comparação se deslocou.
    await tick(world); // wait-b nasce
    hoursPass(world, 49);
    await tickUntil(world, () => world.run.status !== "running");
    const verdictSummary = world.stepByNode("verdict")?.summary ?? "";
    expect(verdictSummary).toMatch(/^ab-winner: axis=hook variant=A lift=\+34%/);
    expect(verdictSummary).toContain("janela de comparacao deslocada pela valvula (publish-b)");
  });
});

// ---------------------------------------------------------------------------
// Degradação honesta: rejeição/silêncio cancelam o PAR — nunca variante só.
// ---------------------------------------------------------------------------

describe("ab-experiment — degradação honesta", () => {
  it("founder rejeita: cancelNote no Telegram, NENHUMA variante publicada, run fecha sem fingir A/B", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    // Webhook #445: rejeição vira step failed com o motivo.
    const ap = world.stepByNode("approval")!;
    ap.status = "failed";
    ap.summary = "rejected: variante B fraca";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.published).toEqual([]); // variante solitária NUNCA sai
    expect(world.outcomes).toEqual([]);
    expect(world.telegrams.join("\n")).toContain("EXPERIMENTO CANCELADO");
    expect(world.telegrams.join("\n")).toContain("variante rejeitada");
    expect(world.stepByNode("publish-a"), "publish não pode nem ter começado").toBeUndefined();
    expect(world.stepByNode("publish-b")).toBeUndefined();
  });

  it("96h de silêncio = o mesmo cancelamento honesto — silêncio nunca vira publicação", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    hoursPass(world, 97);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.published).toEqual([]);
    expect(world.telegrams.join("\n")).toContain("EXPERIMENTO CANCELADO");
    expect(world.telegrams.join("\n")).toContain("sem decisão");
  });
});

// ---------------------------------------------------------------------------
// Sem estatística inventada: SEM DADO e empate não geram vencedor.
// ---------------------------------------------------------------------------

describe("ab-experiment — veredito honesto sem dado / empate", () => {
  it("fonte muda numa variante (n=0): SEM vencedor, NADA em ops.agent_outcome, gritado no Telegram", async () => {
    const world = makeWorld({ harvest: { a: { n: 2, total: 134 }, b: { n: 0, total: 0 } } });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.published.length === 2);
    await tick(world); // waits nascem
    hoursPass(world, 49);
    await tickUntil(world, () => world.stepByNode("harvest-b")?.status === "waiting", 5);
    // O harvest-b com n=0 espera a graça de 48h antes de fechar SEM DADO.
    hoursPass(world, 49);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.outcomes).toEqual([]);
    const verdictSummary = world.stepByNode("verdict")?.summary ?? "";
    expect(verdictSummary).toContain("SEM DADO");
    expect(verdictSummary).not.toContain("ab-winner:");
    expect(world.telegrams.join("\n")).toContain("A/B SEM VEREDITO");
  });

  it("empate numérico: indistinguível — sem vencedor gravado (empate não vira estatística)", async () => {
    const world = makeWorld({ harvest: { a: { n: 2, total: 100 }, b: { n: 2, total: 100 } } });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.published.length === 2);
    await tick(world); // waits nascem
    hoursPass(world, 49);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.outcomes).toEqual([]);
    const verdictSummary = world.stepByNode("verdict")?.summary ?? "";
    expect(verdictSummary).toContain("empate");
    expect(verdictSummary).not.toContain("ab-winner:");
    expect(world.telegrams.join("\n")).toContain("A/B EMPATE");
  });
});
