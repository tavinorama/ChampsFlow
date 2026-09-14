/**
 * PILOTO DA LEVA 2 — 100 leads, founder 11/09.
 *
 * O que está pregado aqui (o caminho que não existia: "prove ESTES ids"):
 *  - o contrato de entrada: sem e-mail de lead (recusa 400), sem id inventado,
 *    sem lote acima do teto de 80/dia por campanha;
 *  - a CONTA ANTES DO GASTO: 100 leads = US$3,00, e o orçamento é o teto real
 *    que para o job no meio (e diz que parou);
 *  - a idempotência: os mesmos ids não compram o probe duas vezes;
 *  - o job do worker: site lido de verdade → nicho+cidade → probe → prova ou
 *    MOTIVO. Nunca placeholder, nunca degradação calada (COLD_PROOF_ENABLED=0
 *    vira job FAILED nomeando a variável, não um lote vazio "ok").
 */

import { describe, it, expect } from "vitest";
import {
  parseLeva2ProbeRequest,
  leva2Estimate,
  leva2Fingerprint,
  leva2DiscardBucketOf,
  summarizeLeva2,
  newLeva2JobRecord,
  LEVA2_PILOT_CAMPAIGNS,
  LEVA2_MAX_NEW_LEADS_PER_CAMPAIGN_PER_DAY,
  type Leva2JobRecord,
} from "../../apps/api/src/lib/leva2-pilot";
import {
  processLeva2ProbeJob,
  runLeva2ProbeJob,
  type Leva2Store,
  type Leva2ProbeJobData,
  type Leva2ProbeInput,
} from "../../apps/worker/src/jobs/leva2-probe";
import type { ColdProofResult } from "../../packages/llm/src/cold-proof-probe";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function leadInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    smartlead_lead_id: 111,
    company: "Acme Roofing",
    website: "https://acmeroofing.com",
    domain: "acmeroofing.com",
    city: "Austin",
    state: "TX",
    segment: "roofing",
    bucket: "local",
    campaign_id_origem: 3741204,
    ...over,
  };
}

const ROOFING_HTML = [
  "<html><head><title>Acme Roofing</title>",
  '<script type="application/ld+json">',
  '{"@context":"https://schema.org","@type":"RoofingContractor","name":"Acme Roofing",',
  '"address":{"@type":"PostalAddress","addressLocality":"Austin","addressRegion":"TX"}}',
  "</script></head><body><h1>Acme Roofing</h1></body></html>",
].join("");

const NO_CITY_HTML = "<html><head><title>Zeta Holdings</title></head><body>We do things.</body></html>";

function okProof(over: Partial<ColdProofResult> = {}): ColdProofResult {
  return {
    ok: true,
    query: "Who do you recommend for a roofing contractor in Austin, TX?",
    engine: "ChatGPT",
    competitors: ["Lone Star Roofing", "Capital City Roofers"],
    selfCited: false,
    enginesLive: 4,
    costUsd: 0.03,
    reason: null,
    ...over,
  };
}

/** Store de memória — o Redis do piloto em 6 linhas. */
function memStore(): Leva2Store & { dump(): Record<string, string> } {
  const m: Record<string, string> = {};
  return {
    get: async (k) => m[k] ?? null,
    set: async (k, v) => {
      m[k] = v;
      return "OK";
    },
    dump: () => m,
  };
}

function jobData(leads: Array<Record<string, unknown>>, budgetUsd: number): Leva2ProbeJobData & Leva2ProbeInput {
  const parsed = parseLeva2ProbeRequest({ leads });
  expect(parsed.errors).toEqual([]);
  return { job_id: "job-piloto-1", budget_usd: budgetUsd, leads: parsed.leads };
}

// ---------------------------------------------------------------------------
// 1. O contrato de entrada
// ---------------------------------------------------------------------------

describe("piloto leva 2 — o contrato de entrada (nada de PII, nada de id inventado)", () => {
  it("aceita a lead do shortlist e normaliza site/dominio", () => {
    const r = parseLeva2ProbeRequest({ leads: [leadInput({ website: "", domain: "WWW.Acmeroofing.com" })] });
    expect(r.ok).toBe(true);
    expect(r.leads[0]!.domain).toBe("acmeroofing.com");
    expect(r.leads[0]!.website).toBe("https://acmeroofing.com");
    expect(r.leads[0]!.city).toBe("Austin");
    expect(r.leads[0]!.bucket).toBe("local");
  });

  it("RECUSA o lote inteiro se algum registro trouxer e-mail (os e-mails ficam no SmartLead)", () => {
    const r = parseLeva2ProbeRequest({ leads: [leadInput({ email: "alguem@acmeroofing.com" })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/PII proibido/i);
    expect(r.leads).toHaveLength(0);
  });

  it("recusa telefone e nome de pessoa pela mesma regra", () => {
    const r = parseLeva2ProbeRequest({
      leads: [leadInput({ phone: "+1 512 555 0100" }), leadInput({ smartlead_lead_id: 112, first_name: "John" })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it("recusa id nao numerico, bucket invalido, company vazio e lead sem site", () => {
    const r = parseLeva2ProbeRequest({
      leads: [
        leadInput({ smartlead_lead_id: "abc" }),
        leadInput({ smartlead_lead_id: 2, bucket: "geo" }),
        leadInput({ smartlead_lead_id: 3, company: "  " }),
        leadInput({ smartlead_lead_id: 4, website: "", domain: "" }),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" | ")).toMatch(/smartlead_lead_id ausente/);
    expect(r.errors.join(" | ")).toMatch(/bucket invalido/);
    expect(r.errors.join(" | ")).toMatch(/company vazio/);
    expect(r.errors.join(" | ")).toMatch(/sem website\/domain/);
  });

  it("id repetido no lote vira erro — provar duas vezes o mesmo negocio e gastar duas vezes", () => {
    const r = parseLeva2ProbeRequest({ leads: [leadInput(), leadInput()] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/duplicado/);
  });

  it("81 leads num bucket estouram o teto de 80/dia por campanha (leva2 §2)", () => {
    const leads = Array.from({ length: LEVA2_MAX_NEW_LEADS_PER_CAMPAIGN_PER_DAY + 1 }, (_v, i) =>
      leadInput({ smartlead_lead_id: 1000 + i })
    );
    const r = parseLeva2ProbeRequest({ leads });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/acima do teto de 80\/dia/);
  });

  it("o piloto real (60 local + 40 aistack) passa", () => {
    const leads = [
      ...Array.from({ length: 60 }, (_v, i) => leadInput({ smartlead_lead_id: 2000 + i, bucket: "local" })),
      ...Array.from({ length: 40 }, (_v, i) => leadInput({ smartlead_lead_id: 3000 + i, bucket: "aistack" })),
    ];
    const r = parseLeva2ProbeRequest({ leads });
    expect(r.ok).toBe(true);
    expect(r.leads).toHaveLength(100);
  });
});

// ---------------------------------------------------------------------------
// 2. A conta antes do gasto
// ---------------------------------------------------------------------------

describe("piloto leva 2 — o custo impresso antes de gastar", () => {
  it("100 leads = US$3,00, e os destinos sao as duas campanhas DRAFTED de #601", () => {
    const leads = [
      ...Array.from({ length: 60 }, (_v, i) => leadInput({ smartlead_lead_id: 2000 + i, bucket: "local" })),
      ...Array.from({ length: 40 }, (_v, i) => leadInput({ smartlead_lead_id: 3000 + i, bucket: "aistack" })),
    ];
    const parsed = parseLeva2ProbeRequest({ leads });
    const est = leva2Estimate(parsed.leads, null);
    expect(est.leads).toBe(100);
    expect(est.custo_estimado_usd).toBe(3);
    expect(est.orcamento_usd).toBe(3);
    expect(est.leads_cobertas_pelo_orcamento).toBe(100);
    expect(est.campanhas_destino["local"]).toEqual({
      slug: LEVA2_PILOT_CAMPAIGNS.local.slug,
      smartlead_id: 3939141,
      leads: 60,
    });
    expect(est.campanhas_destino["aistack"]!.smartlead_id).toBe(3939142);
  });

  it("orcamento menor que o lote diz quantas leads ele cobre (nao finge que cobre todas)", () => {
    const parsed = parseLeva2ProbeRequest({ leads: [leadInput(), leadInput({ smartlead_lead_id: 2 })] });
    const est = leva2Estimate(parsed.leads, 0.03);
    expect(est.custo_estimado_usd).toBe(0.06);
    expect(est.leads_cobertas_pelo_orcamento).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotência
// ---------------------------------------------------------------------------

describe("piloto leva 2 — os mesmos ids nao compram o probe duas vezes", () => {
  it("a impressao digital ignora a ordem das leads", () => {
    const a = parseLeva2ProbeRequest({ leads: [leadInput({ smartlead_lead_id: 1 }), leadInput({ smartlead_lead_id: 2 })] });
    const b = parseLeva2ProbeRequest({ leads: [leadInput({ smartlead_lead_id: 2 }), leadInput({ smartlead_lead_id: 1 })] });
    expect(leva2Fingerprint(a.leads, null)).toBe(leva2Fingerprint(b.leads, null));
  });

  it("idempotency_key diferente = lote novo de proposito (o founder assume o gasto)", () => {
    const a = parseLeva2ProbeRequest({ leads: [leadInput()] });
    expect(leva2Fingerprint(a.leads, null)).not.toBe(leva2Fingerprint(a.leads, "piloto-r2"));
  });

  it("uma lead a mais muda a impressao digital", () => {
    const a = parseLeva2ProbeRequest({ leads: [leadInput({ smartlead_lead_id: 1 })] });
    const b = parseLeva2ProbeRequest({ leads: [leadInput({ smartlead_lead_id: 1 }), leadInput({ smartlead_lead_id: 2 })] });
    expect(leva2Fingerprint(a.leads, null)).not.toBe(leva2Fingerprint(b.leads, null));
  });
});

// ---------------------------------------------------------------------------
// 4. O job do worker
// ---------------------------------------------------------------------------

describe("piloto leva 2 — o job: prova ou motivo, nunca placeholder", () => {
  it("lead com prova sai com as 5 variaveis de merge e o report_url da campanha certa", async () => {
    const store = memStore();
    const rec = await processLeva2ProbeJob(jobData([leadInput()], 3), {
      store,
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () => okProof(),
      env: {},
    });
    expect(rec.status).toBe("done");
    expect(rec.ok).toBe(1);
    expect(rec.probed).toBe(1);
    expect(rec.spent_usd).toBe(0.03);
    const r = rec.results[0]!;
    expect(r.ok).toBe(true);
    expect(r.vars).toEqual({
      ai_engine: "ChatGPT",
      competitor_1: "Lone Star Roofing",
      competitor_2: "Capital City Roofers",
      query: "Who do you recommend for a roofing contractor in Austin, TX?",
      report_url: expect.stringContaining("from=oz-local-2026-09-14"),
    });
    expect(r.vars!.report_url).toMatch(/^https:\/\/ozvor\.com\/test\?/);
    expect(r.vars!.report_url).toContain("d=acmeroofing.com");
    expect(r.campanha_destino).toBe("oz-local-2026-09-14");
    expect(r.campaign_id_destino).toBe(3939141);
    expect(rec.by_campaign["oz-local-2026-09-14"]).toBe(1);
    // O resultado fica legível no dossiê do piloto (Redis) — sem migração.
    expect(JSON.parse(store.dump()["leva2:probe:job:job-piloto-1"]!).ok).toBe(1);
  });

  it("a trilha aistack aponta para a outra campanha DRAFTED", async () => {
    const rec = await processLeva2ProbeJob(jobData([leadInput({ bucket: "aistack" })], 3), {
      store: memStore(),
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () => okProof(),
      env: {},
    });
    expect(rec.results[0]!.campaign_id_destino).toBe(3939142);
    expect(rec.results[0]!.vars!.report_url).toContain("from=aistack-2026-09-14");
  });

  it("site que nao responde sai COM MOTIVO e sem gastar um centavo", async () => {
    let probed = 0;
    const rec = await processLeva2ProbeJob(jobData([leadInput()], 3), {
      store: memStore(),
      sql: null,
      fetchText: async () => null,
      coldProof: async () => {
        probed += 1;
        return okProof();
      },
      env: {},
    });
    expect(probed).toBe(0);
    expect(rec.ok).toBe(0);
    expect(rec.spent_usd).toBe(0);
    expect(rec.by_reason["site_nao_respondeu"]).toBe(1);
    expect(rec.results[0]!.reason).toMatch(/nao respondeu/);
  });

  it("sem nicho/cidade no site nem no registro, o lead sai antes do motor", async () => {
    let probed = 0;
    const rec = await processLeva2ProbeJob(jobData([leadInput({ city: "", state: "", segment: "" })], 3), {
      store: memStore(),
      sql: null,
      fetchText: async () => ({ status: 200, text: NO_CITY_HTML }),
      coldProof: async () => {
        probed += 1;
        return okProof();
      },
      env: {},
    });
    expect(probed).toBe(0);
    expect(rec.by_reason["sem_nicho_ou_cidade"]).toBe(1);
  });

  it("cidade do registro do SmartLead entra so como ultimo recurso — e a FONTE viaja junto", async () => {
    const html = "<html><head><title>Nova Plumbing</title></head><body><h1>Emergency plumbing repair</h1></body></html>";
    const rec = await processLeva2ProbeJob(
      jobData([leadInput({ company: "Nova Plumbing", city: "Denver", state: "co", segment: "plumbing" })], 3),
      {
        store: memStore(),
        sql: null,
        fetchText: async () => ({ status: 200, text: html }),
        coldProof: async (input) => okProof({ query: `Who do you recommend for ${input.service} in ${input.city}?` }),
        env: {},
      }
    );
    const r = rec.results[0]!;
    expect(r.ok).toBe(true);
    expect(r.city).toBe("Denver, CO");
    expect(r.where_source).toMatch(/registro do SmartLead/);
    expect(r.vars!.query).toBe("Who do you recommend for a plumber in Denver, CO?");
  });

  it("negocio JA citado pela IA sai da leva com o motivo dele", async () => {
    const rec = await processLeva2ProbeJob(jobData([leadInput()], 3), {
      store: memStore(),
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () =>
        okProof({
          ok: false,
          engine: null,
          competitors: [],
          selfCited: true,
          reason: "a IA JA cita o proprio negocio — o gancho da leva 2 nao se aplica (lead fora da leva)",
        }),
      env: {},
    });
    expect(rec.ok).toBe(0);
    expect(rec.by_reason["ja_citado"]).toBe(1);
    // O motor foi chamado: o dinheiro saiu e o piloto diz isso.
    expect(rec.spent_usd).toBe(0.03);
    expect(rec.probed).toBe(1);
  });

  it("orcamento esgotado PARA o lote e declara que parou", async () => {
    const leads = [leadInput({ smartlead_lead_id: 1 }), leadInput({ smartlead_lead_id: 2 })];
    let probed = 0;
    const rec = await processLeva2ProbeJob(jobData(leads, 0.03), {
      store: memStore(),
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () => {
        probed += 1;
        return okProof();
      },
      env: {},
    });
    expect(probed).toBe(1);
    expect(rec.ok).toBe(1);
    expect(rec.budget_exhausted).toBe(true);
    expect(rec.by_reason["orcamento"]).toBe(1);
    expect(rec.spent_usd).toBeLessThanOrEqual(0.03);
  });

  it("COLD_PROOF_ENABLED=0 = job FAILED nomeando a variavel — nunca um lote vazio 'ok'", async () => {
    let probed = 0;
    const rec = await processLeva2ProbeJob(jobData([leadInput()], 3), {
      store: memStore(),
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () => {
        probed += 1;
        return okProof();
      },
      env: { COLD_PROOF_ENABLED: "0" },
    });
    expect(probed).toBe(0);
    expect(rec.status).toBe("failed");
    expect(rec.error).toMatch(/COLD_PROOF_ENABLED/);
    expect(rec.results).toHaveLength(0);
  });

  it("lote sumido do Redis vira FAILED com motivo — nunca um job 'ok' de zero leads", async () => {
    const rec = await runLeva2ProbeJob(
      { job_id: "job-sem-lote" },
      { store: memStore(), sql: null, fetchText: async () => ({ status: 200, text: ROOFING_HTML }), env: {} }
    );
    expect(rec.status).toBe("failed");
    expect(rec.error).toMatch(/leva2:probe:input:job-sem-lote/);
    expect(rec.probed).toBe(0);
  });

  it("runLeva2ProbeJob le o lote que a API deixou no Redis (payload da fila = so o id)", async () => {
    const store = memStore();
    const data = jobData([leadInput()], 3);
    await store.set("leva2:probe:input:job-piloto-1", JSON.stringify({ budget_usd: 3, leads: data.leads }), 60);
    const rec = await runLeva2ProbeJob(
      { job_id: "job-piloto-1" },
      {
        store,
        sql: null,
        fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
        coldProof: async () => okProof(),
        env: {},
      }
    );
    expect(rec.status).toBe("done");
    expect(rec.ok).toBe(1);
  });

  it("retomar um job ja comecado nao reprobra (nem repaga) o que ja tem resultado", async () => {
    const store = memStore();
    const data = jobData([leadInput({ smartlead_lead_id: 1 }), leadInput({ smartlead_lead_id: 2 })], 3);
    const partial: Leva2JobRecord = {
      ...newLeva2JobRecord({ jobId: data.job_id, leadsTotal: 2, budgetUsd: 3, now: new Date() }),
      probed: 1,
      results: [
        {
          smartlead_lead_id: "1",
          bucket: "local",
          company: "Acme Roofing",
          domain: "acmeroofing.com",
          campaign_id_origem: 3741204,
          campanha_destino: "oz-local-2026-09-14",
          campaign_id_destino: 3939141,
          ok: true,
          vars: {
            ai_engine: "ChatGPT",
            competitor_1: "A",
            competitor_2: "B",
            query: "q",
            report_url: "https://ozvor.com/test?from=oz-local-2026-09-14",
          },
          cost_usd: 0.03,
        },
      ],
    };
    await store.set("leva2:probe:job:job-piloto-1", JSON.stringify(partial), 60);
    let probed = 0;
    const rec = await processLeva2ProbeJob(data, {
      store,
      sql: null,
      fetchText: async () => ({ status: 200, text: ROOFING_HTML }),
      coldProof: async () => {
        probed += 1;
        return okProof();
      },
      env: {},
    });
    expect(probed).toBe(1);
    expect(rec.results).toHaveLength(2);
    expect(rec.ok).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Agregação do relatório
// ---------------------------------------------------------------------------

describe("piloto leva 2 — o relatorio conta por categoria, nao por frase", () => {
  it("mapeia os motivos do probe nas categorias do RESULTADO_OZVOR", () => {
    expect(leva2DiscardBucketOf("orcamento do piloto esgotado (US$3.00)")).toBe("orcamento");
    expect(leva2DiscardBucketOf("a IA JA cita o proprio negocio")).toBe("ja_citado");
    expect(leva2DiscardBucketOf("sem nicho/cidade (nada identificado)")).toBe("sem_nicho_ou_cidade");
    expect(leva2DiscardBucketOf("site respondeu 404")).toBe("site_nao_respondeu");
    expect(leva2DiscardBucketOf("nenhuma resposta nomeou 2+ concorrentes (sem prova = lead fora da leva)")).toBe("sem_prova");
    expect(leva2DiscardBucketOf("probe falhou: TypeError (lead fora da leva)")).toBe("probe_falhou");
  });

  it("os agregados sao recalculados a partir dos resultados (uma fonte so)", () => {
    const rec = summarizeLeva2({
      ...newLeva2JobRecord({ jobId: "x", leadsTotal: 3, budgetUsd: 3, now: new Date() }),
      results: [
        { smartlead_lead_id: "1", bucket: "local", company: "A", domain: "a.com", campaign_id_origem: null, campanha_destino: "oz-local-2026-09-14", campaign_id_destino: 3939141, ok: true, cost_usd: 0.03 },
        { smartlead_lead_id: "2", bucket: "aistack", company: "B", domain: "b.com", campaign_id_origem: null, campanha_destino: "aistack-2026-09-14", campaign_id_destino: 3939142, ok: true, cost_usd: 0.03 },
        { smartlead_lead_id: "3", bucket: "local", company: "C", domain: "c.com", campaign_id_origem: null, campanha_destino: "oz-local-2026-09-14", campaign_id_destino: 3939141, ok: false, reason: "site respondeu 500", reason_bucket: "site_nao_respondeu", cost_usd: 0 },
      ],
    });
    expect(rec.ok).toBe(2);
    expect(rec.discarded).toBe(1);
    expect(rec.spent_usd).toBe(0.06);
    expect(rec.by_campaign).toEqual({ "oz-local-2026-09-14": 1, "aistack-2026-09-14": 1 });
    expect(rec.by_reason).toEqual({ site_nao_respondeu: 1 });
  });
});
