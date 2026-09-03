/**
 * operator-prospect.ts — a segunda porta da fonte Apify do prospect-batch
 * (10.C.17 / 5.A.6, decisão 2 do founder de 02/09). A primeira é o
 * workflow_dispatch (.github/workflows/prospect-apify.yml), que chama ESTE
 * endpoint. NÃO existe terceira porta: sem cron, sem default, sem gatilho
 * automático — toda rodada Apify custa dinheiro e por isso só acontece com
 * comando explícito do founder ("pergunte sempre antes de rodar").
 *
 * POST /api/v1/operator/prospect-apify (escopo operator+business):
 *  - valida o spec JSON (trilha, queries, maxPlaces, actorId opcional) com o
 *    parser puro de prospecting.ts;
 *  - calcula a ESTIMATIVA de custo (places × APIFY_PRICE_PER_1K_USD/1000,
 *    default $5/1k) e lê o gasto do mês no ledger api_spend
 *    (op='prospect_apify' — tabela existente, sem migração nova);
 *  - sem confirm:true → responde SÓ a estimativa ("estimate_only") e NÃO
 *    enfileira nem chama nada — é a pergunta que o assistente faz ao founder;
 *  - com confirm:true → aplica decideApifyRun (o MESMO portão de orçamento do
 *    worker; estouro = 409, nada roda), deposita o spec na mailbox Redis
 *    (TTL 48h, NX — um spec pendente por vez) e inicia um run do grafo
 *    prospect-batch. O worker consome a mailbox, chama o actor UMA vez,
 *    registra o gasto real e segue o pipeline idêntico (verificação → probe →
 *    sequências → aprovação do founder → CRM).
 *
 * O token Apify NUNCA passa por aqui — ele vive só no worker (APIFY_TOKEN).
 */

import { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { requireOperatorKey } from "./api-keys";
import { startRun } from "../lib/agent-substrate";
import { PROSPECT_BATCH_GRAPH } from "../lib/agent-graphs";
import { tryGetSharedRedis } from "../shared-redis";
import {
  parseApifyRunSpec,
  apifySpecPlaces,
  apifyPricePer1kUsd,
  apifyMonthlyBudgetUsd,
  estimateApifyCostUsd,
  decideApifyRun,
} from "../lib/prospecting";

/** Same key the worker's mailbox reads (apps/worker/src/lib/apify-source.ts). */
export const APIFY_SPEC_REDIS_KEY = "prospect:apify:spec";
const APIFY_SPEC_TTL_SECONDS = 48 * 3600;

async function monthApifySpendCents(db: PostgresClient): Promise<number> {
  const res = await db.query<{ cents: number }>(
    `SELECT COALESCE(SUM(est_cost_cents), 0)::int AS cents
       FROM api_spend
      WHERE op = 'prospect_apify'
        AND created_at >= date_trunc('month', NOW())`,
    []
  );
  const cents = Number(res.rows[0]?.cents ?? 0);
  return Number.isFinite(cents) ? cents : 0;
}

export function registerOperatorProspectRoutes(app: Hono, db: PostgresClient): void {
  const key = requireOperatorKey(db, ["operator", "business"]);

  app.post("/api/v1/operator/prospect-apify", key, async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = parseApifyRunSpec(body);
    if (!parsed.ok || !parsed.spec) {
      return c.json({ error: "bad_request", message: parsed.errors.join(" | ") }, 400);
    }
    const spec = parsed.spec;

    const env = process.env;
    const places = apifySpecPlaces(spec);
    const pricePer1k = apifyPricePer1kUsd(env);
    const budgetUsd = apifyMonthlyBudgetUsd(env);
    const estimateUsd = estimateApifyCostUsd(places, pricePer1k);
    let monthSpentUsd: number;
    try {
      monthSpentUsd = (await monthApifySpendCents(db)) / 100;
    } catch {
      // Ledger ilegível = orçamento cego = nenhuma chamada paga (fail-closed).
      return c.json(
        { error: "ledger_unavailable", message: "api_spend ilegivel — sem visibilidade de orcamento, nada foi enfileirado." },
        503
      );
    }

    const estimate = {
      track: spec.track,
      queries: spec.queries,
      max_places_per_query: spec.maxPlaces,
      places_worst_case: places,
      price_per_1k_usd: pricePer1k,
      estimated_cost_usd: estimateUsd,
      month_spent_usd: Math.round(monthSpentUsd * 100) / 100,
      monthly_budget_usd: budgetUsd,
    };

    const confirmed = body?.["confirm"] === true || body?.["confirm"] === "yes";
    const decision = decideApifyRun({ confirmed, estimateUsd, monthSpentUsd, budgetUsd });
    if (!confirmed) {
      // A pergunta antes do gasto: estimativa apenas, NADA enfileirado/chamado.
      return c.json({ mode: "estimate_only", ran: false, reason: decision.reason, estimate });
    }
    if (!decision.allowed) {
      return c.json({ error: "budget_exceeded", ran: false, message: decision.reason, estimate }, 409);
    }

    const redis = tryGetSharedRedis();
    if (!redis) {
      return c.json(
        { error: "redis_unavailable", ran: false, message: "REDIS_URL ausente na api — o spec nao tem onde esperar o worker.", estimate },
        503
      );
    }
    // NX: um spec pendente por vez — um segundo dispatch antes de o worker
    // consumir o primeiro seria uma segunda cobrança invisível.
    const stored = await redis.set(APIFY_SPEC_REDIS_KEY, JSON.stringify(spec), {
      ex: APIFY_SPEC_TTL_SECONDS,
      nx: true,
    });
    if (stored !== "OK") {
      return c.json(
        {
          error: "spec_pending",
          ran: false,
          message: "ja existe um spec Apify aguardando o worker (mailbox ocupada) — aguarde o lote atual ou o TTL de 48h.",
          estimate,
        },
        409
      );
    }

    const runId = await startRun(db, {
      graph: PROSPECT_BATCH_GRAPH.slug,
      trigger: `operator-apify:${spec.track}:v${PROSPECT_BATCH_GRAPH.version}`,
      vpOwner: PROSPECT_BATCH_GRAPH.vpOwner,
    });
    return c.json(
      {
        mode: "confirmed",
        ran: true,
        run_id: runId,
        message:
          "spec depositado e run do prospect-batch iniciado — o worker consome a mailbox no proximo tick (~10 min), chama o actor UMA vez, registra o gasto real em api_spend e o lote segue o pipeline normal ate a SUA aprovacao no Telegram. Requer APIFY_TOKEN (e opcional APIFY_MAPS_ACTOR) no worker.",
        estimate,
        decision: decision.reason,
      },
      201
    );
  });
}
