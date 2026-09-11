/**
 * proof-feed.test.ts — canal C (founder 2026-09-11).
 *
 * The five things this suite is here to keep true, in the order they can hurt:
 *
 *  1. A NUMBER IN A POST EXISTS IN THE MEASUREMENT. `validateProofNumbers` is
 *     the code gate the finalize node runs; if it stops catching invented
 *     figures, the whole channel becomes the thing it was built to expose.
 *  2. THE TARGET STAYS ANONYMOUS. A real business is written about without
 *     having asked. The [__proof__] block must not carry its name, site or
 *     e-mail — and that is asserted against the identity, not eyeballed.
 *  3. THE FEED ROTATES. Seven roofing-in-Austin posts in a row is the founder's
 *     "padrão repetido demais" arriving through a new door.
 *  4. THE LEAK LINT STILL BITES. The incident post shipped with production
 *     scaffolding attached; the proof CTA must not reintroduce the phrase that
 *     lint exists to catch.
 *  5. THE MONEY IS COUNTED. ?from=li-proof-* has to be recognizable, or the
 *     weekly report cannot tell the founder whether the channel sold anything.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROOF_ENGINES,
  PROOF_MIN_LIVE_ENGINES,
  PROOF_MONTHLY_CENTS_CAP,
  PROOF_SEGMENTS,
  PROOF_CAMPAIGN_LIKE,
  allowedProofNumbers,
  buildProofPrompt,
  deriveLocality,
  deriveSegment,
  extractRecommendedNames,
  isProofCampaign,
  orderCandidatesForDay,
  pairIsFresh,
  proofBlockIsAnonymous,
  proofCampaignTag,
  proofHookSentence,
  proofIsPublishable,
  proofTestLink,
  renderProofBlock,
  segmentById,
  summarizeProofEngines,
  validateProofNumbers,
  type ProofCandidate,
  type ProofFacts,
} from "../../packages/shared/src/proof-feed";
import { checkEditorialLeaks } from "../../packages/shared/src/editorial-leak";
import { parseProspectNote, targetBrandName, proofDateFor } from "../../apps/worker/src/jobs/proof-feed";
import { crmNoteFor } from "../../apps/api/src/lib/prospecting";

const ROOT = join(__dirname, "..", "..");

/** The shape a real day produces: nobody cited, four live engines, three names. */
function factsFixture(over: Partial<ProofFacts> = {}): ProofFacts {
  return {
    date: "2026-09-11",
    segment: "roofing",
    city: "Austin, TX",
    prompt: "Who do you recommend for roofing in Austin, TX? Name specific local businesses.",
    engines: [
      { engine: "openai", live: true, cited: false, position: null },
      { engine: "anthropic", live: true, cited: false, position: null },
      { engine: "gemini", live: true, cited: false, position: null },
      { engine: "perplexity", live: true, cited: false, position: null },
      { engine: "serp", live: false, cited: false, position: null },
    ],
    enginesTotal: 5,
    enginesLive: 4,
    citedEngines: 0,
    targetCited: false,
    targetRating: 4.9,
    targetReviews: 300,
    citedNames: ["Lone Star Roofing", "Hill Country Roofers", "ATX Roof Co"],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1 — the code gate: a number without proof does not ship.
// ---------------------------------------------------------------------------

describe("validateProofNumbers — o crítico veta número sem prova", () => {
  it("aceita um post cujos números estão todos na medição", () => {
    const facts = factsFixture();
    const post = [
      "I asked 4 AI engines who to hire for roofing in Austin, TX.",
      "They named 3 businesses.",
      "Zero of 4 named the shop with 4.9 stars and 300 reviews.",
      "Try it on your business.",
      proofTestLink(facts.date),
    ].join("\n");
    expect(validateProofNumbers(post, facts)).toEqual({ ok: true, unbacked: [] });
  });

  it("REPROVA um número que a medição não licencia", () => {
    const facts = factsFixture();
    const post = "I asked 4 engines about roofing in Austin. 73% of local businesses are invisible.";
    const r = validateProofNumbers(post, facts);
    expect(r.ok).toBe(false);
    expect(r.unbacked).toContain("73%");
  });

  it("REPROVA o número por extenso, não só o dígito", () => {
    const facts = factsFixture({ citedNames: null }); // hoje não dá para contar nomes
    const r = validateProofNumbers("It named seven businesses. Zero of 4 named them.", facts);
    expect(r.ok).toBe(false);
    expect(r.unbacked).toContain("seven");
  });

  it("aceita 'three' quando a contagem de nomes é 3 na prova", () => {
    expect(validateProofNumbers("Three names. Zero of 4 named them.", factsFixture()).ok).toBe(true);
  });

  it("não confunde o link (e a data dele) com uma afirmação", () => {
    const facts = factsFixture();
    const post = `Zero of 4 named them.\nTry it on your business.\n${proofTestLink(facts.date)}`;
    expect(validateProofNumbers(post, facts).ok).toBe(true);
  });

  it("não trata um ano como número inventado", () => {
    expect(validateProofNumbers("In 2026 this is how buyers search. Zero of 4 named them.", factsFixture()).ok).toBe(
      true
    );
  });

  it("SEM prova do dia, não bloqueia nada — o fail-open é contrato", () => {
    // O post de categoria de hoje continua a sair exatamente como sai.
    expect(validateProofNumbers("Brands are vanishing from AI answers. 9 out of 10 never check.", null).ok).toBe(true);
  });

  it("rating com vírgula e com ponto contam como a mesma afirmação", () => {
    const facts = factsFixture();
    expect(allowedProofNumbers(facts).has("4,9")).toBe(true);
    expect(validateProofNumbers("The shop has 4,9 stars. Zero of 4 named it.", facts).ok).toBe(true);
  });

  it("sem rating/reviews na prova, o post não pode inventar estrelas", () => {
    const facts = factsFixture({ targetRating: null, targetReviews: null });
    const r = validateProofNumbers("Zero of 4 named the shop with 4.9 stars.", facts);
    expect(r.ok).toBe(false);
    expect(r.unbacked).toContain("4.9");
  });
});

// ---------------------------------------------------------------------------
// 2 — anonimato por formato, não por pedido ao modelo.
// ---------------------------------------------------------------------------

describe("renderProofBlock — o alvo não é identificável", () => {
  const identity = {
    domain: "https://lonestarroofingaustin.com",
    name: "Lone Star Roofing Austin",
    email: "info@lonestarroofingaustin.com",
  };

  it("não emite nome, domínio nem e-mail do alvo", () => {
    // A fixture usa de propósito um nome de alvo IGUAL a um dos nomes citados
    // pela IA: se algum dia o bloco passar a imprimir a lista de citados, este
    // teste falha em vez de o post nomear o negócio medido.
    const block = renderProofBlock(factsFixture());
    expect(proofBlockIsAnonymous(block, identity)).toBe(true);
    expect(block).not.toMatch(/lonestar/i);
    expect(block).not.toContain("@");
  });

  it("carrega o que o post PODE dizer: setor, cidade e os números", () => {
    const block = renderProofBlock(factsFixture());
    expect(block).toContain("Austin, TX");
    expect(block).toContain("roofing");
    expect(block).toContain("0 de 4");
    expect(block).toContain("4.9");
    expect(block).toContain("300");
  });

  it("diz explicitamente para não inventar quando não há rating", () => {
    const block = renderProofBlock(factsFixture({ targetRating: null, targetReviews: null }));
    expect(block).toMatch(/NAO invente estrelas/);
  });

  it("proíbe afirmar contagem de nomes quando ela não é contável", () => {
    const block = renderProofBlock(factsFixture({ citedNames: null }));
    expect(block).toMatch(/NAO afirme numero de nomes/);
  });

  it("o detector de anonimato pega o rótulo registrável, não só o domínio inteiro", () => {
    const leaky = `${renderProofBlock(factsFixture())}\nO negócio é o lonestarroofingaustin.`;
    expect(proofBlockIsAnonymous(leaky, identity)).toBe(false);
  });

  it("a frase-base carrega os números certos e nenhum nome", () => {
    const s = proofHookSentence(factsFixture());
    expect(s).toContain("4 AI engines");
    expect(s).toContain("Zero of 4");
    expect(s).toContain("4.9 stars and 300 reviews");
    expect(s.toLowerCase()).not.toContain("lone star");
  });
});

// ---------------------------------------------------------------------------
// 3 — a prova de facto mede, e mede honestamente.
// ---------------------------------------------------------------------------

describe("summarizeProofEngines — motor em mock não vira 'não citado'", () => {
  it("conta só motores vivos (a doença do score sempre-89)", () => {
    const r = summarizeProofEngines([
      { engine: "openai", live: true, rawText: "1. A Co\n2. B Co", cited: false, position: null },
      { engine: "anthropic", live: true, rawText: "1. A Co\n2. B Co", cited: true, position: 2 },
      { engine: "serp", live: false, rawText: "mock answer naming nobody", cited: false, position: null },
    ]);
    expect(r.enginesTotal).toBe(3);
    expect(r.enginesLive).toBe(2);
    expect(r.citedEngines).toBe(1);
    expect(r.targetCited).toBe(true);
    // O mock não pode contribuir com uma citação falsa nem com um "não citado".
    expect(r.engines.find((e) => e.engine === "serp")!.cited).toBe(false);
  });

  it("uma medição com poucos motores vivos não abre post", () => {
    expect(proofIsPublishable({ enginesLive: PROOF_MIN_LIVE_ENGINES })).toBe(true);
    expect(proofIsPublishable({ enginesLive: PROOF_MIN_LIVE_ENGINES - 1 })).toBe(false);
  });

  it("pergunta aos mesmos motores que o teste grátis do site", () => {
    expect([...PROOF_ENGINES].sort()).toEqual(["anthropic", "gemini", "openai", "perplexity", "serp"]);
  });
});

describe("extractRecommendedNames — contar nomes ou dizer que não dá", () => {
  it("conta uma lista explícita", () => {
    const names = extractRecommendedNames(
      "Here are options:\n1. Lone Star Roofing\n2. Hill Country Roofers\n3. ATX Roof Co\nHope this helps."
    );
    expect(names).toEqual(["Lone Star Roofing", "Hill Country Roofers", "ATX Roof Co"]);
  });

  it("corta a descrição depois do travessão ou dos dois-pontos", () => {
    expect(extractRecommendedNames("- Lone Star Roofing — great reviews\n- ATX Roof Co: fast")).toEqual([
      "Lone Star Roofing",
      "ATX Roof Co",
    ]);
  });

  it("devolve null em prosa — nunca um palpite", () => {
    expect(
      extractRecommendedNames("There are many good roofers in Austin and you should check reviews carefully.")
    ).toBeNull();
  });

  it("devolve null quando só há um item (não é enumeração)", () => {
    expect(extractRecommendedNames("1. Lone Star Roofing")).toBeNull();
  });

  it("não confunde uma frase com um nome de empresa", () => {
    expect(extractRecommendedNames("1. They are the cheapest option in town\n2. You should call around")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4 — de onde vêm a cidade e o setor: código, nunca palpite.
// ---------------------------------------------------------------------------

describe("deriveLocality / deriveSegment — dado público ou nada", () => {
  it("lê o endereço do JSON-LD do próprio negócio", () => {
    const html = `<script type="application/ld+json">{"@type":"RoofingContractor","address":{"@type":"PostalAddress","addressLocality":"austin","addressRegion":"TX"}}</script>`;
    expect(deriveLocality(html)).toBe("Austin, TX");
  });

  it("cai para o title quando não há schema", () => {
    expect(deriveLocality("<title>Lone Star Roofing | Fort Worth, TX Roofers</title>")).toBe("Fort Worth, TX");
  });

  it("recusa uma sigla que não é estado americano", () => {
    expect(deriveLocality("<title>Acme | Lisboa, PT</title>")).toBeNull();
  });

  it("devolve null quando a página não diz onde fica", () => {
    expect(deriveLocality("<title>Acme Roofing — Quality Since 1998</title>")).toBeNull();
    expect(deriveLocality(null)).toBeNull();
  });

  it("identifica o ofício pelo texto público", () => {
    expect(deriveSegment({ html: "<title>ATX Roof Co | roof repair</title>" })?.id).toBe("roofing");
    expect(deriveSegment({ category: "HVAC contractor", html: null })?.id).toBe("hvac");
  });

  it("devolve null para um negócio fora do ICP — esse não é o alvo de hoje", () => {
    expect(deriveSegment({ html: "<title>Blue Bottle Coffee Roasters</title>" })).toBeNull();
  });

  it("a pergunta enviada aos motores não carrega o nome do alvo (GEO-A2)", () => {
    const seg = segmentById("roofing")!;
    const prompt = buildProofPrompt(seg, "Austin, TX");
    expect(prompt).toBe("Who do you recommend for roofing in Austin, TX? Name specific local businesses.");
    expect(prompt.toLowerCase()).not.toContain("lone star");
  });

  it("todo segmento do ICP tem rótulo e palavras-chave utilizáveis", () => {
    for (const s of PROOF_SEGMENTS) {
      expect(s.id).toMatch(/^[a-z_]+$/);
      expect(s.keywords.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — rotação: a prova muda de setor e de cidade.
// ---------------------------------------------------------------------------

describe("rotação do alvo e anti-repetição de 7 dias", () => {
  const pool: ProofCandidate[] = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map((email) => ({
    email,
    website: `https://${email.split("@")[0]}.com`,
    name: null,
    category: null,
    rating: null,
    reviews: null,
  }));

  it("é determinística: mesmo dia, mesma ordem", () => {
    const a = orderCandidatesForDay(pool, "2026-09-11").map((c) => c.email);
    const b = orderCandidatesForDay(pool, "2026-09-11").map((c) => c.email);
    expect(a).toEqual(b);
  });

  it("roda: dias diferentes não escolhem sempre o mesmo primeiro", () => {
    const firsts = new Set(
      ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"].map(
        (d) => orderCandidatesForDay(pool, d)[0]!.email
      )
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("veta o mesmo setor+cidade dentro da janela de 7 dias", () => {
    const recent = [{ segment: "roofing", city: "Austin, TX" }];
    expect(pairIsFresh({ segment: "roofing", city: "Austin, TX" }, recent)).toBe(false);
    expect(pairIsFresh({ segment: "roofing", city: "austin, tx" }, recent)).toBe(false); // caixa não salva
    expect(pairIsFresh({ segment: "hvac", city: "Austin, TX" }, recent)).toBe(true);
    expect(pairIsFresh({ segment: "roofing", city: "Dallas, TX" }, recent)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 — o lint de nota interna continua a barrar (o incidente do post).
// ---------------------------------------------------------------------------

describe("lint de vazamento editorial × o CTA da prova", () => {
  it("o post da prova passa no lint", () => {
    const post = [
      "I asked 4 AI engines who to hire for roofing in Austin, TX.",
      "They named 3 businesses. Zero of 4 named the shop with 4.9 stars and 300 reviews.",
      "That shop does good work. The buyer never hears about it.",
      "Try it on your business.",
      proofTestLink("2026-09-11"),
    ].join("\n\n");
    expect(checkEditorialLeaks(post).ok).toBe(true);
  });

  it("'link in the first comment' continua BARRADO — é instrução de produção", () => {
    // Por isso o CTA aprovado põe o link no fim do post: o publicador (Postiz
    // via /postiz-schedule, body {channel, post, image}) não sabe postar
    // primeiro comentário, e a frase é exatamente a que vazou no incidente.
    const r = checkEditorialLeaks("Try it on your business — link in the first comment");
    expect(r.ok).toBe(false);
    expect(r.matches.map((m) => m.id)).toContain("first_comment_instruction");
  });

  it("os prompts do LinkedIn dizem ao escritor para não usar essa frase", () => {
    const src = readFileSync(join(ROOT, "apps/api/src/lib/graph-prompts.ts"), "utf8");
    expect(src).toMatch(/NAO escreva 'link in the first comment'/);
  });

  it("nenhum campo de primeiro comentário existe no payload de publicação", () => {
    // Se um dia existir, este teste falha e alguém revisita o CTA de propósito.
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    expect(src).not.toMatch(/firstComment|first_comment/);
  });
});

// ---------------------------------------------------------------------------
// 7 — atribuição: o LinkedIn tem de aparecer no funil.
// ---------------------------------------------------------------------------

describe("atribuição li-proof", () => {
  it("a tag do dia e o link são um só formato", () => {
    expect(proofCampaignTag("2026-09-11")).toBe("li-proof-2026-09-11");
    expect(proofTestLink("2026-09-11")).toBe("https://ozvor.com/test?from=li-proof-2026-09-11");
  });

  it("reconhece a campanha e recusa vizinhas", () => {
    expect(isProofCampaign("li-proof-2026-09-11")).toBe(true);
    expect(isProofCampaign("cold-atlanta-01")).toBe(false);
    expect(isProofCampaign("li-proof")).toBe(false);
    expect(isProofCampaign(null)).toBe(false);
  });

  it("o padrão SQL casa com a tag que o link produz", () => {
    const tag = proofCampaignTag("2026-09-11");
    const asRegex = new RegExp(`^${PROOF_CAMPAIGN_LIKE.replace("%", ".*")}$`);
    expect(asRegex.test(tag)).toBe(true);
  });

  it("o snapshot de ops conta leads e Kit por ?from=li-proof-*", () => {
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    // First-touch: o Kit é atribuído pela lead_capture de onde veio, não pela
    // sessão da compra — um Kit de três semanas depois conta para o post certo.
    expect(src).toContain("proofFunnelSection");
    expect(src).toMatch(/JOIN lead_capture lc ON lc\.id = ko\.lead_capture_id/);
    expect(src).toMatch(/result->'attribution'->>'from'/);
    // E é lido pelo snapshot que o relatório de segunda consome.
    expect(src).toMatch(/lines\.push\(\.\.\.\(await proofFunnelSection\(sql, d\)\)\);/);
  });

  it("tabela ausente reporta a ação que destrava, nunca um zero", () => {
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    expect(src).toMatch(/NAO MEDIDO[\s\S]{0,400}aplicar a migracao 20260911000001_ops_proof_run/);
  });
});

// ---------------------------------------------------------------------------
// 8 — custo explícito.
// ---------------------------------------------------------------------------

describe("custo do canal", () => {
  it("o teto mensal é da ordem de 1 dólar, escrito em código", () => {
    expect(PROOF_MONTHLY_CENTS_CAP).toBeLessThanOrEqual(200);
    expect(PROOF_MONTHLY_CENTS_CAP).toBeGreaterThan(0);
  });

  it("a trava de 1 prova por dia é do banco: o job lê antes de gastar", () => {
    // A garantia dura é `proof_date DATE NOT NULL UNIQUE` (PR da migração, que
    // traz o teste do SQL). Deste lado o que se garante é o comportamento que
    // torna a trava efetiva: o job procura a linha de hoje ANTES de comprar
    // qualquer probe, e a escrita perde educadamente numa corrida.
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/proof-feed.ts"), "utf8");
    const readAt = src.indexOf("WHERE proof_date = ");
    const probeAt = src.indexOf("await runProbes(");
    expect(readAt).toBeGreaterThan(0);
    expect(probeAt).toBeGreaterThan(readAt);
    expect(src).toMatch(/ON CONFLICT \(proof_date\) DO NOTHING/);
  });

  it("o orçamento do mês é verificado antes de qualquer gasto", () => {
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/proof-feed.ts"), "utf8");
    const budgetAt = src.indexOf("monthSpentCents(sql)");
    const probeAt = src.indexOf("await runProbes(");
    expect(budgetAt).toBeGreaterThan(0);
    expect(probeAt).toBeGreaterThan(budgetAt);
  });

  it("o gasto vai ao ledger com um op próprio, para o teto se enxergar", () => {
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/proof-feed.ts"), "utf8");
    expect(src).toMatch(/op: "li_proof"/);
    expect(src).toMatch(/op = 'li_proof'/);
  });
});

// ---------------------------------------------------------------------------
// 9 — a ponte com o pool de outbound.
// ---------------------------------------------------------------------------

describe("alvo vindo do pool de outbound", () => {
  it("a nota do prospect-batch volta a ser legível pelo feed", () => {
    const note = crmNoteFor({
      email: "info@lonestar.com",
      name: "Lone Star Roofing",
      website: "https://lonestar.com",
      finding: "sem schema LocalBusiness",
      track: "geo",
      campaign: "cold-2026-09-03",
      rating: 4.9,
      reviewsCount: 300,
    });
    const parsed = parseProspectNote(note);
    expect(parsed.name).toBe("Lone Star Roofing");
    expect(parsed.website).toBe("https://lonestar.com");
    expect(parsed.rating).toBe(4.9);
    expect(parsed.reviews).toBe(300);
  });

  it("uma nota antiga (sem nome) degrada em vez de partir", () => {
    const old = "[prospect-batch] trilha=geo campanha=cold-2026-08-01 rating=4.7 — sem schema — https://acme.com";
    const parsed = parseProspectNote(old);
    expect(parsed.name).toBeNull();
    expect(parsed.website).toBe("https://acme.com");
    expect(parsed.rating).toBe(4.7);
  });

  it("sem nome na nota, o nome sai do title público — e só então do domínio", () => {
    const c: ProofCandidate = {
      email: "a@acmeroofing.com",
      website: "https://acmeroofing.com",
      name: null,
      category: null,
      rating: null,
      reviews: null,
    };
    expect(targetBrandName(c, "<title>Acme Roofing | Austin TX</title>")).toBe("Acme Roofing");
    expect(targetBrandName(c, null)).toBe("acmeroofing");
  });

  it("só leads AINDA NÃO TOCADOS entram (stage 'new')", () => {
    const src = readFileSync(join(ROOT, "apps/worker/src/jobs/proof-feed.ts"), "utf8");
    expect(src).toMatch(/c\.stage = 'new'/);
    // E nunca a mesma empresa duas vezes.
    expect(src).toMatch(/NOT EXISTS[\s\S]{0,160}ops\.proof_run/);
  });

  it("a data da prova é UTC, a mesma que a coluna DATE guarda", () => {
    expect(proofDateFor(new Date("2026-09-11T23:30:00Z"))).toBe("2026-09-11");
  });
});
