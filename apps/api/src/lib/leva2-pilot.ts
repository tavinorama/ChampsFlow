/**
 * leva2-pilot.ts — o CONTRATO PURO do piloto da leva 2 (100 leads, 11/09).
 *
 * O QUE FALTAVA. O probe com prova (`packages/llm/src/cold-proof-probe.ts`)
 * só existia dentro do lote semanal `prospect-batch`, sobre candidatos NOVOS
 * que os motores acabavam de listar. O piloto é o contrário: 100 leads que já
 * existem no SmartLead, escolhidas por um workflow determinístico, e que
 * precisam da prova ANTES do e-mail 1. Não havia como dizer "prove estes 100
 * ids". Este módulo é a metade pura desse caminho — validação da lista,
 * estimativa de custo, impressão digital do lote (idempotência) e agregação
 * do resultado. Nada aqui faz I/O, então o teste cobre a regra inteira.
 *
 * A DIVISÃO HONESTA (ambiente verificado 11/09). O worker tem `DATABASE_URL`
 * e as chaves dos motores mas NÃO tem `SMARTLEAD_API_KEY`; o GitHub Actions
 * tem `SMARTLEAD_API_KEY` e `OZVOR_OPERATOR_KEY` mas não tem banco nem motor.
 * Por isso o caminho é partido em dois, e nenhum segredo novo é criado:
 *   - worker/API provam (motores + banco + ledger `api_spend`);
 *   - o workflow carrega as provadas na campanha de destino (SmartLead).
 *
 * PII. A lista do piloto NUNCA carrega e-mail, telefone ou nome de pessoa: os
 * e-mails ficam no SmartLead e o workflow os lê só na memória dele, na hora de
 * mover a lead. `parseLeva2ProbeRequest` RECUSA o lote inteiro se qualquer
 * registro trouxer um campo desses — a regra da casa vira erro 400, não
 * confiança.
 */

import { createHash } from "node:crypto";
import { COLD_PROOF_COST_PER_LEAD_USD } from "../../../../packages/llm/src/cold-proof-probe";

/** As duas campanhas de destino (#601), criadas em DRAFTED. Nada envia daqui. */
export const LEVA2_PILOT_CAMPAIGNS = {
  local: { slug: "oz-local-2026-09-14", smartleadId: 3939141 },
  aistack: { slug: "aistack-2026-09-14", smartleadId: 3939142 },
} as const;

export type Leva2Bucket = keyof typeof LEVA2_PILOT_CAMPAIGNS;

export const LEVA2_BUCKETS: Leva2Bucket[] = ["local", "aistack"];

/** Teto de leads NOVAS por campanha por dia (leva2-outbound-com-prova.md §2). */
export const LEVA2_MAX_NEW_LEADS_PER_CAMPAIGN_PER_DAY = 80;

/** Teto duro de um pedido: o piloto tem 100; 200 é margem, não convite. */
export const LEVA2_MAX_LEADS_PER_REQUEST = 200;

/** Quanto tempo o resultado do piloto fica legível (artefato do run: 14 dias). */
export const LEVA2_RESULT_TTL_SECONDS = 14 * 24 * 3600;

/** Chaves de Redis — o "dossiê do piloto" mora aqui (zero migração). */
export function leva2JobKey(jobId: string): string {
  return `leva2:probe:job:${jobId}`;
}
export function leva2FingerprintKey(fingerprint: string): string {
  return `leva2:probe:fp:${fingerprint}`;
}
/**
 * A LISTA do lote viaja aqui, não no payload da fila. O payload de fila da
 * casa é "id opaco + região" (GEO-SEC-3, com teste de regressão em
 * tests/security/queue-payload-pii.test.ts): 100 registros de negócio dentro
 * de um job do BullMQ furariam essa regra mesmo sem uma linha de PII.
 */
export function leva2InputKey(jobId: string): string {
  return `leva2:probe:input:${jobId}`;
}

/** Um lead do piloto — dado público de NEGÓCIO, sem uma linha de PII. */
export interface Leva2PilotLead {
  smartleadLeadId: string;
  company: string;
  website: string;
  domain: string;
  city: string | null;
  state: string | null;
  segment: string | null;
  bucket: Leva2Bucket;
  campaignIdOrigem: number | null;
}

/** Campos que identificam uma PESSOA — nunca entram neste caminho. */
const PII_KEY = /mail|phone|telefone|first_?name|last_?name|nome_pessoa|linkedin|contact/i;

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function hostOf(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface Leva2ParseResult {
  ok: boolean;
  leads: Leva2PilotLead[];
  errors: string[];
  /** Orçamento pedido em USD (ausente = o chamador usa a estimativa). */
  budgetUsd: number | null;
  confirmed: boolean;
  idempotencyKey: string | null;
}

/**
 * Valida o corpo do POST. Devolve leads normalizadas OU a lista de erros —
 * nunca um lote "quase certo": uma lead sem site é uma lead que não pode ser
 * provada, e provar 99 quando o founder autorizou 100 esconde um defeito.
 */
export function parseLeva2ProbeRequest(raw: unknown): Leva2ParseResult {
  const errors: string[] = [];
  const out: Leva2PilotLead[] = [];
  const body = (raw ?? {}) as Record<string, unknown>;
  const rawLeads = body["leads"];
  if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
    return { ok: false, leads: [], errors: ["leads: lista vazia ou ausente"], budgetUsd: null, confirmed: false, idempotencyKey: null };
  }
  if (rawLeads.length > LEVA2_MAX_LEADS_PER_REQUEST) {
    errors.push(`leads: ${rawLeads.length} acima do teto de ${LEVA2_MAX_LEADS_PER_REQUEST} por pedido`);
  }

  const seen = new Set<string>();
  rawLeads.slice(0, LEVA2_MAX_LEADS_PER_REQUEST).forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`leads[${i}]: nao e um objeto`);
      return;
    }
    const rec = entry as Record<string, unknown>;
    const piiKeys = Object.keys(rec).filter((k) => PII_KEY.test(k) && str(rec[k]) !== "");
    if (piiKeys.length > 0) {
      // Regra da casa: nenhum e-mail de lead sai do SmartLead. Recusa explícita.
      errors.push(`leads[${i}]: campo de PII proibido neste caminho (${piiKeys.join(", ")}) — o piloto so aceita dado de NEGOCIO`);
      return;
    }
    const id = str(rec["smartlead_lead_id"]);
    if (!/^\d{1,20}$/.test(id)) {
      errors.push(`leads[${i}]: smartlead_lead_id ausente ou nao numerico`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`leads[${i}]: smartlead_lead_id ${id} duplicado no lote`);
      return;
    }
    const bucketRaw = str(rec["bucket"]).toLowerCase();
    if (bucketRaw !== "local" && bucketRaw !== "aistack") {
      errors.push(`leads[${i}]: bucket invalido (${bucketRaw || "vazio"}) — use local ou aistack`);
      return;
    }
    const company = str(rec["company"]).slice(0, 120);
    if (!company) {
      errors.push(`leads[${i}]: company vazio — sem nome nao da para ler a resposta da IA`);
      return;
    }
    const websiteRaw = str(rec["website"]);
    const domain = str(rec["domain"]).toLowerCase().replace(/^www\./, "") || hostOf(websiteRaw);
    if (!domain) {
      errors.push(`leads[${i}]: sem website/domain — impossivel ler o site para inferir nicho e cidade`);
      return;
    }
    const website = /^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${domain}`;
    const campaignRaw = str(rec["campaign_id_origem"]);
    seen.add(id);
    out.push({
      smartleadLeadId: id,
      company,
      website,
      domain,
      city: str(rec["city"]) || null,
      state: str(rec["state"]).toUpperCase() || null,
      segment: str(rec["segment"]) || null,
      bucket: bucketRaw,
      campaignIdOrigem: /^\d{1,12}$/.test(campaignRaw) ? Number(campaignRaw) : null,
    });
  });

  // Teto de 80/dia por campanha — aqui é onde ele deixa de ser um parágrafo.
  const perBucket = countByBucket(out);
  for (const b of LEVA2_BUCKETS) {
    if ((perBucket[b] ?? 0) > LEVA2_MAX_NEW_LEADS_PER_CAMPAIGN_PER_DAY) {
      errors.push(
        `bucket ${b}: ${perBucket[b]} leads acima do teto de ${LEVA2_MAX_NEW_LEADS_PER_CAMPAIGN_PER_DAY}/dia por campanha (leva2 §2)`
      );
    }
  }

  const budgetRaw = body["budget_usd"];
  let budgetUsd: number | null = null;
  if (budgetRaw !== undefined && budgetRaw !== null && budgetRaw !== "") {
    const n = Number(budgetRaw);
    if (!Number.isFinite(n) || n < 0) errors.push("budget_usd: numero invalido");
    else budgetUsd = n;
  }
  const idem = str(body["idempotency_key"]).slice(0, 80) || null;
  const confirmed = body["confirm"] === true || body["confirm"] === "yes" || body["confirm"] === "true";

  return { ok: errors.length === 0 && out.length > 0, leads: out, errors, budgetUsd, confirmed, idempotencyKey: idem };
}

export function countByBucket(leads: Leva2PilotLead[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const l of leads) d[l.bucket] = (d[l.bucket] ?? 0) + 1;
  return d;
}

export interface Leva2Estimate {
  leads: number;
  por_bucket: Record<string, number>;
  custo_por_lead_usd: number;
  custo_estimado_usd: number;
  orcamento_usd: number;
  leads_cobertas_pelo_orcamento: number;
  campanhas_destino: Record<string, { slug: string; smartlead_id: number; leads: number }>;
}

/** A conta impressa ANTES de gastar (regra da casa: custo na cara). */
export function leva2Estimate(leads: Leva2PilotLead[], budgetUsd: number | null): Leva2Estimate {
  const n = leads.length;
  const cost = Math.round(n * COLD_PROOF_COST_PER_LEAD_USD * 100) / 100;
  const budget = budgetUsd === null ? cost : Math.round(budgetUsd * 100) / 100;
  const perBucket = countByBucket(leads);
  const destinos: Leva2Estimate["campanhas_destino"] = {};
  for (const b of LEVA2_BUCKETS) {
    destinos[b] = {
      slug: LEVA2_PILOT_CAMPAIGNS[b].slug,
      smartlead_id: LEVA2_PILOT_CAMPAIGNS[b].smartleadId,
      leads: perBucket[b] ?? 0,
    };
  }
  return {
    leads: n,
    por_bucket: perBucket,
    custo_por_lead_usd: COLD_PROOF_COST_PER_LEAD_USD,
    custo_estimado_usd: cost,
    orcamento_usd: budget,
    leads_cobertas_pelo_orcamento: Math.floor((budget + 1e-9) / COLD_PROOF_COST_PER_LEAD_USD),
    campanhas_destino: destinos,
  };
}

/**
 * Impressão digital do lote: os mesmos ids = o mesmo gasto. É o que impede
 * que um segundo dispatch do workflow (ou um retry) compre o probe duas vezes.
 * O founder contorna de propósito passando `idempotency_key`.
 */
export function leva2Fingerprint(leads: Leva2PilotLead[], idempotencyKey: string | null): string {
  const ids = leads.map((l) => l.smartleadLeadId).sort();
  return createHash("sha256").update(`${idempotencyKey ?? ""}|${ids.join(",")}`).digest("hex").slice(0, 32);
}

/** Motivos de descarte, agrupados — o relatório lê categoria, não frase solta. */
export type Leva2DiscardBucket =
  | "sem_prova"
  | "ja_citado"
  | "sem_nicho_ou_cidade"
  | "site_nao_respondeu"
  | "orcamento"
  | "probe_falhou"
  | "outro";

export function leva2DiscardBucketOf(reason: string): Leva2DiscardBucket {
  const r = (reason || "").toLowerCase();
  if (/orcamento|orçamento/.test(r)) return "orcamento";
  if (/ja cita|já cita|already cited/.test(r)) return "ja_citado";
  if (/nicho|cidade/.test(r)) return "sem_nicho_ou_cidade";
  if (/site (nao|não) respondeu|site respondeu \d|http|timeout|rede/.test(r)) return "site_nao_respondeu";
  if (/probe falhou/.test(r)) return "probe_falhou";
  if (/concorrente|sem prova|mock|nenhum motor/.test(r)) return "sem_prova";
  return "outro";
}

/** As 5 variáveis de merge do SmartLead (leva2-outbound-com-prova.md §3). */
export interface Leva2MergeVars {
  ai_engine: string;
  competitor_1: string;
  competitor_2: string;
  query: string;
  report_url: string;
}

export interface Leva2LeadResult {
  smartlead_lead_id: string;
  bucket: Leva2Bucket;
  company: string;
  domain: string;
  campaign_id_origem: number | null;
  campanha_destino: string;
  campaign_id_destino: number;
  ok: boolean;
  vars?: Leva2MergeVars;
  /** Motivo literal do descarte — vai para o log agregado por categoria. */
  reason?: string;
  reason_bucket?: Leva2DiscardBucket;
  /** De onde saíram nicho e cidade (nada aqui é palpite). */
  where_source?: string;
  service?: string | null;
  city?: string | null;
  /** Onde a prova foi gravada: 'crm_contact' ou 'resultado do piloto'. */
  dossie?: string;
  cost_usd: number;
}

export type Leva2JobStatus = "queued" | "running" | "done" | "failed";

export interface Leva2JobRecord {
  job_id: string;
  status: Leva2JobStatus;
  created_at: string;
  updated_at: string;
  leads_total: number;
  budget_usd: number;
  spent_usd: number;
  probed: number;
  ok: number;
  discarded: number;
  budget_exhausted: boolean;
  by_reason: Record<string, number>;
  by_campaign: Record<string, number>;
  /** Mensagem honesta quando o job não pôde rodar (env, banco, motores). */
  error: string | null;
  results: Leva2LeadResult[];
}

export function newLeva2JobRecord(input: {
  jobId: string;
  leadsTotal: number;
  budgetUsd: number;
  now: Date;
}): Leva2JobRecord {
  const iso = input.now.toISOString();
  return {
    job_id: input.jobId,
    status: "queued",
    created_at: iso,
    updated_at: iso,
    leads_total: input.leadsTotal,
    budget_usd: Math.round(input.budgetUsd * 100) / 100,
    spent_usd: 0,
    probed: 0,
    ok: 0,
    discarded: 0,
    budget_exhausted: false,
    by_reason: {},
    by_campaign: {},
    error: null,
    results: [],
  };
}

/** Recalcula os agregados a partir dos resultados — uma fonte só. */
export function summarizeLeva2(record: Leva2JobRecord): Leva2JobRecord {
  const byReason: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};
  let ok = 0;
  let spent = 0;
  for (const r of record.results) {
    spent += r.cost_usd;
    if (r.ok) {
      ok += 1;
      byCampaign[r.campanha_destino] = (byCampaign[r.campanha_destino] ?? 0) + 1;
    } else {
      const b = r.reason_bucket ?? "outro";
      byReason[b] = (byReason[b] ?? 0) + 1;
    }
  }
  return {
    ...record,
    ok,
    discarded: record.results.length - ok,
    spent_usd: Math.round(spent * 100) / 100,
    by_reason: byReason,
    by_campaign: byCampaign,
  };
}
