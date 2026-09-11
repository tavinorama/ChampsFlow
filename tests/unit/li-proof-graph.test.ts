/**
 * li-proof-graph.test.ts — canal C at the GRAPH level (founder 2026-09-11).
 *
 * The unit tests next door prove the pure rules. This file proves the wiring,
 * which is where these features actually die:
 *
 *  - the proof reaches the nodes that write the post, and ONLY those;
 *  - a finalize carrying a made-up number FAILS THE STEP, so the founder's
 *    approval box never shows it (the prompt asks; this enforces);
 *  - the founder's personal draft goes out as a REPORT and never publishes —
 *    a personal profile is not a channel the machine may speak on;
 *  - no proof today leaves the cell running exactly as it runs now, with no
 *    placeholder anywhere;
 *  - the proof port is asked at most once per advance (a per-node call would
 *    be a per-node bill).
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  PROOF_ARTIFACT,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { SPHERE_LINKEDIN_GRAPH, validateGraph } from "../../apps/api/src/lib/agent-graphs";
import { renderProofBlock, proofTestLink, type ProofFacts } from "../../packages/shared/src/proof-feed";

const FACTS: ProofFacts = {
  date: "2026-09-11",
  segment: "roofing",
  city: "Austin, TX",
  prompt: "Who do you recommend for roofing in Austin, TX? Name specific local businesses.",
  engines: [
    { engine: "openai", live: true, cited: false, position: null },
    { engine: "anthropic", live: true, cited: false, position: null },
    { engine: "gemini", live: true, cited: false, position: null },
    { engine: "perplexity", live: true, cited: false, position: null },
  ],
  enginesTotal: 4,
  enginesLive: 4,
  citedEngines: 0,
  targetCited: false,
  targetRating: 4.9,
  targetReviews: 300,
  citedNames: ["A Co", "B Co", "C Co"],
};

const GOOD_POST = [
  "I asked 4 AI engines who to hire for roofing in Austin, TX.",
  "They named 3 businesses.",
  "Zero of 4 named the shop with 4.9 stars and 300 reviews.",
  "Try it on your business.",
  proofTestLink(FACTS.date),
].join("\n\n");

/** A post with a figure nobody measured — the failure this channel must not ship. */
const INVENTED_POST = "I asked 4 engines about roofing in Austin. 68% of local shops are invisible to AI.";

interface World {
  ports: GraphRunnerPorts;
  steps: Array<StepRow & { summary?: string | null }>;
  prompts: Array<{ node: string; prompt: string }>;
  telegrams: string[];
  published: Array<{ channel: string; post: string }>;
  proofCalls: number;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(opts: { proof: boolean; finalizeOutput?: string }): World {
  const clock = new Date("2026-09-11T08:00:00Z");
  const run: RunRow = { id: "run-li", graph: SPHERE_LINKEDIN_GRAPH.slug, status: "running", started_at: clock.toISOString() };
  const steps: World["steps"] = [];
  const artifacts = new Map<string, string>();
  const prompts: World["prompts"] = [];
  const telegrams: string[] = [];
  const published: World["published"] = [];
  let seq = 0;
  let runningNode = "";

  const world: World = {
    steps,
    prompts,
    telegrams,
    published,
    proofCalls: 0,
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
          const id = `step-${++seq}`;
          runningNode = input.node;
          steps.push({ id, node: input.node, status: "running", started_at: clock.toISOString() });
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
          return "linkedinpage_impressions_7d: 420";
        },
        async startRun() {
          return "child-1";
        },
        async dailyProof() {
          world.proofCalls += 1;
          return opts.proof ? { block: renderProofBlock(FACTS), facts: FACTS } : null;
        },
      },
      hermes: {
        async task(prompt) {
          prompts.push({ node: runningNode, prompt });
          if (runningNode === "finalize") {
            return { ok: true, output: opts.finalizeOutput ?? GOOD_POST, engineUsed: "claude", ms: 10 };
          }
          if (runningNode === "founder-draft") {
            return { ok: true, output: "Fiz este teste esta manha. Zero of 4.", engineUsed: "claude", ms: 10 };
          }
          return { ok: true, output: `OUT[${runningNode}]`, engineUsed: "claude", ms: 10 };
        },
        async publish(payload) {
          published.push(payload);
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
      telegram: async (text) => {
        telegrams.push(text);
      },
      now: () => clock,
    },
  };
  return world;
}

async function tickUntil(world: World, done: () => boolean, max = 30): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(SPHERE_LINKEDIN_GRAPH, "run-li", world.ports);
}

function promptFor(world: World, node: string): string {
  return world.prompts.filter((p) => p.node === node).map((p) => p.prompt).join("\n");
}

describe("sphere-linkedin v3 — a célula da prova", () => {
  it("continua um grafo válido depois dos dois nós novos", () => {
    const v = validateGraph(SPHERE_LINKEDIN_GRAPH);
    expect(v.errors).toEqual([]);
    expect(SPHERE_LINKEDIN_GRAPH.version).toBe(3);
  });

  it("a prova chega a quem escreve o post, e só a quem escreve o post", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    for (const node of ["briefing", "draft-story", "draft-contrarian", "critic", "finalize"]) {
      expect(promptFor(world, node), `${node} devia receber a prova`).toContain(PROOF_ARTIFACT);
      expect(promptFor(world, node)).toContain("Austin, TX");
    }
    // O nó de sinal roda ANTES de haver prova e não escreve o post: injetar um
    // bloco tão prescritivo ali só distorceria a busca de ângulo.
    expect(promptFor(world, "signal")).not.toContain(PROOF_ARTIFACT);
  });

  it("o bloco que chega ao modelo não identifica o negócio medido", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    const all = world.prompts.map((p) => p.prompt).join("\n");
    // O bloco carrega setor, cidade e números — nunca nome, site ou e-mail.
    expect(all).toContain("Austin, TX");
    expect(all).not.toMatch(/target_domain|target_email|@[a-z]+\.com/i);
  });

  it("REPROVA o finalize com número que a prova não licencia", async () => {
    const world = makeWorld({ proof: true, finalizeOutput: INVENTED_POST });
    await tickUntil(world, () => world.stepByNode("finalize")?.status === "failed", 12);

    const finalize = world.stepByNode("finalize")!;
    expect(finalize.status).toBe("failed");
    expect(finalize.summary).toMatch(/numero sem prova/);
    expect(finalize.summary).toContain("68%");
    // O founder nunca vê a caixa de aprovação de um post com número inventado.
    expect(world.stepByNode("approval")).toBeUndefined();
    expect(world.published).toEqual([]);
  });

  it("deixa passar o post cujos números estão todos na medição", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    expect(world.stepByNode("finalize")?.status).toBe("succeeded");
    expect(world.stepByNode("approval")?.status).toBe("waiting");
  });

  it("o rascunho do perfil pessoal vai como RELATÓRIO e nunca publica sozinho", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("founder-report")?.status === "succeeded");

    // A regra é estrutural, não de prompt: não existe nó de publish a jusante
    // do rascunho do founder em lado nenhum do grafo.
    const founderDownstream = SPHERE_LINKEDIN_GRAPH.nodes.filter((n) => n.dependsOn.includes("founder-draft"));
    expect(founderDownstream.map((n) => n.kind)).toEqual(["report"]);
    expect(world.published).toEqual([]);

    const report = world.telegrams.find((t) => t.includes("Rascunho do teu perfil"));
    expect(report).toBeTruthy();
    expect(report).toMatch(/copia e cola/i);
  });

  it("o rascunho dele vê o post da marca, para não o contradizer", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("founder-draft")?.status === "succeeded");
    const p = promptFor(world, "founder-draft");
    expect(p).toContain("finalize");
    expect(p).toContain(PROOF_ARTIFACT);
    expect(p).toMatch(/PERFIL PESSOAL/);
  });

  it("SEM prova, a célula roda como roda hoje — e sem placeholder", async () => {
    const world = makeWorld({ proof: false, finalizeOutput: "Brands are vanishing from AI answers. Here is why." });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    expect(world.stepByNode("finalize")?.status).toBe("succeeded");
    expect(world.stepByNode("approval")?.status).toBe("waiting");
    const all = world.prompts.map((p) => p.prompt).join("\n");
    // A RÉGUA continua no prompt (é ela que diz "sem prova, post de categoria,
    // e nunca placeholder"); o que não pode existir é o BLOCO de medição.
    expect(all).toMatch(/SEM PROVA: se NAO houver bloco/);
    expect(all).not.toContain("PROVA REAL DO DIA (medida por codigo");
    expect(all).not.toContain("Austin");
    // E a régua diz, com todas as letras, para não inventar um placeholder.
    expect(all).toMatch(/NUNCA escreva placeholder/);
  });

  it("a porta da prova é chamada no máximo uma vez por avanço — custo é por chamada", async () => {
    const world = makeWorld({ proof: true });
    await advanceRun(SPHERE_LINKEDIN_GRAPH, "run-li", world.ports); // memory ‖ signal
    await advanceRun(SPHERE_LINKEDIN_GRAPH, "run-li", world.ports); // briefing
    const afterBriefing = world.proofCalls;
    await advanceRun(SPHERE_LINKEDIN_GRAPH, "run-li", world.ports); // OS DOIS drafts
    // Dois nós num único avanço, uma só leitura da prova.
    expect(world.proofCalls).toBe(afterBriefing + 1);
  });

  it("uma porta de prova que explode não derruba o post do dia", async () => {
    const world = makeWorld({ proof: true });
    world.ports.substrate.dailyProof = async () => {
      throw new Error("ops.proof_run nao existe");
    };
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    expect(world.stepByNode("approval")?.status).toBe("waiting");
  });
});

describe("os prompts do LinkedIn carregam as regras duras", () => {
  it("a régua da prova chega ao briefing, ao draft, ao crítico e ao finalize", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    for (const node of ["briefing", "draft-story", "critic", "finalize"]) {
      const p = promptFor(world, node);
      expect(p, node).toMatch(/Numero que nao esta la e invencao/);
      expect(p, node).toMatch(/NUNCA o nome dele|NUNCA escreva o nome/);
    }
  });

  it("o crítico recebe o veto explícito de número sem prova e de repetição de 7 dias", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("critic")?.status === "succeeded");
    const p = promptFor(world, "critic");
    expect(p).toMatch(/VETO: numero sem prova/);
    expect(p).toMatch(/VETO: identifica o alvo/);
    expect(p).toMatch(/mesmo setor e da mesma cidade/);
    expect(p).toMatch(/VETO: instrucao interna no texto publico/);
  });

  it("o draft recebe o CTA e o link com ?from=, e a razão de o link ir no fim", async () => {
    const world = makeWorld({ proof: true });
    await tickUntil(world, () => world.stepByNode("draft-story")?.status === "succeeded");
    const p = promptFor(world, "draft-story");
    expect(p).toContain("Try it on your business.");
    expect(p).toContain("?from=li-proof-2026-09-11");
    expect(p).toMatch(/nao sabe postar primeiro comentario/);
  });
});
