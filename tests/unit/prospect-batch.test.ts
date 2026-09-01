/**
 * 5.A.1 + 2.10 — prospect-batch: o grafo de prospecção (vendas).
 *
 * O que está pregado aqui:
 *  - o desenho: registry, validação estrutural, vendas (fora da válvula de
 *    marketing), SEM nó publish (a máquina nunca envia — o SmartLead envia,
 *    carregado pelo founder), store crm-contacts atrás do gate humano;
 *  - as funções PURAS: parse de candidatos, mini-GEO-probe (robots × AI
 *    crawlers, JSON-LD, SSR, title/meta), extração de e-mail, round-trip do
 *    bloco verificado, e o VALIDADOR DE CÓDIGO da regra 27/08 (email 1 sem
 *    link + com pergunta; ?from= obrigatório nos toques 2-3);
 *  - o runner: um draft com link no email 1 FALHA NO CÓDIGO (nunca chega à
 *    aprovação); rejeição e timeout de 96h = run falha com ZERO linhas no
 *    CRM; aprovação = linhas parseadas do bloco de CÓDIGO (nunca do LLM);
 *    CRM indisponível = perna skipped, report entrega mesmo assim;
 *  - o probe (worker): candidato que não prova existir é DESCARTADO e
 *    contado; achado só de fato verificado; e-mail só do próprio site.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import { PROSPECT_BATCH_GRAPH, validateGraph } from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, PROMPT_SLUGS, TUNABLE_PROMPT_KEYS } from "../../apps/api/src/lib/graph-prompts";
import { isGatedMarketingGraph } from "../../apps/worker/src/jobs/graph-tick";
import {
  parseCandidateList,
  robotsBlockedAiCrawlers,
  probeSite,
  jsonLdTypes,
  visibleWordCount,
  extractContactEmails,
  nameMatchesHtml,
  campaignSlug,
  renderProspectBlock,
  parseProspectsForCrm,
  containsLink,
  splitProspectSequences,
  validateColdSequenceBatch,
  EMPTY_BATCH_SENTINEL,
  type VerifiedProspect,
} from "../../apps/api/src/lib/prospecting";
import {
  buildProspectBatchBlock,
  prospectIcp,
  prospectBatchCap,
} from "../../apps/worker/src/lib/prospect-probe";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROSPECTS_BLOCK = renderProspectBlock({
  campaign: "cold-2026-09-02",
  icpSource: "docs/departments/sales/icp.md (teste)",
  listed: 5,
  verified: [
    {
      name: "Acme Roofing",
      website: "https://acmeroofing.com",
      email: "info@acmeroofing.com",
      findings: [
        "robots.txt blocks GPTBot — those AI crawlers cannot read the site",
        "no JSON-LD structured data on the homepage (no LocalBusiness/Organization schema)",
      ],
    },
    {
      name: "Bright Dental Austin",
      website: "https://brightdentalaustin.com",
      email: null, // SEM EMAIL VERIFICADO → nunca vira linha no CRM
      findings: ["homepage renders only 30 words of visible text without JavaScript"],
    },
  ],
  dropped: [{ name: "Fake Plumbing", website: "https://fakeplumbing.com", reason: "site respondeu 404" }],
});

/** Lote VÁLIDO no contrato do draft/finalize — email 1 sem link, com pergunta. */
const VALID_BATCH = [
  "=== PROSPECT: Acme Roofing ===",
  "[EMAIL 1]",
  "SUBJECT: quick question about your roofing site",
  "Hi. I checked your site this week. It tells ChatGPT's crawler to stay out. Was that on purpose?",
  "Otavio",
  "[EMAIL 2]",
  "SUBJECT: the fix takes one file",
  "That crawler block hides you from AI answers. I wrote up the fix. See it here: https://ozvor.com/?from=cold-2026-09-02",
  "Otavio",
  "[EMAIL 3]",
  "SUBJECT: last note from me",
  "Closing the loop. The audit link stays open: https://ozvor.com/ai-audit?from=cold-2026-09-02. Door is open.",
  "Otavio",
].join("\n");

/** Viola a regra 27/08: link no EMAIL 1. */
const INVALID_BATCH = VALID_BATCH.replace(
  "Was that on purpose?",
  "Was that on purpose? See https://ozvor.com for details."
);

// ---------------------------------------------------------------------------
// Fake world (pattern-copy do ab-experiment.test.ts)
// ---------------------------------------------------------------------------

interface FakeWorld {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  crmStored: Array<{ campaign: string; contacts: Array<{ email: string; name: string; website: string; finding: string }> }>;
  clock: { now: Date };
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
}

function makeWorld(
  opts: {
    draftOutput?: string;
    finalizeOutput?: string;
    prospectsBlock?: string;
    withCrmPort?: boolean;
    crmResult?: { ok: boolean; inserted: number; reason?: string };
  } = {}
): FakeWorld {
  const clock = { now: new Date("2026-09-02T07:30:00Z") }; // uma quarta-feira
  const run: RunRow = {
    id: "run-prospect",
    graph: PROSPECT_BATCH_GRAPH.slug,
    status: "running",
    started_at: clock.now.toISOString(),
  };
  const steps: FakeWorld["steps"] = [];
  const artifacts = new Map<string, string>();
  let stepSeq = 0;
  const withCrmPort = opts.withCrmPort ?? true;

  const world: FakeWorld = {
    run,
    steps,
    telegrams: [],
    crmStored: [],
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
        async recordOutcome() {
          throw new Error("prospect-batch não grava outcome (sem harvest/verdict)");
        },
        publishedToday: async () => 0,
        async readHarvest() {
          throw new Error("prospect-batch não colhe métrica");
        },
        async snapshot(input) {
          expect(input.source).toBe("prospects");
          return opts.prospectsBlock ?? PROSPECTS_BLOCK;
        },
        async startRun() {
          throw new Error("prospect-batch nunca spawna");
        },
        ...(withCrmPort
          ? {
              async storeCrmContacts(input: {
                runId: string;
                campaign: string;
                contacts: Array<{ email: string; name: string; website: string; finding: string }>;
              }) {
                world.crmStored.push({ campaign: input.campaign, contacts: input.contacts });
                return opts.crmResult ?? { ok: true, inserted: input.contacts.length };
              },
            }
          : {}),
      },
      hermes: {
        async task(prompt) {
          const node = steps[steps.length - 1]?.node ?? "?";
          const out =
            node === "draft"
              ? (opts.draftOutput ?? VALID_BATCH)
              : node === "critic"
                ? "Acme Roofing: parecer limpo, achado real citado.\nLOTE: APTO"
                : node === "finalize"
                  ? (opts.finalizeOutput ?? opts.draftOutput ?? VALID_BATCH)
                  : `OUT[${node}] ${prompt.slice(0, 0)}`;
          return { ok: true, output: out, engineUsed: "claude", ms: 10 };
        },
        async publish() {
          throw new Error("prospect-batch NUNCA publica — a máquina não envia");
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
  for (let i = 0; i < max && !done(); i++) await advanceRun(PROSPECT_BATCH_GRAPH, world.run.id, world.ports);
}

function hoursPass(world: FakeWorld, h: number): void {
  world.clock.now = new Date(world.clock.now.getTime() + h * 3600 * 1000);
}

// ---------------------------------------------------------------------------
// O desenho
// ---------------------------------------------------------------------------

describe("prospect-batch (5.A.1) — o desenho", () => {
  it("está no registry, valida, é VENDAS e NÃO conta na válvula de marketing", () => {
    const def = GRAPH_REGISTRY["prospect-batch"];
    expect(def, "prospect-batch fora do registry — o cron de quarta não iniciaria nada").toBeTruthy();
    expect(def).toBe(PROSPECT_BATCH_GRAPH);
    expect(def!.vpOwner).toBe("sales");
    expect(validateGraph(def!).errors).toEqual([]);
    expect(isGatedMarketingGraph("prospect-batch")).toBe(false);
  });

  it("NÃO tem nó publish nem spawn — a máquina nunca envia e-mail (SmartLead envia, founder carrega)", () => {
    expect(PROSPECT_BATCH_GRAPH.nodes.some((n) => n.kind === "publish")).toBe(false);
    expect(PROSPECT_BATCH_GRAPH.nodes.some((n) => n.kind === "spawn")).toBe(false);
  });

  it("o CRM fica atrás do gate humano: store crm-contacts depende do approval e parseia o bloco de CÓDIGO", () => {
    const store = PROSPECT_BATCH_GRAPH.nodes.find((n) => n.id === "store-crm")!;
    expect(store.kind).toBe("store");
    expect(store.dependsOn).toEqual(["approval"]);
    // A fonte dos contatos é o snapshot verificado por código, nunca o LLM.
    expect(store.config).toMatchObject({ target: "crm-contacts", contactsNode: "prospects" });
    const approval = PROSPECT_BATCH_GRAPH.nodes.find((n) => n.id === "approval")!;
    expect(approval.config).toMatchObject({ channel: "telegram", timeoutHours: 96 });
    expect(approval.config?.["optional"]).toBeUndefined(); // rejeição = lote morto
  });

  it("draft e finalize carregam o validador de CÓDIGO da regra 27/08 (config.validate)", () => {
    const draft = PROSPECT_BATCH_GRAPH.nodes.find((n) => n.id === "draft")!;
    const finalize = PROSPECT_BATCH_GRAPH.nodes.find((n) => n.id === "finalize")!;
    expect(draft.config?.["validate"]).toBe("cold-email-batch");
    expect(finalize.config?.["validate"]).toBe("cold-email-batch");
  });

  it("report depende do approval + finalize (não do store): CRM fora do ar nunca segura as sequências", () => {
    const report = PROSPECT_BATCH_GRAPH.nodes.find((n) => n.id === "report")!;
    expect(report.dependsOn).toEqual(["approval", "finalize"]);
  });

  it("prompts existem, exigem a regra do email 1 e FICAM FORA da allowlist do tuner (marketing-only)", () => {
    for (const slug of ["prospect-draft", "prospect-critic", "prospect-finalize"]) {
      expect(PROMPT_SLUGS).toContain(slug);
      expect(TUNABLE_PROMPT_KEYS).not.toContain(slug);
    }
    const draft = buildPrompt("task", { prompt: "prospect-draft" }, []) ?? "";
    expect(draft).toContain("ZERO links");
    expect(draft).toContain("?from=");
    expect(draft).toContain("INGLES");
  });
});

// ---------------------------------------------------------------------------
// Funções puras — parse, probe e o validador da regra 27/08
// ---------------------------------------------------------------------------

describe("prospecting — parse de candidatos", () => {
  it("aceita linhas numeradas, prependa https:// e descarta IP/localhost/sem-ponto/duplicado", () => {
    const out = parseCandidateList(
      [
        "1. Acme Roofing | acmeroofing.com",
        "2) Bright Dental | https://brightdental.com/",
        "- Weird | 192.168.0.1",
        "Local | localhost",
        "NoDot | intranet",
        "Dupe Roofing | https://acmeroofing.com/about",
        "not a candidate line",
      ].join("\n")
    );
    expect(out).toEqual([
      { name: "Acme Roofing", website: "https://acmeroofing.com" },
      { name: "Bright Dental", website: "https://brightdental.com" },
    ]);
  });
});

describe("prospecting — mini-GEO-probe (2.10)", () => {
  it("robots: grupo específico bloqueia GPTBot; grupo * com Disallow: / bloqueia os quatro; specific allow vence o *", () => {
    expect(robotsBlockedAiCrawlers("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:")).toEqual(["GPTBot"]);
    expect(robotsBlockedAiCrawlers("User-agent: *\nDisallow: /")).toEqual([
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
    ]);
    // Grupo específico SEM root-disallow libera o crawler mesmo com * fechado.
    expect(
      robotsBlockedAiCrawlers("User-agent: GPTBot\nDisallow: /private\n\nUser-agent: *\nDisallow: /")
    ).toEqual(["ClaudeBot", "PerplexityBot", "Google-Extended"]);
    expect(robotsBlockedAiCrawlers(null)).toEqual([]);
  });

  it("homepage magra + robots fechado + sem JSON-LD = 3 achados concretos, cada um verificável", () => {
    const html =
      "<html><head><title>Acme Roofing</title></head><body><h1>Acme Roofing</h1><p>Best roofs in Austin.</p><script>var hidden='lots of js text that must not count';</script></body></html>";
    const { facts, findings } = probeSite({ html, robotsTxt: "User-agent: GPTBot\nDisallow: /" });
    expect(facts.blockedAiCrawlers).toEqual(["GPTBot"]);
    expect(facts.jsonLdTypes).toEqual([]);
    expect(facts.hasTitle).toBe(true);
    expect(facts.hasMetaDescription).toBe(false);
    expect(facts.visibleWords).toBe(8); // o texto do <script> NÃO conta
    expect(findings).toHaveLength(3); // cap em 3, mais forte primeiro
    expect(findings[0]).toContain("robots.txt blocks GPTBot");
    expect(findings[1]).toContain("no JSON-LD");
    expect(findings[2]).toContain("only 8 words");
  });

  it("página com LocalBusiness em JSON-LD não ganha o achado de schema", () => {
    const html =
      '<html><head><title>x</title><meta name="description" content="desc"></head><body>' +
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Acme"}</script>' +
      `<p>${"palavra ".repeat(150)}</p></body></html>`;
    expect(jsonLdTypes(html)).toEqual(["LocalBusiness"]);
    const { findings } = probeSite({ html, robotsTxt: "User-agent: *\nDisallow:" });
    expect(findings).toEqual([]); // site saudável = sem munição = descartado no probe
    expect(visibleWordCount(html)).toBeGreaterThan(120);
  });

  it("extração de e-mail: só endereços plausíveis do HTML, lixo de asset filtrado", () => {
    const html =
      '<a href="mailto:info@acmeroofing.com">write us</a> <img src="logo@2x.png"> contato: Office@AcmeRoofing.com ou noreply@acmeroofing.com';
    expect(extractContactEmails(html)).toEqual(["info@acmeroofing.com", "office@acmeroofing.com"]);
    expect(extractContactEmails(null)).toEqual([]);
  });

  it("nameMatchesHtml: 'Smith Roofing LLC' casa com site dizendo 'Smith Roofing'; alucinação não casa", () => {
    const html = "<html><body><h1>Smith Roofing</h1><p>Family owned.</p></body></html>";
    expect(nameMatchesHtml("Smith Roofing LLC", html)).toBe(true);
    expect(nameMatchesHtml("Sunrise Dental Clinic", html)).toBe(false);
  });
});

describe("prospecting — bloco verificado ↔ CRM (round-trip)", () => {
  it("parseProspectsForCrm lê SÓ prospects com e-mail real; SEM EMAIL VERIFICADO fica de fora", () => {
    const parsed = parseProspectsForCrm(PROSPECTS_BLOCK);
    expect(parsed.campaign).toBe("cold-2026-09-02");
    expect(parsed.contacts).toEqual([
      {
        email: "info@acmeroofing.com",
        name: "Acme Roofing",
        website: "https://acmeroofing.com",
        finding: "robots.txt blocks GPTBot — those AI crawlers cannot read the site",
      },
    ]);
  });

  it("campaignSlug: cold-<data ISO>", () => {
    expect(campaignSlug(new Date("2026-09-02T07:30:00Z"))).toBe("cold-2026-09-02");
  });

  it("lote vazio rende o sentinel honesto na primeira linha", () => {
    const block = renderProspectBlock({ campaign: "cold-x", icpSource: "teste", listed: 4, verified: [], dropped: [] });
    expect(block.startsWith(EMPTY_BATCH_SENTINEL)).toBe(true);
    expect(parseProspectsForCrm(block).contacts).toEqual([]);
  });
});

describe("prospecting — o validador de CÓDIGO da regra 27/08", () => {
  it("containsLink pega http, www., domínio nu, markdown e mailto — e libera texto puro", () => {
    expect(containsLink("see https://ozvor.com now")).toBe(true);
    expect(containsLink("go to www.acme.com")).toBe(true);
    expect(containsLink("check acmeroofing.com today")).toBe(true);
    expect(containsLink("click [here](https://x.y)")).toBe(true);
    expect(containsLink("mailto:me@x.io")).toBe(true);
    expect(containsLink("Your site tells ChatGPT's crawler to stay out. Was that on purpose?")).toBe(false);
  });

  it("lote válido passa; parse extrai 3 e-mails com SUBJECT", () => {
    expect(validateColdSequenceBatch(VALID_BATCH)).toEqual({ ok: true, errors: [] });
    const seqs = splitProspectSequences(VALID_BATCH);
    expect(seqs).toHaveLength(1);
    expect(seqs[0]!.prospect).toBe("Acme Roofing");
    expect(seqs[0]!.emails.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(seqs[0]!.emails[0]!.subject).toContain("quick question");
  });

  it("REPROVA link no email 1 — inclusive no assunto", () => {
    const v = validateColdSequenceBatch(INVALID_BATCH);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("EMAIL 1 contem link");
    const subjectLink = VALID_BATCH.replace("SUBJECT: quick question about your roofing site", "SUBJECT: see ozvor.com");
    expect(validateColdSequenceBatch(subjectLink).ok).toBe(false);
  });

  it("REPROVA email 1 sem pergunta (o 1º toque busca resposta)", () => {
    const noQuestion = VALID_BATCH.replace("Was that on purpose?", "That was probably a mistake.");
    const v = validateColdSequenceBatch(noQuestion);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("sem pergunta");
  });

  it("REPROVA link ozvor.com sem ?from= nos e-mails 2-3", () => {
    const noFrom = VALID_BATCH.replace("https://ozvor.com/?from=cold-2026-09-02", "https://ozvor.com/");
    const v = validateColdSequenceBatch(noFrom);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("sem ?from=");
  });

  it("REPROVA e-mail faltando e texto sem bloco de prospect; aceita o sentinel de lote vazio", () => {
    const missing = VALID_BATCH.replace(/\[EMAIL 3\][\s\S]*$/, "");
    expect(validateColdSequenceBatch(missing).ok).toBe(false);
    expect(validateColdSequenceBatch("bla bla").ok).toBe(false);
    expect(validateColdSequenceBatch(`${EMPTY_BATCH_SENTINEL} — 0 de 5.`).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Runner — regra 27/08 no código, gate humano, CRM do bloco de código
// ---------------------------------------------------------------------------

describe("prospect-batch — caminho feliz", () => {
  it("aprovação mostra o lote e o destino CRM/SmartLead; o sim insere SÓ contatos do bloco de CÓDIGO", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");

    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO NECESSÁRIA"));
    expect(ask, "a aprovação não chegou ao Telegram").toBeTruthy();
    expect(ask).toContain("inserir os prospects VERIFICADOS no CRM");
    expect(ask).toContain("SmartLead");
    expect(ask).toContain("a máquina não envia nada");

    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    // CRM: parse do bloco verificado — 1 contato (o SEM EMAIL fica fora),
    // campanha do bloco, nota-fonte = o achado do próprio prospect.
    expect(world.crmStored).toHaveLength(1);
    expect(world.crmStored[0]!.campaign).toBe("cold-2026-09-02");
    expect(world.crmStored[0]!.contacts).toEqual([
      expect.objectContaining({ email: "info@acmeroofing.com", name: "Acme Roofing" }),
    ]);
    expect(world.stepByNode("store-crm")?.summary).toContain("stage 'new'");
    // O report entregou as sequências prontas para colar no SmartLead.
    const report = world.telegrams.find((t) => t.includes("PROSPECÇÃO DA SEMANA"));
    expect(report).toBeTruthy();
    expect(report).toContain("=== PROSPECT: Acme Roofing ===");
  });
});

describe("prospect-batch — a regra 27/08 é CÓDIGO, não pedido de prompt", () => {
  it("draft com link no email 1 FALHA no validador (nunca chega à aprovação); budget esgotado fecha o run", async () => {
    const world = makeWorld({ draftOutput: INVALID_BATCH });
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("draft")?.summary).toContain("validador cold-email");
    expect(world.stepByNode("draft")?.summary).toContain("EMAIL 1 contem link");
    // Nunca virou aprovação, nunca virou CRM.
    expect(world.stepByNode("approval")).toBeUndefined();
    expect(world.crmStored).toEqual([]);
    // O retry budget deu chances reais antes de falhar (3 tentativas = 1+2).
    expect(world.steps.filter((s) => s.node === "draft")).toHaveLength(3);
  });

  it("finalize também é validado: um finalize que reintroduz link falha do mesmo jeito", async () => {
    const world = makeWorld({ draftOutput: VALID_BATCH, finalizeOutput: INVALID_BATCH });
    await tickUntil(world, () => world.run.status !== "running");
    expect(world.run.status).toBe("failed");
    expect(world.stepByNode("finalize")?.summary).toContain("validador cold-email");
    expect(world.crmStored).toEqual([]);
  });
});

describe("prospect-batch — gate humano: rejeição e silêncio = ZERO linhas no CRM", () => {
  it("rejeição do founder falha o run sem tocar o CRM", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    const approvalStep = world.stepByNode("approval")!;
    approvalStep.status = "failed";
    approvalStep.summary = "founder rejected via Telegram button";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.crmStored).toEqual([]);
    expect(world.stepByNode("store-crm")).toBeUndefined();
  });

  it("96h de silêncio = rejeição: run falha, zero CRM, aviso nomeando o conteúdo que morreu", async () => {
    const world = makeWorld();
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    hoursPass(world, 97);
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("failed");
    expect(world.crmStored).toEqual([]);
    expect(world.telegrams.join("\n")).toContain("APROVAÇÃO EXPIROU");
  });
});

describe("prospect-batch — a perna CRM é fail-soft; as sequências sempre chegam", () => {
  it("worker sem o port de CRM: store skipped, run SUCEDE e o report entrega", async () => {
    const world = makeWorld({ withCrmPort: false });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    expect(world.stepByNode("store-crm")?.status).toBe("skipped");
    expect(world.stepByNode("store-crm")?.summary).toContain("CRM OFF");
    expect(world.telegrams.find((t) => t.includes("PROSPECÇÃO DA SEMANA"))).toBeTruthy();
  });

  it("CRM que não grava (ex.: tabela ausente): skipped + aviso alto, report entrega mesmo assim", async () => {
    const world = makeWorld({ crmResult: { ok: false, inserted: 0, reason: "tabela crm_contact ausente — aplicar migracao" } });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    expect(world.stepByNode("store-crm")?.status).toBe("skipped");
    expect(world.telegrams.join("\n")).toContain("CRM NÃO GRAVADO");
    expect(world.telegrams.find((t) => t.includes("PROSPECÇÃO DA SEMANA"))).toBeTruthy();
  });

  it("lote sem nenhum e-mail verificado: store no-op honesto, zero linhas, dito em voz alta", async () => {
    const noEmailBlock = renderProspectBlock({
      campaign: "cold-2026-09-02",
      icpSource: "teste",
      listed: 3,
      verified: [
        { name: "Bright Dental Austin", website: "https://brightdentalaustin.com", email: null, findings: ["homepage has no meta description"] },
      ],
      dropped: [],
    });
    const world = makeWorld({ prospectsBlock: noEmailBlock });
    await tickUntil(world, () => world.stepByNode("approval")?.status === "waiting");
    world.stepByNode("approval")!.status = "succeeded";
    await tickUntil(world, () => world.run.status !== "running");

    expect(world.run.status).toBe("succeeded");
    expect(world.crmStored).toEqual([]); // o port nem foi chamado
    expect(world.stepByNode("store-crm")?.status).toBe("succeeded");
    expect(world.telegrams.join("\n")).toContain("CRM SEM LINHAS");
  });
});

// ---------------------------------------------------------------------------
// O probe (worker) — LLM sugere, CÓDIGO decide
// ---------------------------------------------------------------------------

describe("prospect-probe — verificação por código", () => {
  const CANDIDATES = [
    "1. Acme Roofing | https://acmeroofing.com",
    "2. Dead Site Plumbing | https://deadsite.com",
    "3. Wrong Name HVAC | https://unrelated.com",
  ].join("\n");

  const ACME_HTML =
    "<html><head><title>Acme Roofing — Austin</title></head><body><h1>Acme Roofing</h1><p>Best roofs.</p></body></html>";
  const UNRELATED_HTML =
    `<html><head><title>Totally Different Co</title><meta name="description" content="d"></head><body><p>${"word ".repeat(200)}</p></body></html>`;

  function fakeFetch(map: Record<string, { status: number; text: string } | null>) {
    return async (url: string) => (url in map ? map[url]! : { status: 404, text: "" });
  }

  it("candidato morto e nome-que-não-confere são DESCARTADOS e contados; achado e e-mail vêm do próprio site", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: CANDIDATES, engineUsed: "claude", ms: 5 }),
      fetchText: fakeFetch({
        "https://acmeroofing.com": { status: 200, text: ACME_HTML },
        "https://acmeroofing.com/robots.txt": { status: 200, text: "User-agent: GPTBot\nDisallow: /" },
        "https://acmeroofing.com/contact": { status: 200, text: "reach us: hello@acmeroofing.com" },
        "https://deadsite.com": null,
        "https://unrelated.com": { status: 200, text: UNRELATED_HTML },
        "https://unrelated.com/robots.txt": { status: 404, text: "" },
      }),
      now: () => new Date("2026-09-02T07:30:00Z"),
      env: {},
    });

    expect(block).toContain("CAMPANHA: cold-2026-09-02");
    expect(block).toContain("VERIFICADOS: 1 · DESCARTADOS: 2");
    expect(block).toContain("=== PROSPECT: Acme Roofing ===");
    expect(block).toContain("robots.txt blocks GPTBot");
    // e-mail veio da página /contact (homepage não tinha) — extraído por código.
    expect(block).toContain("EMAIL: hello@acmeroofing.com");
    expect(block).toContain("site nao respondeu");
    expect(block).toContain("nome do negocio nao aparece no HTML");
    // O descartado nunca aparece como prospect.
    expect(block).not.toContain("=== PROSPECT: Dead Site Plumbing ===");
    expect(block).not.toContain("=== PROSPECT: Wrong Name HVAC ===");
  });

  it("engines fora do ar = bloco sentinel honesto (o grafo degrada sem inventar prospect)", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: false, output: "all engines failed", engineUsed: null, ms: null }),
      fetchText: fakeFetch({}),
      now: () => new Date("2026-09-02T07:30:00Z"),
      env: {},
    });
    expect(block.startsWith(EMPTY_BATCH_SENTINEL)).toBe(true);
    expect(block).toContain("engines indisponiveis");
    expect(validateColdSequenceBatch(block.split("\n")[0]!).ok).toBe(true);
  });

  it("PROSPECT_BATCH_CAP limita os verificados; PROSPECT_ICP substitui o ICP e o bloco nomeia a fonte", async () => {
    expect(prospectBatchCap({})).toBe(10);
    expect(prospectBatchCap({ PROSPECT_BATCH_CAP: "1" })).toBe(1);
    expect(prospectIcp({}).source).toContain("docs/departments/sales/icp.md");
    expect(prospectIcp({ PROSPECT_ICP: "meu icp" })).toEqual({ text: "meu icp", source: "env PROSPECT_ICP (override do founder)" });

    const twoGood = ["A Roofing | https://a.com", "B Roofing | https://b.com"].join("\n");
    const html = (name: string) => `<html><head><title>${name}</title></head><body><h1>${name}</h1></body></html>`;
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: twoGood, engineUsed: "claude", ms: 5 }),
      fetchText: fakeFetch({
        "https://a.com": { status: 200, text: html("A Roofing") },
        "https://a.com/robots.txt": { status: 404, text: "" },
        "https://a.com/contact": { status: 404, text: "" },
        "https://b.com": { status: 200, text: html("B Roofing") },
        "https://b.com/robots.txt": { status: 404, text: "" },
        "https://b.com/contact": { status: 404, text: "" },
      }),
      now: () => new Date("2026-09-02T07:30:00Z"),
      env: { PROSPECT_BATCH_CAP: "1" },
    });
    expect(block).toContain("VERIFICADOS: 1");
    expect(block).toContain("docs/departments/sales/icp.md");
  });
});
