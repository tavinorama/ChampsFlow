/**
 * 0.8 (founder 01/09) — loop anti-genérico permanente: VERIFICAR na criação.
 *
 * "As publicações têm sido muito genéricas e com um padrão repetido demais."
 * A metade de AUDITORIA já existia (harvest/veredito/memória/tuner); o que
 * faltava era a metade de VERIFICAÇÃO na hora de CRIAR. Agora:
 *
 *  - o runner injeta [__recent__] (as últimas publicações REAIS, lidas do
 *    registro durável ops.agent_step) nos nós de criação e crítica dos grafos
 *    de marketing — a superfície é a MESMA allowlist do tuner (drafts +
 *    críticos), reusada para nunca divergir;
 *  - o texto de cada peça é recuperado do artefato Redis do nó de conteúdo
 *    (TTL 7d); expirado, a entrada diz isso com honestidade — data/canal/graph
 *    vêm do registro durável de qualquer jeito;
 *  - a régua ANTI_GENERIC_RULE viaja com [__lessons__] nos críticos (veto:
 *    repetição nomeando a culpada, abertura genérica, nada concreto, peça
 *    não-nativa da plataforma);
 *  - todo draft de marketing carrega a linha de diferenciação deliberada
 *    (ANGULO-NOVO) — exceto o ab-draft, que publica direto e não pode ter
 *    linha interna;
 *  - nada disso toca grafos não-marketing (vendas/brains) nem quebra quando o
 *    port não existe (fail-open).
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  RECENT_ARTIFACT,
  LESSONS_ARTIFACT,
  RECENT_PUBLISHES_LIMIT,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  SPHERE_X_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  PROSPECT_BATCH_GRAPH,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import {
  buildPrompt,
  ANTI_GENERIC_RULE,
  TUNABLE_PROMPT_KEYS,
} from "../../apps/api/src/lib/graph-prompts";

/** O bloco injetado abre com este marcador — distingue a INJEÇÃO da mera menção "[__recent__]" nos prompts. */
const RECENT_MARK = `[${RECENT_ARTIFACT}]\nULTIMAS PUBLICACOES REAIS`;

type RecentRow = {
  runId: string;
  node: string;
  graph: string;
  channel: string;
  publishedAt: string;
  summary: string;
};

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  taskPromptsByNode: Record<string, string>;
  recentCalls: Array<{ channel: string | null; limit: number }>;
  artifactsMap: Map<string, string>;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  def: GraphDefinition,
  opts: { recentRows?: RecentRow[] | null; withRecentPort?: boolean } = {}
): FakeWorld {
  const clock = { now: new Date("2026-09-01T10:00:00Z") };
  const run: RunRow = {
    id: `run-${def.slug}`,
    graph: def.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const artifactsMap = new Map<string, string>();
  let stepSeq = 0;
  const withRecentPort = opts.withRecentPort ?? true;

  const world: FakeWorld = {
    run,
    steps,
    taskPromptsByNode: {},
    recentCalls: [],
    artifactsMap,
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
          return input.source === "prospects" ? "SEM PROSPECTS VERIFICADOS NESTA RODADA — teste" : "RESULTADOS: x_impressions 30";
        },
        async startRun() {
          return "child-1";
        },
        ...(withRecentPort
          ? {
              async recentPublishes(input: { channel: string | null; limit: number }) {
                world.recentCalls.push(input);
                return opts.recentRows ?? [];
              },
            }
          : {}),
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
          return artifactsMap.get(`${runId}:${node}`) ?? null;
        },
        async set(runId, node, text) {
          artifactsMap.set(`${runId}:${node}`, text);
        },
      },
      telegram: async () => {},
      now: () => clock.now,
    },
  };
  return world;
}

async function tickUntil(world: FakeWorld, def: GraphDefinition, done: () => boolean, max = 12): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(def, world.run.id, world.ports);
}

/** Duas publicações passadas do canal X: uma com texto vivo no Redis, uma expirada. */
function xRecentRows(): RecentRow[] {
  return [
    {
      runId: "old-run-1",
      node: "publish",
      graph: "sphere-x",
      channel: "x",
      publishedAt: "2026-08-30T09:00:00Z",
      summary: "published via postiz channel=x",
    },
    {
      runId: "expired-run",
      node: "publish",
      graph: "sphere-x",
      channel: "x",
      publishedAt: "2026-08-20T09:00:00Z",
      summary: "published via postiz channel=x",
    },
  ];
}

const OLD_POST = "SEO is dead for roofers. Here is what replaced it. Ask me how.";

describe("0.8 — [__recent__] chega à criação E à crítica dos grafos de marketing", () => {
  it("sphere-x: drafts e crítico recebem o bloco; texto vivo é citado; expirado é dito com honestidade; canal pedido é o do publish", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { recentRows: xRecentRows() });
    // O texto da publicação antiga ainda vive no Redis (dentro do TTL): o
    // conteúdo do publish é o finalize (publish → approval → finalize).
    world.artifactsMap.set("old-run-1:finalize", OLD_POST);
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("critic")?.status === "succeeded");

    for (const node of ["draft-punchy", "draft-thread", "critic"]) {
      const p = world.taskPromptsByNode[node] ?? "";
      expect(p, `${node} sem o bloco [__recent__]`).toContain(RECENT_MARK);
      expect(p, `${node} sem o texto REAL da peça recente`).toContain(OLD_POST);
      expect(p, `${node} sem a entrada honesta do artefato expirado`).toContain("texto nao recuperavel");
      expect(p).toContain("registro duravel: published via postiz channel=x");
    }
    // O canal pedido ao registro é o canal do publish deste grafo.
    expect(world.recentCalls[0]).toEqual({ channel: "x", limit: RECENT_PUBLISHES_LIMIT });
    // Nós fora da superfície criação/crítica (signal, briefing, finalize) não
    // recebem a injeção — o marcador do BLOCO não aparece.
    for (const node of ["signal", "briefing", "finalize"]) {
      expect(world.taskPromptsByNode[node] ?? "", `${node} não deveria receber o bloco`).not.toContain(RECENT_MARK);
    }
  });

  it("sem publicação no registro = NENHUM artefato injetado (nunca placeholder)", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { recentRows: [] });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("critic")?.status === "succeeded");
    for (const p of Object.values(world.taskPromptsByNode)) expect(p).not.toContain(RECENT_MARK);
  });

  it("worker sem o port (fail-open): tudo roda exatamente como antes", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { withRecentPort: false });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("critic")?.status === "succeeded");
    expect(world.stepByNode("critic")?.status).toBe("succeeded");
    for (const p of Object.values(world.taskPromptsByNode)) expect(p).not.toContain(RECENT_MARK);
  });

  it("grafo NÃO-marketing (brain do CEO) nunca recebe [__recent__] nem consulta o registro", async () => {
    const world = makeWorld(DAILY_WATCHDOG_GRAPH, { recentRows: xRecentRows() });
    await tickUntil(world, DAILY_WATCHDOG_GRAPH, () => world.run.status !== "running", 20);
    expect(world.recentCalls).toEqual([]);
    for (const p of Object.values(world.taskPromptsByNode)) expect(p).not.toContain(RECENT_MARK);
  });

  it("prospect-batch (vendas) fica fora: cold email não é conteúdo de marketing", () => {
    // A superfície da injeção é a allowlist do tuner — chaves de vendas nunca
    // entram nela (invariante já pregada no prospect-batch.test.ts; re-checada
    // aqui porque agora ela também decide quem vê [__recent__]).
    expect(PROSPECT_BATCH_GRAPH.vpOwner).toBe("sales");
    for (const slug of ["prospect-draft", "prospect-critic", "prospect-finalize"]) {
      expect(TUNABLE_PROMPT_KEYS).not.toContain(slug);
    }
  });
});

describe("0.8 — a régua anti-genérico (veto) e a linha de diferenciação (criação)", () => {
  it("ANTI_GENERIC_RULE: veto nomeando a culpada, veto em abertura genérica, exigência de concreto e de peça nativa", () => {
    expect(ANTI_GENERIC_RULE).toContain("VETO");
    expect(ANTI_GENERIC_RULE).toContain("[__recent__]");
    expect(ANTI_GENERIC_RULE).toContain("repete <qual peca");
    expect(ANTI_GENERIC_RULE).toContain("VETO: generico");
    expect(ANTI_GENERIC_RULE).toContain("in today's digital world");
    expect(ANTI_GENERIC_RULE).toContain("estatistica sem fonte nomeada");
    expect(ANTI_GENERIC_RULE.toUpperCase()).toContain("NATIVA");
    expect(ANTI_GENERIC_RULE).toContain("PARTICIPACAO");
    expect(ANTI_GENERIC_RULE).toContain("ANGULO-NOVO");
  });

  it("a régua viaja DENTRO de [__lessons__] nos críticos — herdada por todos, imune a override do tuner", async () => {
    const world = makeWorld(SPHERE_X_GRAPH, { recentRows: [] });
    await tickUntil(world, SPHERE_X_GRAPH, () => world.stepByNode("critic")?.status === "succeeded");
    const critic = world.taskPromptsByNode["critic"] ?? "";
    expect(critic).toContain(`[${LESSONS_ARTIFACT}]`);
    expect(critic).toContain("REGUA ANTI-GENERICO");
    // E NÃO chega aos criadores por essa via (o draft tem a própria linha).
    expect(world.taskPromptsByNode["draft-punchy"] ?? "").not.toContain(`[${LESSONS_ARTIFACT}]`);
  });

  it("todo draft de marketing carrega a linha ANGULO-NOVO — menos o ab-draft, que publica direto", () => {
    const draftsWithInternalLine = [
      "draft-angle",
      "x-draft",
      "linkedin-draft",
      "blog-outline",
      "reddit-plan",
      "instagram-draft",
      "tiktok-draft",
      "youtube-draft",
      "experiment-draft",
      "ppc-draft",
    ];
    for (const slug of draftsWithInternalLine) {
      const p = buildPrompt("task", { prompt: slug }, []) ?? "";
      expect(p, `${slug} sem a linha de diferenciação`).toContain("ANTI-GENERICO (0.8)");
      expect(p, `${slug} sem ANGULO-NOVO`).toContain("ANGULO-NOVO");
    }
    // ab-draft: o artefato é publicado VERBATIM (contentNode) — regra sem
    // linha interna, mas com a mesma exigência de não repetir [__recent__].
    const ab = buildPrompt("task", { prompt: "ab-draft" }, []) ?? "";
    expect(ab).toContain("ANTI-GENERICO (0.8)");
    expect(ab).toContain("[__recent__]");
    expect(ab).not.toContain("ANGULO-NOVO");
    expect(ab).toContain("NAO inclua nenhuma linha interna");
  });

  it("a superfície de criação/crítica é EXATAMENTE a allowlist do tuner (uma fonte, sem drift)", () => {
    // Se um dia um draft/crítico novo de marketing entrar na allowlist, ele
    // herda [__recent__] de graça; se sair, perde — por construção.
    for (const slug of ["x-draft", "x-critic", "linkedin-draft", "linkedin-critic", "ab-draft", "ab-critic", "ppc-draft", "ppc-critic", "critique", "draft-angle"]) {
      expect(TUNABLE_PROMPT_KEYS).toContain(slug);
    }
  });
});
