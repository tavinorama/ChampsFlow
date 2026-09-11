/**
 * operator-leva2.ts — a porta do PILOTO DA LEVA 2 (100 leads, founder 11/09).
 *
 * O QUE ESTE ARQUIVO DESTRAVA. O probe com prova só existia dentro do grafo
 * semanal `prospect-batch`, sobre candidatos que os motores acabavam de
 * listar. O piloto precisa do contrário: "prove ESTES 100 ids que já estão no
 * SmartLead". Este endpoint é esse caminho, no MESMO padrão do
 * `/prospect-apify` (#571): estimativa primeiro, gasto só com `confirm`.
 *
 *   POST /api/v1/operator/leva2-probe      (escopo operator+business)
 *     body: { leads: [{smartlead_lead_id, company, website, domain, city,
 *                      state, segment, bucket, campaign_id_origem}],
 *             budget_usd?, idempotency_key?, confirm? }
 *     - sem confirm:true → SÓ a estimativa (n × US$0,03). Nada é enfileirado,
 *       nenhum motor é chamado, nenhum centavo sai. É a pergunta que a máquina
 *       faz ao founder ANTES de gastar.
 *     - com confirm:true → enfileira UM job do worker (fila 'leva2-probe',
 *       attempts:1 — retry é gasto duplicado) e devolve o job_id.
 *
 *   GET /api/v1/operator/leva2-probe/:jobId
 *     - por lead: `ok` + as 5 variáveis de merge (ai_engine, competitor_1,
 *       competitor_2, query, report_url) OU `descartado` + motivo literal.
 *
 * POR QUE REDIS E NÃO UMA TABELA. O resultado do piloto é um dossiê de 100
 * linhas com validade de dias, e a menor mudança possível é a que não pede
 * migração nenhuma (a mesma decisão do `crm_contact.note` na leva 2). O job
 * fica em `leva2:probe:job:<id>` por 14 dias — o mesmo prazo do artefato do
 * shortlist. Quando o lead JÁ tem contato no CRM, a prova também é escrita no
 * `crm_contact.note` (o dossiê de verdade); isso o worker faz, não este
 * arquivo.
 *
 * O QUE ESTE ENDPOINT NUNCA FAZ: enviar e-mail, iniciar campanha, tocar no
 * SmartLead (ele nem tem a chave) e aceitar e-mail de lead — um lote com
 * campo de PII é recusado com 400, por regra e não por confiança.
 */

import { Hono } from "hono";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { requireOperatorKey } from "./api-keys";
import { tryGetSharedRedis } from "../shared-redis";
import { logger } from "../../../../packages/shared/src/logger";
import { coldProofEnabled } from "../../../../packages/llm/src/cold-proof-probe";
import {
  parseLeva2ProbeRequest,
  leva2Estimate,
  leva2Fingerprint,
  leva2JobKey,
  leva2FingerprintKey,
  leva2InputKey,
  newLeva2JobRecord,
  LEVA2_RESULT_TTL_SECONDS,
  type Leva2JobRecord,
} from "../lib/leva2-pilot";

export const LEVA2_PROBE_QUEUE = "leva2-probe";

let _queue: Queue | null = null;
let _queueRedis: IORedis | null = null;

/** Mesma convenção de fila do landing-generate/audits: ioredis + BullMQ. */
function getLeva2Queue(): Queue | null {
  if (_queue) return _queue;
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) return null;
  _queueRedis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  _queueRedis.on("error", (err: Error) => {
    logger.error("leva2_probe_queue_redis_error", { message: err.message });
  });
  _queue = new Queue(LEVA2_PROBE_QUEUE, {
    connection: _queueRedis,
    defaultJobOptions: {
      // attempts: 1 — um retry automático compraria o probe uma segunda vez.
      // Se o job falhar, o founder redispara com idempotency_key novo, sabendo.
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}

export function registerOperatorLeva2Routes(app: Hono, db: PostgresClient): void {
  const key = requireOperatorKey(db, ["operator", "business"]);

  // -------------------------------------------------------------------------
  // POST /api/v1/operator/leva2-probe
  // -------------------------------------------------------------------------
  app.post("/api/v1/operator/leva2-probe", key, async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = parseLeva2ProbeRequest(body);
    if (!parsed.ok) {
      return c.json({ error: "bad_request", ran: false, errors: parsed.errors.slice(0, 20) }, 400);
    }
    const leads = parsed.leads;
    const estimate = leva2Estimate(leads, parsed.budgetUsd);

    if (!parsed.confirmed) {
      // A pergunta antes do gasto. NADA foi enfileirado, nenhum motor chamado.
      return c.json({
        mode: "estimate_only",
        ran: false,
        reason: "sem confirm:true — nenhuma chamada paga foi feita",
        estimate,
      });
    }

    // A env só existe para DESLIGAR a leva 2. Se alguém a desligou, o endpoint
    // NOMEIA a variável e o serviço — nunca silêncio, nunca meio-lote.
    if (!coldProofEnabled(process.env)) {
      return c.json(
        {
          error: "cold_proof_disabled",
          ran: false,
          code: "COLD_PROOF_DISABLED",
          message:
            "COLD_PROOF_ENABLED=0 na API — a leva 2 esta desligada e nenhum probe foi enfileirado. " +
            "Para ligar: remova COLD_PROOF_ENABLED (o default e LIGADO) ou ponha COLD_PROOF_ENABLED=1 na API e no worker.",
          estimate,
        },
        503
      );
    }

    const redis = tryGetSharedRedis();
    if (!redis) {
      return c.json(
        {
          error: "redis_unavailable",
          ran: false,
          code: "REDIS_URL_AUSENTE",
          message: "REDIS_URL ausente na api — o resultado do piloto nao tem onde ser escrito e o job nao foi enfileirado.",
          estimate,
        },
        503
      );
    }
    const queue = getLeva2Queue();
    if (!queue) {
      return c.json(
        {
          error: "queue_unavailable",
          ran: false,
          code: "REDIS_URL_AUSENTE",
          message: "REDIS_URL ausente na api — sem fila, o worker nunca receberia este lote. Nada foi gasto.",
          estimate,
        },
        503
      );
    }

    // Impressão digital: os mesmos ids não são probados (nem pagos) duas vezes.
    const fingerprint = leva2Fingerprint(leads, parsed.idempotencyKey);
    const jobId = randomUUID();
    const fpKey = leva2FingerprintKey(fingerprint);
    let claimed: string | null = null;
    try {
      claimed = await redis.set(fpKey, jobId, { ex: LEVA2_RESULT_TTL_SECONDS, nx: true });
    } catch (err) {
      return c.json(
        { error: "redis_unavailable", ran: false, message: `redis indisponivel: ${(err as Error).message.slice(0, 120)}`, estimate },
        503
      );
    }
    if (claimed !== "OK") {
      const existing = await redis.get<string>(fpKey).catch(() => null);
      return c.json(
        {
          error: "already_probed",
          ran: false,
          code: "LOTE_JA_PROBADO",
          job_id: existing ?? null,
          message:
            "este conjunto de leads ja foi probado (idempotencia de 14 dias) — leia o resultado em " +
            `GET /api/v1/operator/leva2-probe/${existing ?? "<job_id>"}. Para probar de novo DE PROPOSITO (gasto novo), ` +
            "reenvie com um idempotency_key diferente.",
          estimate,
        },
        409
      );
    }

    const record = newLeva2JobRecord({
      jobId,
      leadsTotal: leads.length,
      budgetUsd: estimate.orcamento_usd,
      now: new Date(),
    });
    try {
      await redis.set(leva2JobKey(jobId), JSON.stringify(record), { ex: LEVA2_RESULT_TTL_SECONDS });
      // A lista vai para o Redis; o payload da fila leva só o id opaco
      // (GEO-SEC-3 — "ids + região", com teste de regressão).
      await redis.set(
        leva2InputKey(jobId),
        JSON.stringify({ budget_usd: estimate.orcamento_usd, leads }),
        { ex: LEVA2_RESULT_TTL_SECONDS }
      );
      await queue.add("leva2-probe", { job_id: jobId }, { jobId });
    } catch (err) {
      // Falhou antes de gastar: solta a impressão digital, para o founder poder
      // repetir o comando sem inventar idempotency_key.
      await redis.del(fpKey).catch(() => undefined);
      logger.error("leva2_probe_enqueue_failed", { message: (err as Error).message.slice(0, 200) });
      return c.json(
        { error: "enqueue_failed", ran: false, message: "nao consegui enfileirar o job — nada foi gasto.", estimate },
        503
      );
    }

    const apiKey = c.get("apiKey");
    logger.info("leva2_probe_enqueued", {
      key_id: apiKey.id,
      job_id: jobId,
      leads: leads.length,
      budget_usd: estimate.orcamento_usd,
    });
    return c.json(
      {
        mode: "confirmed",
        ran: true,
        job_id: jobId,
        estimate,
        poll: `GET /api/v1/operator/leva2-probe/${jobId}`,
        message:
          "lote enfileirado no worker (fila leva2-probe, sem retry automatico). O worker le o site de cada lead, " +
          "infere nicho+cidade, roda o probe (repeat=1), respeita o orcamento, registra o gasto em api_spend (op cold_proof) " +
          "e escreve a prova no dossie. NADA e enviado: quem carrega a campanha e o workflow, e quem inicia e o founder.",
      },
      201
    );
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operator/leva2-probe/:jobId
  // -------------------------------------------------------------------------
  app.get("/api/v1/operator/leva2-probe/:jobId", key, async (c) => {
    const jobId = c.req.param("jobId") ?? "";
    if (!/^[0-9a-f-]{8,40}$/i.test(jobId)) {
      return c.json({ error: "bad_request", code: "INVALID_JOB_ID" }, 400);
    }
    const redis = tryGetSharedRedis();
    if (!redis) {
      return c.json(
        { error: "redis_unavailable", code: "REDIS_URL_AUSENTE", message: "REDIS_URL ausente na api — o resultado do piloto vive no Redis." },
        503
      );
    }
    let raw: string | null = null;
    try {
      raw = await redis.get<string>(leva2JobKey(jobId));
    } catch (err) {
      return c.json({ error: "redis_unavailable", message: (err as Error).message.slice(0, 120) }, 503);
    }
    if (!raw) {
      return c.json(
        {
          error: "not_found",
          code: "JOB_NAO_ENCONTRADO",
          message: "job inexistente ou expirado (o resultado do piloto vive 14 dias, o mesmo prazo do artefato do shortlist).",
        },
        404
      );
    }
    const record = (typeof raw === "string" ? JSON.parse(raw) : raw) as Leva2JobRecord;
    const apiKey = c.get("apiKey");
    logger.info("leva2_probe_read", {
      key_id: apiKey.id,
      job_id: jobId,
      status: record.status,
      probed: record.probed,
      ok: record.ok,
    });
    return c.json(record);
  });
}
