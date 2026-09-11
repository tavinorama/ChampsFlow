/**
 * leva2-probe.ts — o job do PILOTO DA LEVA 2 (100 leads, founder 11/09).
 *
 * O worker é o único lugar da casa que tem, ao mesmo tempo, `DATABASE_URL` e
 * as chaves dos motores. Por isso é AQUI que a prova é comprada; o SmartLead
 * (cuja chave só existe no GitHub Actions) nunca é tocado deste lado.
 *
 * Por lead, na ordem, e parando na primeira coisa que não for verdade:
 *   1. lê a HOMEPAGE do lead (HTTP real, sem palpite);
 *   2. infere NICHO + CIDADE do próprio site (`inferServiceAndCity`); sem os
 *      dois não existe "a pergunta certa" e o lead sai da leva. A cidade do
 *      registro do SmartLead entra só como último recurso, e a FONTE viaja no
 *      resultado — quem ler sabe de onde veio;
 *   3. checa o ORÇAMENTO antes de gastar: esgotou, para, marca
 *      `budget_exhausted` e escreve isso (nunca degrada calado);
 *   4. roda o probe (mesma via do /test, repeat=1) e aplica o parser
 *      determinístico. SEM PROVA, SEM LEVA: motores mudos, negócio já citado,
 *      menos de 2 concorrentes nomeados → descartado COM MOTIVO, nunca um
 *      placeholder;
 *   5. registra o gasto real em `api_spend` (op `cold_proof`, ref = job id) —
 *      uma linha por probe, inclusive pelos que não viraram prova (o motor foi
 *      chamado, o dinheiro saiu);
 *   6. grava a prova no dossiê: `crm_contact.note` quando existe contato com
 *      aquele domínio, e sempre no resultado do piloto (Redis, 14 dias) — a
 *      menor mudança possível, zero migração.
 *
 * O resultado por lead é `ok` + as 5 variáveis de merge, ou `descartado` +
 * motivo. Quem carrega a campanha é o workflow; quem inicia é o founder.
 */

import type postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";
import { recordSpend, execForPostgresJs } from "../../../../packages/llm/src/api-spend";
import {
  runColdProofProbe,
  proofMergeVars,
  coldProofEnabled,
  COLD_PROOF_COST_PER_LEAD_USD,
  type ColdProofResult,
} from "../../../../packages/llm/src/cold-proof-probe";
import { inferServiceAndCity } from "../../../api/src/lib/prospect-signal";
import { proofReportUrl } from "../../../api/src/lib/prospecting";
import {
  LEVA2_PILOT_CAMPAIGNS,
  LEVA2_RESULT_TTL_SECONDS,
  leva2DiscardBucketOf,
  leva2InputKey,
  leva2JobKey,
  summarizeLeva2,
  type Leva2JobRecord,
  type Leva2LeadResult,
  type Leva2PilotLead,
} from "../../../api/src/lib/leva2-pilot";
import { defaultFetchText, type FetchTextFn } from "../lib/prospect-probe";

/**
 * O payload da fila 'leva2-probe' é SÓ o id opaco (GEO-SEC-3: payload de fila
 * = ids + região). A lista do lote e o orçamento esperam no Redis, escritos
 * pela API em `leva2:probe:input:<job_id>`.
 */
export interface Leva2ProbeJobData {
  job_id: string;
}

/** O que a API deixou no Redis para este job. */
export interface Leva2ProbeInput {
  budget_usd: number;
  leads: Leva2PilotLead[];
}

/** Só o que este job usa do Redis — o teste passa um fake de 4 linhas. */
export interface Leva2Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<unknown>;
}

export interface Leva2ProbeDeps {
  store: Leva2Store;
  sql?: postgres.Sql | null;
  fetchText?: FetchTextFn;
  coldProof?(input: { name: string; service: string; city: string }): Promise<ColdProofResult>;
  now?(): Date;
  env?: NodeJS.ProcessEnv;
}

function cityFromLead(lead: Leva2PilotLead): string | null {
  const city = (lead.city ?? "").trim();
  if (!city) return null;
  const state = (lead.state ?? "").trim().toUpperCase();
  return state.length === 2 ? `${city}, ${state}` : city;
}

/** Escreve a prova na nota do CRM quando aquele domínio já é um contato. */
async function writeCrmNote(
  sql: postgres.Sql,
  input: { domain: string; company: string; campaign: string; proof: { engine: string; query: string; competitors: string[] } }
): Promise<boolean> {
  const line =
    `[leva2-piloto] campanha=${input.campaign} nome=${input.company.replace(/[\n·]/g, " ")} — ` +
    `PROVA ${input.proof.engine} p/ "${input.proof.query}": ${input.proof.competitors.slice(0, 2).join(", ")}`;
  const rows = (await sql.unsafe(
    `UPDATE crm_contact
        SET note = CASE WHEN note IS NULL OR note = '' THEN $1 ELSE note || E'\n' || $1 END,
            updated_at = NOW()
      WHERE lower(split_part(email, '@', 2)) = $2
      RETURNING email`,
    [line, input.domain]
  )) as unknown as Array<{ email: string }>;
  return Array.isArray(rows) && rows.length > 0;
}

/** Lê o lote que a API deixou no Redis. Ausente = job honestamente falhado. */
export async function loadLeva2Input(store: Leva2Store, jobId: string): Promise<Leva2ProbeInput | null> {
  const raw = await store.get(leva2InputKey(jobId)).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Leva2ProbeInput;
    return Array.isArray(parsed.leads) ? parsed : null;
  } catch {
    return null;
  }
}

export async function processLeva2ProbeJob(
  data: Leva2ProbeJobData & Leva2ProbeInput,
  deps: Leva2ProbeDeps
): Promise<Leva2JobRecord> {
  const now = deps.now ?? ((): Date => new Date());
  const env = deps.env ?? process.env;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const probe = deps.coldProof ?? ((input: { name: string; service: string; city: string }) => runColdProofProbe(input));
  const key = leva2JobKey(data.job_id);

  const stored = await deps.store.get(key).catch(() => null);
  let record: Leva2JobRecord = stored
    ? (JSON.parse(stored) as Leva2JobRecord)
    : {
        job_id: data.job_id,
        status: "queued",
        created_at: now().toISOString(),
        updated_at: now().toISOString(),
        leads_total: data.leads.length,
        budget_usd: data.budget_usd,
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

  const save = async (): Promise<void> => {
    record.updated_at = now().toISOString();
    record = summarizeLeva2(record);
    await deps.store.set(key, JSON.stringify(record), LEVA2_RESULT_TTL_SECONDS).catch((err: Error) => {
      logger.error("leva2_probe_store_failed", { job_id: data.job_id, message: err.message.slice(0, 160) });
    });
  };

  // A env só existe para DESLIGAR. Se alguém desligou, o job diz qual é e
  // não gasta um centavo — "não consegui" nunca sai daqui como "ok".
  if (!coldProofEnabled(env)) {
    record.status = "failed";
    record.error =
      "COLD_PROOF_ENABLED=0 no worker — a leva 2 esta desligada e NENHUM probe foi rodado. " +
      "Para ligar: remova a variavel (o default e LIGADO) ou ponha COLD_PROOF_ENABLED=1 no servico worker.";
    await save();
    logger.warn("leva2_probe_disabled", { job_id: data.job_id });
    return record;
  }

  record.status = "running";
  await save();
  logger.info("leva2_probe_started", {
    job_id: data.job_id,
    leads: data.leads.length,
    budget_usd: data.budget_usd,
  });

  const spendExec = deps.sql ? execForPostgresJs(deps.sql) : null;
  const done = new Set(record.results.map((r) => r.smartlead_lead_id));

  for (const lead of data.leads) {
    if (done.has(lead.smartleadLeadId)) continue;
    const destino = LEVA2_PILOT_CAMPAIGNS[lead.bucket];
    const base: Leva2LeadResult = {
      smartlead_lead_id: lead.smartleadLeadId,
      bucket: lead.bucket,
      company: lead.company,
      domain: lead.domain,
      campaign_id_origem: lead.campaignIdOrigem,
      campanha_destino: destino.slug,
      campaign_id_destino: destino.smartleadId,
      ok: false,
      cost_usd: 0,
    };

    const push = (extra: Partial<Leva2LeadResult>): void => {
      const r = { ...base, ...extra };
      if (!r.ok && r.reason) r.reason_bucket = leva2DiscardBucketOf(r.reason);
      record.results.push(r);
    };

    // 1) o site do lead, de verdade.
    const home = await fetchText(lead.website);
    if (!home || home.status !== 200 || !home.text.trim()) {
      push({ reason: home ? `site respondeu ${home.status}` : "site nao respondeu (timeout/erro de rede)" });
      await save();
      continue;
    }

    // 2) a pergunta certa — nicho e cidade do PRÓPRIO site.
    const where = inferServiceAndCity({ name: lead.company, category: lead.segment, html: home.text });
    let city = where.city;
    let whereSource = where.source;
    if (!city) {
      const fallback = cityFromLead(lead);
      if (fallback) {
        city = fallback;
        whereSource = `${where.source} · cidade: registro do SmartLead (shortlist), nao o site`;
      }
    }
    if (!where.service || !city) {
      push({
        reason: `sem nicho/cidade (${whereSource}) — impossivel fazer a pergunta certa (lead fora da leva 2)`,
        where_source: whereSource,
        service: where.service,
        city,
      });
      await save();
      continue;
    }

    // 3) orçamento ANTES de chamar motor.
    if (record.spent_usd + COLD_PROOF_COST_PER_LEAD_USD > record.budget_usd + 1e-9) {
      record.budget_exhausted = true;
      push({
        reason: `orcamento do piloto esgotado (US$${record.budget_usd.toFixed(2)}) — lead nao foi probada`,
        where_source: whereSource,
        service: where.service,
        city,
      });
      await save();
      continue;
    }

    // 4) o probe.
    const res = await probe({ name: lead.company, service: where.service, city });
    record.probed += 1;
    record.spent_usd = Math.round((record.spent_usd + res.costUsd) * 100) / 100;

    // 5) o gasto no ledger — inclusive quando não virou prova (o motor rodou).
    if (spendExec && res.costUsd > 0) {
      await recordSpend(spendExec, {
        op: "cold_proof",
        estCents: Math.round(res.costUsd * 100),
        estSource: "rate",
        ref: `leva2:${data.job_id}`,
        ...(res.engine ? { engine: res.engine } : {}),
      }).catch((err: Error) => {
        logger.error("leva2_probe_spend_record_failed", { job_id: data.job_id, message: err.message.slice(0, 160) });
      });
    }

    const vars = proofMergeVars(res);
    if (!res.ok || !vars) {
      push({
        reason: res.reason ?? "probe sem prova utilizavel (lead fora da leva 2)",
        where_source: whereSource,
        service: where.service,
        city,
        cost_usd: res.costUsd,
      });
      await save();
      continue;
    }

    // 6) o dossiê: nota do CRM quando o contato existe; sempre no resultado.
    const reportUrl = proofReportUrl({
      campaign: destino.slug,
      company: lead.company,
      competitor: res.competitors[0] ?? null,
      website: lead.website,
      ...(lead.segment ? { category: lead.segment } : {}),
    });
    let dossie = "resultado do piloto (leva2:probe:job)";
    if (deps.sql) {
      try {
        const wrote = await writeCrmNote(deps.sql, {
          domain: lead.domain,
          company: lead.company,
          campaign: destino.slug,
          proof: { engine: vars.ai_engine, query: vars.query, competitors: res.competitors },
        });
        if (wrote) dossie = "crm_contact.note + resultado do piloto";
      } catch (err) {
        // Falha de escrita no CRM não some: ela vira parte do resultado.
        dossie = `resultado do piloto (crm_contact falhou: ${(err as Error).message.slice(0, 80)})`;
        logger.warn("leva2_probe_crm_note_failed", { job_id: data.job_id, message: (err as Error).message.slice(0, 160) });
      }
    }

    push({
      ok: true,
      vars: { ...vars, report_url: reportUrl },
      where_source: whereSource,
      service: where.service,
      city,
      dossie,
      cost_usd: res.costUsd,
    });
    await save();
  }

  record.status = "done";
  await save();
  logger.info("leva2_probe_finished", {
    job_id: data.job_id,
    probed: record.probed,
    ok: record.ok,
    discarded: record.discarded,
    spent_usd: record.spent_usd,
    budget_exhausted: record.budget_exhausted,
  });
  return record;
}

/**
 * O que a fila chama: lê o lote no Redis e roda. Lote sumido (TTL, Redis
 * trocado) NÃO vira job "ok" com zero leads — vira FAILED com o motivo.
 */
export async function runLeva2ProbeJob(data: Leva2ProbeJobData, deps: Leva2ProbeDeps): Promise<Leva2JobRecord> {
  const now = deps.now ?? ((): Date => new Date());
  const input = await loadLeva2Input(deps.store, data.job_id);
  if (!input) {
    const failed: Leva2JobRecord = {
      job_id: data.job_id,
      status: "failed",
      created_at: now().toISOString(),
      updated_at: now().toISOString(),
      leads_total: 0,
      budget_usd: 0,
      spent_usd: 0,
      probed: 0,
      ok: 0,
      discarded: 0,
      budget_exhausted: false,
      by_reason: {},
      by_campaign: {},
      error:
        `lote ausente em ${leva2InputKey(data.job_id)} (TTL de 14 dias vencido ou Redis trocado) — ` +
        "NENHUM probe foi rodado. Redispare o workflow com um idempotency_key novo.",
      results: [],
    };
    await deps.store.set(leva2JobKey(data.job_id), JSON.stringify(failed), LEVA2_RESULT_TTL_SECONDS).catch(() => undefined);
    logger.error("leva2_probe_input_missing", { job_id: data.job_id });
    return failed;
  }
  return processLeva2ProbeJob({ job_id: data.job_id, ...input }, deps);
}

/** Adaptador ioredis → Leva2Store (o worker já tem essa conexão de pé). */
export function leva2StoreFromIoRedis(client: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
}): Leva2Store {
  return {
    get: (k) => client.get(k),
    set: (k, v, ttl) => client.set(k, v, "EX", ttl),
  };
}
