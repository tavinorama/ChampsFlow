/**
 * 10.C.17 / 5.A.6 — fonte Apify do prospect-batch (decisão 2 do founder,
 * 02/09). O que está pregado aqui:
 *
 *  - a fonte NUNCA roda sozinha: sem spec confirmado na mailbox = fonte
 *    engine (comportamento histórico); sem confirm = decisão negada e ZERO
 *    chamadas; sem APIFY_TOKEN = indisponível com mensagem honesta e ZERO
 *    chamadas;
 *  - a matemática da estimativa (places × preço/1k) e o portão de orçamento
 *    mensal (gasto + estimativa > teto = recusa) — o MESMO decideApifyRun
 *    nas duas pontas;
 *  - validação do spec (trilha, queries, maxPlaces, formato do actor id);
 *  - parse determinístico dos items do actor (fone/rating/reviews/e-mail);
 *  - dedup contra o CRM por e-mail e por domínio (freemail nunca por domínio);
 *  - o switch de fonte no buildProspectBatchBlock: spec presente → actor para
 *    a trilha do spec, outra trilha OFF, engines NÃO são chamados; proxies de
 *    fechabilidade viajam do bloco até a nota do CRM.
 */

import { describe, it, expect } from "vitest";
import {
  parseApifyRunSpec,
  isValidApifyActorId,
  apifySpecPlaces,
  apifyPricePer1kUsd,
  apifyMonthlyBudgetUsd,
  estimateApifyCostUsd,
  decideApifyRun,
  parseApifyItems,
  renderProspectBlock,
  parseProspectsForCrm,
  crmNoteFor,
  APIFY_MAX_PLACES_PER_RUN,
  type ApifyRunSpec,
} from "../../apps/api/src/lib/prospecting";
import {
  fetchApifyCandidates,
  runApifySource,
  redisSpecMailbox,
  apiSpendLedger,
  APIFY_SPEC_REDIS_KEY,
  type ApifyFetchFn,
  type ApifyLedger,
} from "../../apps/worker/src/lib/apify-source";
import { buildProspectBatchBlock, crmDedupSets } from "../../apps/worker/src/lib/prospect-probe";

const SPEC: ApifyRunSpec = { track: "geo", queries: ["roofing contractor Fort Worth TX"], maxPlaces: 50 };

const okLedger = (spentCents = 0): ApifyLedger & { recorded: Array<{ cents: number; ref: string }> } => {
  const recorded: Array<{ cents: number; ref: string }> = [];
  return {
    recorded,
    async monthSpentCents() {
      return spentCents;
    },
    async record(cents, ref) {
      recorded.push({ cents, ref });
    },
  };
};

const ITEMS = [
  {
    title: "Acme Roofing",
    website: "https://acmeroofing.com",
    phone: "+1 817-555-0101",
    categoryName: "Roofing contractor",
    totalScore: 4.6,
    reviewsCount: 128,
    emails: ["info@acmeroofing.com"],
  },
  { title: "No Site LLC", phone: "+1 817-555-0102" }, // sem website → fora
  { title: "Maps Only", website: "https://www.google.com/maps/place/x" }, // perfil do maps → fora
  { title: "Acme Roofing dup", website: "https://acmeroofing.com/contact" }, // host duplicado → fora
];

// ---------------------------------------------------------------------------
// Spec + actor id + estimativa
// ---------------------------------------------------------------------------

describe("parseApifyRunSpec / actor id", () => {
  it("aceita spec válido e normaliza queries", () => {
    const r = parseApifyRunSpec({ track: "geo", queries: [" roofing Fort Worth TX ", ""], maxPlaces: 50 });
    expect(r.ok).toBe(true);
    expect(r.spec?.queries).toEqual(["roofing Fort Worth TX"]);
    expect(r.spec?.maxPlaces).toBe(50);
  });

  it("recusa trilha inválida, queries vazias e maxPlaces não-numérico", () => {
    const r = parseApifyRunSpec({ track: "ppc", queries: [], maxPlaces: "x" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("recusa o teto de places por dispatch (faucet fechado)", () => {
    const r = parseApifyRunSpec({ track: "geo", queries: ["a b c", "d e f"], maxPlaces: APIFY_MAX_PLACES_PER_RUN });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("excede o teto");
  });

  it("valida FORMATO do actor id sem assumir que existe", () => {
    expect(isValidApifyActorId("compass/crawler-google-places")).toBe(true);
    expect(isValidApifyActorId("nwua9Gu5YrADL7ZDj")).toBe(true); // id de plataforma
    expect(isValidApifyActorId("not an actor")).toBe(false);
    expect(isValidApifyActorId("../../etc/passwd")).toBe(false);
    const r = parseApifyRunSpec({ track: "geo", queries: ["roofing TX"], maxPlaces: 10, actorId: "bad id!" });
    expect(r.ok).toBe(false);
  });
});

describe("estimativa de custo + envs", () => {
  it("places × preço/1k, arredondado a centavos", () => {
    expect(estimateApifyCostUsd(50, 5)).toBe(0.25);
    expect(estimateApifyCostUsd(1000, 5)).toBe(5);
    expect(estimateApifyCostUsd(333, 5)).toBe(1.67);
    expect(estimateApifyCostUsd(0, 5)).toBe(0);
    expect(estimateApifyCostUsd(100, 0)).toBe(0);
  });

  it("apifySpecPlaces = queries × maxPlaces (pior caso)", () => {
    expect(apifySpecPlaces({ queries: ["a", "b", "c"], maxPlaces: 40 })).toBe(120);
  });

  it("envs com default honesto (5 e 100) e override", () => {
    expect(apifyPricePer1kUsd({} as NodeJS.ProcessEnv)).toBe(5);
    expect(apifyPricePer1kUsd({ APIFY_PRICE_PER_1K_USD: "9" } as unknown as NodeJS.ProcessEnv)).toBe(9);
    expect(apifyMonthlyBudgetUsd({} as NodeJS.ProcessEnv)).toBe(100);
    expect(apifyMonthlyBudgetUsd({ APIFY_MONTHLY_BUDGET_USD: "40" } as unknown as NodeJS.ProcessEnv)).toBe(40);
  });
});

describe("decideApifyRun — o portão único confirm + orçamento", () => {
  it("sem confirmação = negado, e a razão diz que NADA foi chamado", () => {
    const d = decideApifyRun({ confirmed: false, estimateUsd: 0.25, monthSpentUsd: 0, budgetUsd: 100 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("NADA foi chamado");
  });

  it("estouro do orçamento mensal = negado com os números", () => {
    const d = decideApifyRun({ confirmed: true, estimateUsd: 2, monthSpentUsd: 99, budgetUsd: 100 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("APIFY_MONTHLY_BUDGET_USD");
  });

  it("confirmado e dentro do orçamento = permitido", () => {
    expect(decideApifyRun({ confirmed: true, estimateUsd: 2, monthSpentUsd: 90, budgetUsd: 100 }).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Parse dos items + cliente
// ---------------------------------------------------------------------------

describe("parseApifyItems", () => {
  it("mapeia fone/categoria/rating/reviews/e-mail e derruba sem-site, maps-profile e host duplicado", () => {
    const out = parseApifyItems(ITEMS);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.name).toBe("Acme Roofing");
    expect(c.phone).toBe("+1 817-555-0101");
    expect(c.rating).toBe(4.6);
    expect(c.reviewsCount).toBe(128);
    expect(c.email).toBe("info@acmeroofing.com");
  });
});

describe("fetchApifyCandidates / runApifySource", () => {
  it("sem APIFY_TOKEN: indisponível com mensagem honesta e ZERO chamadas HTTP", async () => {
    let calls = 0;
    const fetchJson: ApifyFetchFn = async () => {
      calls += 1;
      return { status: 200, body: [] };
    };
    const r = await fetchApifyCandidates(SPEC, { env: {} as NodeJS.ProcessEnv, fetchJson });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("APIFY_TOKEN");
    expect(calls).toBe(0);
  });

  it("com token: uma chamada, actor do env quando o spec não traz, token fora de logs/razões", async () => {
    const urls: string[] = [];
    const fetchJson: ApifyFetchFn = async (url) => {
      urls.push(url);
      return { status: 200, body: ITEMS };
    };
    const env = { APIFY_TOKEN: "apify_secret_tok", APIFY_MAPS_ACTOR: "compass/crawler-google-places" } as unknown as NodeJS.ProcessEnv;
    const r = await fetchApifyCandidates(SPEC, { env, fetchJson });
    expect(r.ok).toBe(true);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items");
    if (r.ok) {
      expect(r.itemCount).toBe(ITEMS.length);
      expect(r.candidates).toHaveLength(1);
      expect(JSON.stringify(r)).not.toContain("apify_secret_tok");
    }
  });

  it("HTTP != 2xx vira razão honesta, nunca lote inventado", async () => {
    const fetchJson: ApifyFetchFn = async () => ({ status: 404, body: { error: "actor not found" } });
    const env = { APIFY_TOKEN: "t", APIFY_MAPS_ACTOR: "compass/crawler-google-places" } as unknown as NodeJS.ProcessEnv;
    const r = await fetchApifyCandidates(SPEC, { env, fetchJson });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("404");
  });

  it("runApifySource: orçamento estourado = recusa SEM chamada; ledger ilegível = recusa (fail-closed)", async () => {
    let calls = 0;
    const fetchJson: ApifyFetchFn = async () => {
      calls += 1;
      return { status: 200, body: ITEMS };
    };
    const env = { APIFY_TOKEN: "t", APIFY_MAPS_ACTOR: "compass/crawler-google-places", APIFY_MONTHLY_BUDGET_USD: "1" } as unknown as NodeJS.ProcessEnv;
    const over = await runApifySource({ ...SPEC, maxPlaces: 400 }, { env, fetchJson, ledger: okLedger(0), ref: "cold-x" });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toContain("orcamento");
    expect(calls).toBe(0);

    const broken: ApifyLedger = {
      async monthSpentCents() {
        throw new Error("db down");
      },
      async record() {},
    };
    const blind = await runApifySource(SPEC, { env, fetchJson, ledger: broken, ref: "cold-x" });
    expect(blind.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("runApifySource feliz: chama uma vez e registra o custo REAL (items retornados)", async () => {
    const fetchJson: ApifyFetchFn = async () => ({ status: 200, body: ITEMS });
    const env = { APIFY_TOKEN: "t", APIFY_MAPS_ACTOR: "compass/crawler-google-places" } as unknown as NodeJS.ProcessEnv;
    const ledger = okLedger(0);
    const r = await runApifySource(SPEC, { env, fetchJson, ledger, ref: "cold-2026-09-02" });
    expect(r.ok).toBe(true);
    expect(ledger.recorded).toHaveLength(1);
    expect(ledger.recorded[0]!.cents).toBe(Math.round(estimateApifyCostUsd(ITEMS.length, 5) * 100));
    expect(ledger.recorded[0]!.ref).toBe("cold-2026-09-02");
  });
});

// ---------------------------------------------------------------------------
// Mailbox + ledger adapters
// ---------------------------------------------------------------------------

describe("redisSpecMailbox / apiSpendLedger", () => {
  it("consome o spec no read (um dispatch = uma chamada) e recusa lixo", async () => {
    const store = new Map<string, string>([[APIFY_SPEC_REDIS_KEY, JSON.stringify(SPEC)]]);
    const redis = {
      async get(k: string) {
        return store.get(k) ?? null;
      },
      async del(k: string) {
        return store.delete(k) ? 1 : 0;
      },
    };
    const mailbox = redisSpecMailbox(redis);
    const first = await mailbox.take();
    expect(first?.track).toBe("geo");
    expect(await mailbox.take()).toBeNull(); // consumido

    store.set(APIFY_SPEC_REDIS_KEY, "{not json");
    expect(await mailbox.take()).toBeNull();
    store.set(APIFY_SPEC_REDIS_KEY, JSON.stringify({ track: "geo", queries: [], maxPlaces: 1 }));
    expect(await mailbox.take()).toBeNull(); // spec inválido nunca vira rodada
  });

  it("apiSpendLedger fala com api_spend (op prospect_apify) via exec", async () => {
    const queries: Array<{ q: string; params: unknown[] }> = [];
    const exec = async (q: string, params: unknown[]) => {
      queries.push({ q, params });
      return [{ cents: 250 }];
    };
    const ledger = apiSpendLedger(exec);
    expect(await ledger.monthSpentCents()).toBe(250);
    await ledger.record(123.4, "cold-2026-09-02");
    expect(queries[0]!.q).toContain("prospect_apify");
    expect(queries[0]!.q).toContain("date_trunc('month'");
    expect(queries[1]!.q).toContain("INSERT INTO api_spend");
    expect(queries[1]!.params[0]).toBe(123);
  });
});

// ---------------------------------------------------------------------------
// Dedup contra o CRM
// ---------------------------------------------------------------------------

describe("crmDedupSets", () => {
  it("indexa e-mails e domínios de negócio; freemail nunca deduplica por domínio", () => {
    const sets = crmDedupSets(["Info@AcmeRoofing.com", "joe@gmail.com", null, "torto-sem-arroba"]);
    expect(sets.emails.has("info@acmeroofing.com")).toBe(true);
    expect(sets.emails.has("joe@gmail.com")).toBe(true);
    expect(sets.domains.has("acmeroofing.com")).toBe(true);
    expect(sets.domains.has("gmail.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// O switch de fonte no buildProspectBatchBlock
// ---------------------------------------------------------------------------

const HOME_HTML = `<html><head><title>Acme Roofing</title></head><body>Acme Roofing serves Fort Worth. Call us. Short page.</body></html>`;

function fakeFetchText() {
  return async (url: string) => {
    if (url.includes("robots.txt")) return { status: 404, text: "" };
    if (url.includes("acmeroofing.com")) return { status: 200, text: HOME_HTML };
    return { status: 404, text: "" };
  };
}

describe("buildProspectBatchBlock — fonte apify", () => {
  const env = { APIFY_TOKEN: "t", APIFY_MAPS_ACTOR: "compass/crawler-google-places" } as unknown as NodeJS.ProcessEnv;

  function apifyDeps(spec: ApifyRunSpec | null, items: unknown[] = ITEMS) {
    let taken = false;
    return {
      mailbox: {
        async take() {
          if (taken) return null;
          taken = true;
          return spec;
        },
      },
      ledger: okLedger(0),
      fetchJson: (async () => ({ status: 200, body: items })) as ApifyFetchFn,
    };
  }

  it("spec presente: engines NÃO são chamados, trilha do spec vem do actor, outra trilha OFF, proxies no bloco", async () => {
    let engineCalls = 0;
    const block = await buildProspectBatchBlock({
      task: async () => {
        engineCalls += 1;
        return { ok: true, output: "", engineUsed: null, ms: null };
      },
      fetchText: fakeFetchText(),
      env,
      apify: apifyDeps(SPEC),
    });
    expect(engineCalls).toBe(0); // fonte real substitui a sugestão de LLM
    expect(block).toContain("=== PROSPECT: Acme Roofing ===");
    expect(block).toContain("FONTE: apify");
    expect(block).toContain("FONE: +1 817-555-0101");
    expect(block).toContain("RATING: 4.6 (128 reviews)");
    expect(block).toContain("trilha nao roda neste lote"); // aistack OFF
  });

  it("sem spec na mailbox: fonte engine, comportamento histórico (task chamado por trilha)", async () => {
    let engineCalls = 0;
    const block = await buildProspectBatchBlock({
      task: async () => {
        engineCalls += 1;
        return { ok: true, output: "Acme Roofing | https://acmeroofing.com", engineUsed: "claude", ms: 10 };
      },
      fetchText: fakeFetchText(),
      env,
      apify: apifyDeps(null),
    });
    expect(engineCalls).toBe(2); // geo + aistack
    expect(block).not.toContain("FONTE: apify");
  });

  it("dedup: candidato apify com domínio já no CRM é pulado e contado", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: "", engineUsed: null, ms: null }),
      fetchText: fakeFetchText(),
      env,
      apify: apifyDeps(SPEC),
      existingCrm: crmDedupSets(["contact@acmeroofing.com"]),
    });
    expect(block).not.toContain("=== PROSPECT: Acme Roofing ===");
    expect(block).toContain("ja esta no CRM (dominio) — dedup, pulado");
  });

  it("APIFY_TOKEN ausente: lote honesto dizendo a env que destrava, sem prospect inventado", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: "", engineUsed: null, ms: null }),
      fetchText: fakeFetchText(),
      env: {} as NodeJS.ProcessEnv,
      apify: apifyDeps(SPEC),
    });
    expect(block).toContain("APIFY_TOKEN");
    expect(block).not.toContain("=== PROSPECT:");
  });

  it("e-mail do actor entra como fallback quando o site não entrega nenhum", async () => {
    const block = await buildProspectBatchBlock({
      task: async () => ({ ok: true, output: "", engineUsed: null, ms: null }),
      fetchText: fakeFetchText(), // HOME_HTML não tem e-mail
      env,
      apify: apifyDeps(SPEC),
    });
    expect(block).toContain("EMAIL: info@acmeroofing.com");
  });
});

// ---------------------------------------------------------------------------
// Proxies de fechabilidade: bloco → CRM
// ---------------------------------------------------------------------------

describe("fechabilidade no round-trip bloco → CRM", () => {
  it("FONE/RATING/reviews viajam do bloco verificado até a nota do crm_contact", () => {
    const block = renderProspectBlock({
      campaign: "cold-2026-09-09",
      icpSource: "fonte apify (teste)",
      listed: 1,
      verified: [
        {
          name: "Acme Roofing",
          website: "https://acmeroofing.com",
          email: "info@acmeroofing.com",
          findings: ["homepage has no meta description"],
          source: "apify",
          phone: "+1 817-555-0101",
          rating: 4.6,
          reviewsCount: 128,
        },
      ],
      dropped: [],
      track: "geo",
    });
    const { contacts } = parseProspectsForCrm(block);
    expect(contacts).toHaveLength(1);
    const c = contacts[0]!;
    expect(c.phone).toBe("+1 817-555-0101");
    expect(c.rating).toBe(4.6);
    expect(c.reviewsCount).toBe(128);
    const note = crmNoteFor(c);
    expect(note).toContain("fone=+1 817-555-0101");
    expect(note).toContain("rating=4.6");
    expect(note).toContain("reviews=128");
  });

  it("prospect da fonte engine (sem proxies) mantém a nota histórica intacta", () => {
    const note = crmNoteFor({
      email: "a@b.com",
      name: "X",
      website: "https://x.com",
      finding: "f",
      track: "geo",
      campaign: "cold-2026-09-09",
    });
    expect(note).toBe("[prospect-batch] trilha=geo campanha=cold-2026-09-09 — f — https://x.com");
  });
});
