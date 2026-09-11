/**
 * LEVA 2 — "outbound com prova" (founder, 11/09).
 *
 * O que está pregado aqui:
 *  - LISTA COM SINAL: o portão de código que só deixa passar quem tem
 *    presença local (GBP ou JSON-LD LocalBusiness) E sinal de marketing
 *    (conteúdo ≤12 meses, review recente ou pixel de anúncio); hotelaria e
 *    clínica de rede saem sempre (foram os STOPs da leva 1);
 *  - A PERGUNTA CERTA: nicho + cidade saem do próprio site; sem os dois, o
 *    lead não entra na leva;
 *  - GANCHO COM PROVA: o parser determinístico que lê "quem a IA recomendou
 *    no lugar dele", o veto quando o negócio JÁ é citado, e a regra de ouro —
 *    SEM RESULTADO = SEM LEVA (jamais um placeholder);
 *  - ORÇAMENTO: o lote para de gastar no teto e diz isso no bloco;
 *  - as variáveis de merge do SmartLead ({{ai_engine}}, {{competitor_1}},
 *    {{competitor_2}}, {{query}}) chegam ao dossiê e à nota do CRM.
 */

import { describe, it, expect } from "vitest";
import {
  signalGate,
  excludedVertical,
  hasLocalBusinessJsonLd,
  hasGoogleBusinessProfile,
  latestContentDate,
  hasRecentReviewSignal,
  adPixelsIn,
  inferServiceAndCity,
  MARKETING_SIGNAL_MAX_AGE_DAYS,
} from "../../apps/api/src/lib/prospect-signal";
import {
  buildProofQuery,
  extractRecommendedNames,
  runColdProofProbe,
  proofMergeVars,
  coldProofBatchBudgetUsd,
  engineDisplayName,
  COLD_PROOF_COST_PER_LEAD_USD,
  type ColdProofResult,
} from "../../packages/llm/src/cold-proof-probe";
import {
  parseProspectsForCrm,
  crmNoteFor,
  validateColdSequenceBatch,
  proofReportUrl,
} from "../../apps/api/src/lib/prospecting";
import { buildProspectBatchBlock, coldProofBudgetUsd } from "../../apps/worker/src/lib/prospect-probe";

const NOW = new Date("2026-09-11T09:00:00Z");
const DAY = 24 * 3600_000;
const iso = (daysAgo: number): string => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

/** Uma homepage que passa em TUDO — a base que cada teste degrada de propósito. */
function goodHtml(
  opts: {
    name?: string;
    jsonLdType?: string | null;
    gbp?: boolean;
    contentDaysAgo?: number | null;
    reviewDaysAgo?: number | null;
    pixel?: boolean;
    extra?: string;
    city?: string;
    region?: string;
  } = {}
): string {
  const name = opts.name ?? "Acme Roofing";
  const type = opts.jsonLdType === undefined ? "RoofingContractor" : opts.jsonLdType;
  const parts: string[] = [`<html><head><title>${name} — Roofing in Austin</title>`];
  if (type) {
    parts.push(
      `<script type="application/ld+json">{"@type":"${type}","name":"${name}","address":{"@type":"PostalAddress","addressLocality":"${opts.city ?? "Austin"}","addressRegion":"${opts.region ?? "TX"}"}}</script>`
    );
  }
  if (opts.reviewDaysAgo != null) {
    parts.push(
      `<script type="application/ld+json">{"@type":"Review","datePublished":"${iso(opts.reviewDaysAgo)}"}</script>`
    );
  }
  if (opts.pixel) parts.push(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`);
  parts.push("</head><body>");
  parts.push(`<h1>${name}</h1><p>We do roofing repair and replacement.</p>`);
  if (opts.gbp !== false) {
    parts.push(`<a href="https://www.google.com/maps/place/Acme+Roofing/@30.26,-97.74">Find us on Google</a>`);
  }
  if (opts.contentDaysAgo != null) {
    parts.push(`<article><time datetime="${iso(opts.contentDaysAgo)}">recent post</time>Roof tips</article>`);
  }
  parts.push(opts.extra ?? "");
  parts.push("</body></html>");
  return parts.join("");
}

// ---------------------------------------------------------------------------
// 1. Lista com sinal
// ---------------------------------------------------------------------------

describe("leva 2 — lista com sinal (o filtro de CÓDIGO do prospect-batch)", () => {
  it("passa o negócio com presença local + sinal de marketing, e nomeia cada sinal", () => {
    const v = signalGate({ name: "Acme Roofing", html: goodHtml({ contentDaysAgo: 30 }), now: NOW });
    expect(v.pass).toBe(true);
    expect(v.dropReason).toBeNull();
    expect(v.reasons.join(" ")).toContain("Google Business Profile");
    expect(v.reasons.join(" ")).toContain("JSON-LD LocalBusiness");
    expect(v.reasons.join(" ")).toContain("conteudo datado ha 30 dia(s)");
    expect(v.facts.contentAgeDays).toBe(30);
  });

  it("sem GBP e sem JSON-LD LocalBusiness = fora da leva, com motivo", () => {
    const html = goodHtml({ jsonLdType: null, gbp: false, contentDaysAgo: 10 });
    const v = signalGate({ name: "Acme Roofing", html, now: NOW });
    expect(v.pass).toBe(false);
    expect(v.dropReason).toContain("sem sinal de presenca local");
  });

  it("presença sim, mas site parado há mais de 12 meses e sem review/pixel = fora", () => {
    const html = goodHtml({ contentDaysAgo: MARKETING_SIGNAL_MAX_AGE_DAYS + 40 });
    const v = signalGate({ name: "Acme Roofing", html, now: NOW });
    expect(v.pass).toBe(false);
    expect(v.dropReason).toContain("sem sinal de marketing");
    expect(v.facts.contentAgeDays).toBe(MARKETING_SIGNAL_MAX_AGE_DAYS + 40);
  });

  it("qualquer UM dos três sinais de marketing basta: review recente OU pixel", () => {
    const review = signalGate({
      name: "Acme Roofing",
      html: goodHtml({ contentDaysAgo: null, reviewDaysAgo: 20 }),
      now: NOW,
    });
    expect(review.pass).toBe(true);
    expect(review.reasons.join(" ")).toContain("review com data");

    const pixel = signalGate({
      name: "Acme Roofing",
      html: goodHtml({ contentDaysAgo: null, pixel: true }),
      now: NOW,
    });
    expect(pixel.pass).toBe(true);
    expect(pixel.facts.adPixels).toContain("meta-pixel");
  });

  it("review ANTIGO não conta como sinal recente", () => {
    const html = goodHtml({ contentDaysAgo: null, reviewDaysAgo: 400 });
    expect(hasRecentReviewSignal(html, NOW)).toBe(false);
    expect(signalGate({ name: "Acme Roofing", html, now: NOW }).pass).toBe(false);
  });

  it("hotelaria sai sempre — pelo nome e pelo JSON-LD (STOPs da leva 1)", () => {
    expect(excludedVertical({ name: "Lakeside Inn & Suites" })).toContain("hotelaria");
    expect(excludedVertical({ name: "Tony's Pizzeria" })).toContain("hotelaria");
    expect(
      excludedVertical({ name: "Casa Verde", html: goodHtml({ jsonLdType: "Restaurant" }) })
    ).toContain("hotelaria");
    const v = signalGate({ name: "Harbor Hotel", html: goodHtml({ contentDaysAgo: 5 }), now: NOW });
    expect(v.pass).toBe(false);
    expect(v.dropReason).toContain("hotelaria");
  });

  it("clínica DE REDE sai; clínica de bairro fica", () => {
    const chain = goodHtml({
      name: "Bright Smile Dental",
      contentDaysAgo: 10,
      extra: "<nav>Our Locations — 14 locations across Texas</nav>",
    });
    expect(excludedVertical({ name: "Bright Smile Dental", html: chain })).toContain("rede");
    expect(signalGate({ name: "Bright Smile Dental", html: chain, now: NOW }).pass).toBe(false);

    const solo = goodHtml({ name: "Bright Smile Dental", contentDaysAgo: 10 });
    expect(excludedVertical({ name: "Bright Smile Dental", html: solo })).toBeNull();
    expect(signalGate({ name: "Bright Smile Dental", html: solo, now: NOW }).pass).toBe(true);
  });

  it("os detectores isolados fazem o que dizem", () => {
    expect(hasLocalBusinessJsonLd(goodHtml())).toBe(true);
    expect(hasLocalBusinessJsonLd(goodHtml({ jsonLdType: "WebSite" }))).toBe(false);
    expect(hasGoogleBusinessProfile(goodHtml())).toBe(true);
    expect(hasGoogleBusinessProfile(goodHtml({ gbp: false }))).toBe(false);
    expect(adPixelsIn(`<script>gtag('config','AW-12345');</script>`)).toEqual(["google-ads"]);
    expect(adPixelsIn("<p>nada</p>")).toEqual([]);
    // Data visível em texto também conta.
    const visible = latestContentDate("<p>Posted September 1, 2026</p>", NOW);
    expect(visible?.toISOString().slice(0, 10)).toBe("2026-09-01");
    // Data no futuro (agenda de evento) é ignorada.
    expect(latestContentDate(`<time datetime="${iso(-90)}">evento</time>`, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. A pergunta certa
// ---------------------------------------------------------------------------

describe("leva 2 — a pergunta certa vem do site do lead", () => {
  it("nicho + cidade saem do JSON-LD e viram a pergunta de compra", () => {
    const r = inferServiceAndCity({ name: "Acme Roofing", html: goodHtml() });
    expect(r.service).toBe("a roofing contractor");
    expect(r.city).toBe("Austin, TX");
    expect(buildProofQuery(r.service!, r.city!)).toBe("Who do you recommend for a roofing contractor in Austin, TX?");
  });

  it("sem JSON-LD, cai para endereço visível + nicho no texto", () => {
    const html =
      "<html><head><title>Nova Plumbing</title></head><body><h1>Nova Plumbing</h1>" +
      "<p>Emergency plumbing repair. Visit us at 12 Main St, Denver, CO 80202.</p></body></html>";
    const r = inferServiceAndCity({ name: "Nova Plumbing", html });
    expect(r.service).toBe("a plumber");
    expect(r.city).toBe("Denver, CO");
  });

  it("sem nicho OU sem cidade, não há pergunta — e sem pergunta não há lead", () => {
    const r = inferServiceAndCity({ name: "Zeta Holdings", html: "<html><body>We do things.</body></html>" });
    expect(r.service).toBeNull();
    expect(r.city).toBeNull();
    expect(buildProofQuery("", "Austin, TX")).toBe("");
    expect(buildProofQuery("a plumber", "")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 3. O gancho com prova
// ---------------------------------------------------------------------------

const LIST_ANSWER = [
  "Here are some options I'd recommend:",
  "",
  "1. **Lone Star Roofing** — great reviews and fast turnaround",
  "2. **Capital City Roofers**: known for metal roofs",
  "3. Hill Country Roofing Co — family owned since 1998",
  "",
  "Please check current availability before hiring.",
].join("\n");

function fakeProbes(texts: Array<{ provider: string; rawText: string }>) {
  return (async () => ({
    responses: texts.map((t) => ({
      provider: t.provider as never,
      rawText: t.rawText,
      mentioned: false,
      position: null,
      sources: [],
    })),
    blockedProviders: [],
    failedProviders: [],
  })) as never;
}

describe("leva 2 — o gancho com prova (parser determinístico, nunca um 2º LLM)", () => {
  it("extrai os nomes recomendados e remove o próprio negócio e o ruído", () => {
    const names = extractRecommendedNames(LIST_ANSWER, "Hill Country Roofing");
    expect(names).toEqual(["Lone Star Roofing", "Capital City Roofers"]);
    expect(names).not.toContain("Here are some options");
  });

  it("resposta em prosa (sem lista) não vira prova — e o lead fica fora", async () => {
    const r = await runColdProofProbe(
      { name: "Acme Roofing", service: "a roofing contractor", city: "Austin, TX" },
      { runProbes: fakeProbes([{ provider: "openai", rawText: "It really depends on your budget and roof type." }]) }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("concorrentes");
    expect(proofMergeVars(r)).toBeNull();
  });

  it("prova boa: motor, dois concorrentes e a pergunta viram variáveis de merge", async () => {
    const r = await runColdProofProbe(
      { name: "Acme Roofing", service: "a roofing contractor", city: "Austin, TX" },
      { runProbes: fakeProbes([{ provider: "openai", rawText: LIST_ANSWER }]) }
    );
    expect(r.ok).toBe(true);
    expect(r.engine).toBe("ChatGPT");
    expect(proofMergeVars(r)).toEqual({
      ai_engine: "ChatGPT",
      competitor_1: "Lone Star Roofing",
      competitor_2: "Capital City Roofers",
      query: "Who do you recommend for a roofing contractor in Austin, TX?",
    });
    expect(r.costUsd).toBe(COLD_PROOF_COST_PER_LEAD_USD);
  });

  it("negócio JÁ citado pela IA = gancho não existe, lead sai (honesto, sem forçar)", async () => {
    const cited = LIST_ANSWER.replace("Lone Star Roofing", "Acme Roofing");
    const r = await runColdProofProbe(
      { name: "Acme Roofing", service: "a roofing contractor", city: "Austin, TX" },
      { runProbes: fakeProbes([{ provider: "anthropic", rawText: cited }]) }
    );
    expect(r.ok).toBe(false);
    expect(r.selfCited).toBe(true);
    expect(r.reason).toContain("JA cita");
  });

  it("motores mudos = sem prova, sem placeholder", async () => {
    const r = await runColdProofProbe(
      { name: "Acme Roofing", service: "a roofing contractor", city: "Austin, TX" },
      { runProbes: fakeProbes([{ provider: "openai", rawText: "   " }]) }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("nenhum motor respondeu");
  });

  it("orçamento por lote é aritmética explícita", () => {
    expect(coldProofBatchBudgetUsd(50)).toBe(1.5);
    expect(coldProofBatchBudgetUsd(0)).toBe(0);
    expect(coldProofBudgetUsd({})).toBe(1.5);
    expect(coldProofBudgetUsd({ COLD_PROOF_BUDGET_USD: "0.06" })).toBe(0.06);
    expect(engineDisplayName("perplexity")).toBe("Perplexity");
  });
});

// ---------------------------------------------------------------------------
// 4. O lote fim-a-fim: filtro + prova + orçamento no bloco
// ---------------------------------------------------------------------------

describe("leva 2 — o lote inteiro: só entra quem tem sinal E prova", () => {
  const CANDIDATES = [
    "1. Acme Roofing | https://acmeroofing.com",
    "2. Harbor Hotel | https://harborhotel.com",
    "3. Quiet Plumbing | https://quietplumbing.com",
  ].join("\n");

  const WORLD: Record<string, { status: number; text: string }> = {
    // passa em tudo
    "https://acmeroofing.com": { status: 200, text: goodHtml({ contentDaysAgo: 12 }) },
    "https://acmeroofing.com/robots.txt": { status: 200, text: "User-agent: GPTBot\nDisallow: /" },
    "https://acmeroofing.com/contact": { status: 200, text: "hello@acmeroofing.com" },
    // hotelaria — excluída pela vertical
    "https://harborhotel.com": {
      status: 200,
      text: goodHtml({ name: "Harbor Hotel", contentDaysAgo: 3 }),
    },
    "https://harborhotel.com/robots.txt": { status: 404, text: "" },
    // sem sinal de marketing — site parado
    "https://quietplumbing.com": {
      status: 200,
      text: goodHtml({ name: "Quiet Plumbing", jsonLdType: "Plumber", contentDaysAgo: null }),
    },
    "https://quietplumbing.com/robots.txt": { status: 404, text: "" },
    "https://quietplumbing.com/contact": { status: 404, text: "" },
  };

  const fetchText = async (url: string) => WORLD[url] ?? { status: 404, text: "" };

  const proofOk = async (): Promise<ColdProofResult> => ({
    ok: true,
    query: "Who do you recommend for a roofing contractor in Austin, TX?",
    engine: "ChatGPT",
    competitors: ["Lone Star Roofing", "Capital City Roofers"],
    selfCited: false,
    enginesLive: 4,
    costUsd: COLD_PROOF_COST_PER_LEAD_USD,
    reason: null,
  });

  it("hotelaria e site sem sinal são DESCARTADOS com motivo; quem passa carrega SINAIS + PROVA + VARS", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: CANDIDATES, engineUsed: "claude", ms: 5 }),
      fetchText,
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0" },
      coldProof: proofOk,
    });

    expect(block).toContain("=== PROSPECT: Acme Roofing ===");
    expect(block).toContain("SINAIS (leva 2");
    expect(block).toContain("PROVA (mini free test");
    expect(block).toContain("MOTOR: ChatGPT");
    expect(block).toContain("RECOMENDADOS NO SEU LUGAR: Lone Star Roofing | Capital City Roofers");
    expect(block).toContain('"competitor_1":"Lone Star Roofing"');
    // Excluídos, cada um com o seu motivo — nunca silenciosamente.
    expect(block).not.toContain("=== PROSPECT: Harbor Hotel ===");
    expect(block).not.toContain("=== PROSPECT: Quiet Plumbing ===");
    expect(block).toContain("hotelaria");
    expect(block).toContain("sem sinal de marketing");
    // Custo do lote explícito e logado.
    expect(block).toContain("PROVA (leva 2): 1 probe(s)");
    expect(block).toContain("gasto US$0.03");
  });

  it("o 4º toque recebe {{report_url}} pronto e PERCENT-ENCODED (nome com espaço não quebra o link)", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: "1. Acme Roofing | https://acmeroofing.com", engineUsed: "c", ms: 1 }),
      fetchText,
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0" },
      coldProof: proofOk,
    });
    const vars = JSON.parse(/^VARS: (.+)$/m.exec(block)![1]!) as Record<string, string>;
    expect(vars["report_url"]).toBe(
      "https://ozvor.com/test?from=cold-2026-09-11&b=Acme+Roofing&d=acmeroofing.com&c=Lone+Star+Roofing"
    );
    // Nenhum espaço cru na URL — é isso que um href do SmartLead quebraria.
    expect(vars["report_url"]).not.toContain(" ");
    // Só dado público de negócio na URL: nunca e-mail, nunca nome de pessoa.
    expect(vars["report_url"]).not.toContain("@");
  });

  it("proofReportUrl codifica & e espaço, e cai para o domínio cru quando a URL é inválida", () => {
    const url = proofReportUrl({
      campaign: "oz-local-2026-09-14",
      company: "Smith & Sons Roofing",
      competitor: "A+B Roofers",
      website: "https://www.smithsons.com/home",
    });
    expect(url).toContain("b=Smith+%26+Sons+Roofing");
    expect(url).toContain("c=A%2BB+Roofers");
    expect(url).toContain("d=smithsons.com");
    expect(url).toContain("from=oz-local-2026-09-14");
  });

  it("probe sem prova = ZERO prospects (nada de placeholder para encher o lote)", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: CANDIDATES, engineUsed: "claude", ms: 5 }),
      fetchText,
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0" },
      coldProof: async () => ({
        ok: false,
        query: "Who do you recommend for a roofing contractor in Austin, TX?",
        engine: null,
        competitors: [],
        selfCited: true,
        enginesLive: 4,
        costUsd: COLD_PROOF_COST_PER_LEAD_USD,
        reason: "a IA JA cita o proprio negocio — o gancho da leva 2 nao se aplica (lead fora da leva)",
      }),
    });
    expect(block).not.toContain("=== PROSPECT:");
    expect(block).toContain("a IA JA cita o proprio negocio");
  });

  it("orçamento esgotado PARA o lote e grita no bloco (nada degrada calado)", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: CANDIDATES, engineUsed: "claude", ms: 5 }),
      fetchText,
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0", COLD_PROOF_BUDGET_USD: "0.01" },
      coldProof: proofOk,
    });
    expect(block).toContain("orcamento do probe esgotado");
    expect(block).toContain("ORCAMENTO ESGOTADO no lote");
    expect(block).not.toContain("=== PROSPECT:");
  });

  it("COLD_PROOF_ENABLED=0 volta ao comportamento da leva 1 e DIZ que está sem prova", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: CANDIDATES, engineUsed: "claude", ms: 5 }),
      fetchText,
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0", COLD_PROOF_ENABLED: "0" },
      coldProof: proofOk,
    });
    expect(block).toContain("PROVA (leva 2): DESLIGADA");
    // Sem o filtro da leva 2, a hotelaria volta a passar — é exatamente o
    // defeito da leva 1, e por isso o default é LIGADO.
    expect(block).toContain("=== PROSPECT: Harbor Hotel ===");
  });
});

// ---------------------------------------------------------------------------
// 5. A prova chega ao CRM e o validador cobre 4 toques
// ---------------------------------------------------------------------------

describe("leva 2 — a prova viaja para o dossiê do CRM; o validador cobre 4 toques", () => {
  it("round-trip: bloco → contato do CRM → nota com a prova (sem migração)", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: "1. Acme Roofing | https://acmeroofing.com", engineUsed: "c", ms: 1 }),
      fetchText: async (url: string) =>
        ({
          "https://acmeroofing.com": { status: 200, text: goodHtml({ contentDaysAgo: 12 }) },
          "https://acmeroofing.com/robots.txt": { status: 200, text: "User-agent: GPTBot\nDisallow: /" },
          "https://acmeroofing.com/contact": { status: 200, text: "hello@acmeroofing.com" },
        })[url] ?? { status: 404, text: "" },
      now: () => NOW,
      env: { PROSPECT_BATCH_CAP_AISTACK: "0" },
      coldProof: async () => ({
        ok: true,
        query: "Who do you recommend for a roofing contractor in Austin, TX?",
        engine: "ChatGPT",
        competitors: ["Lone Star Roofing", "Capital City Roofers"],
        selfCited: false,
        enginesLive: 4,
        costUsd: COLD_PROOF_COST_PER_LEAD_USD,
        reason: null,
      }),
    });

    const { contacts } = parseProspectsForCrm(block);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.proof).toEqual({
      query: "Who do you recommend for a roofing contractor in Austin, TX?",
      engine: "ChatGPT",
      competitors: ["Lone Star Roofing", "Capital City Roofers"],
    });
    const note = crmNoteFor(contacts[0]!);
    expect(note).toContain("PROVA ChatGPT");
    expect(note).toContain("Lone Star Roofing, Capital City Roofers");
    // A nota cabe na coluna TEXT que já existe — nenhuma migração na leva 2.
    expect(note.length).toBeLessThan(500);
  });

  it("com touches=4 o validador exige o 4º toque e mantém o e-mail 1 sem link", () => {
    const seqWith = (n: number): string =>
      [
        "=== PROSPECT: Acme Roofing ===",
        "[EMAIL 1]",
        "SUBJECT: a question",
        "I asked ChatGPT who to hire. Two other roofers came up. Want to see it?",
        ...Array.from({ length: n - 1 }, (_, i) => [
          `[EMAIL ${i + 2}]`,
          `SUBJECT: follow ${i + 2}`,
          `Here it is: https://ozvor.com/test?from=cold-2026-09-14`,
        ]).flat(),
      ].join("\n");

    expect(validateColdSequenceBatch(seqWith(4), null, { touches: 4 }).ok).toBe(true);
    const missing = validateColdSequenceBatch(seqWith(3), null, { touches: 4 });
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(" ")).toContain("[EMAIL 4] ausente");
    // Default (3 toques) segue valendo para a leva 1 — nada quebrou.
    expect(validateColdSequenceBatch(seqWith(3)).ok).toBe(true);

    const linked = seqWith(4).replace(
      "I asked ChatGPT who to hire. Two other roofers came up. Want to see it?",
      "See ozvor.com — who to hire?"
    );
    const bad = validateColdSequenceBatch(linked, null, { touches: 4 });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("EMAIL 1 contem link");
  });
});
