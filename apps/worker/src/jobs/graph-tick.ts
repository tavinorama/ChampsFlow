/**
 * graph-tick.ts — the worker wiring for the graph runner (#164 body).
 *
 * Every 10 minutes a repeatable BullMQ job calls runGraphTick, which finds
 * in-flight ops.agent_run rows whose graph is in GRAPH_REGISTRY and advances
 * each one via advanceRun (apps/api/src/lib/graph-runner.ts). The runner core
 * is pure orchestration over ports; THIS file is where the ports become real:
 *
 *  - substrate → the worker's privileged sql client (ops.* is GRANT-gated,
 *    not RLS-gated — company operations, no tenant data);
 *  - hermes    → HTTPS to the VPS task server (HERMES_TASK_URL/TOKEN);
 *  - artifacts → Redis, TTL 7 days (text in transit lives here; the
 *    substrate keeps hashes — the two never swap roles);
 *  - telegram  → same env contract as the VPS jobs.
 *
 * Degradation is LOUD (house rule): if HERMES_TASK_TOKEN is absent the tick
 * does not silently no-op forever — it logs an error every tick and, once
 * per boot, says so on Telegram. An orchestrator that cannot reach its
 * executor is an incident, not a default.
 */

import type postgres from "postgres";
import type Redis from "ioredis";
import { logger } from "../../../../packages/shared/src/logger";
import { signalEngine, listOf, signalsBlock, type SeOpportunity } from "../../../../packages/llm/src/signal-engine";
import { callWithFallback, parseEngineChain, errorHead } from "../lib/hermes-fallback";
import { PLAN_PRICE_USD } from "../../../../packages/shared/src/plan-limits";
import { createHash } from "node:crypto";
import {
  advanceRun,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type RunRow,
  type StepRow,
  type TelegramButton,
} from "../../../api/src/lib/graph-runner";

const HERMES_URL = process.env["HERMES_TASK_URL"] ?? "https://hermes.ozvor.com";
const HERMES_TOKEN = process.env["HERMES_TASK_TOKEN"] ?? "";
const TG_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TG_CHAT = process.env["TELEGRAM_CHAT_ID"] ?? "";
const ARTIFACT_TTL_SECONDS = 7 * 24 * 3600;
// Signal Engine (docs/signal-engine-integration.md): the founder's other
// product, read as a service. Both unset → content cells run on their own
// memory, exactly as before. Cached 6h: its queues are daily.
const SE_URL = process.env["SIGNAL_ENGINE_URL"] ?? "";
const SE_KEY = process.env["SIGNAL_ENGINE_API_KEY"] ?? "";
const SE_COUNTRY = process.env["SIGNAL_ENGINE_COUNTRY"] ?? "";
const SE_CACHE_SECONDS = 6 * 3600;
const HERMES_TIMEOUT_MS = 240_000;
// Engine chain for Hermes /task (21–22/08 incident: pinned "claude" + one call
// = 26h of total failure when the Claude OAuth session on the VPS expired,
// fallbacks=0). House rule: kimi replaces claude AND codex. Override with
// HERMES_ENGINES="claude,codex,kimi".
const HERMES_ENGINES = parseEngineChain(process.env["HERMES_ENGINES"]);
// Alarm once per window when the PRIMARY engine is down (never per step).
const HERMES_PRIMARY_DOWN_KEY = "hermes:primary_down_alarm";
const HERMES_ALL_DOWN_KEY = "hermes:all_down_alarm";
const HERMES_ALARM_WINDOW_S = 6 * 3600;
/**
 * Cap on EXPENSIVE advances per tick (runs with an executable next step — an
 * LLM call each). Parked runs (waiting frontier) never count against this:
 * the 18-20/08 production freeze happened because 5 permanently-parked runs
 * (4 approvals with no timeout + 1 harvest waiting on a mute metric) were the
 * 5 OLDEST 'running' rows and ate every slot of every tick for three days —
 * the whole org, watchdog included, starved behind them.
 */
const MAX_RUNS_PER_TICK = 5;
/**
 * Parked runs (frontier step 'waiting') are re-checked every tick OUTSIDE the
 * expensive slots — wait-node timers, harvest metric polls and approval
 * timeouts are cheap checks in advanceRun's section 2. Generous cap so a
 * pathological pile-up still cannot make the tick unbounded.
 */
const MAX_PARKED_RECHECKS_PER_TICK = 50;
/** A 'running' run with ZERO steps after this long was never picked up — starved. */
export const STARVED_RUN_HOURS = 24;
export const STARVED_SUMMARY = "starved: scheduler starvation (fix PR)";
/**
 * Orphan reconciliation (22/08 sweep): a 'running' run whose graph is NOT in
 * GRAPH_REGISTRY is invisible to every tick query (they all filter
 * graph = ANY(slugs)) — it can never advance and never finish, a zombie by
 * construction (real case: a 'hermes-task-server' run stuck since 17/08).
 * CAREFUL: hermes-task-server runs are created via the operator API on purpose
 * and have legitimate SHORT lives — the criterion is INACTIVITY (last step, or
 * started_at when stepless, older than 24h), NEVER the graph name.
 */
export const ORPHAN_SUMMARY = "orphan: graph fora do registry";
/** Redis key stamped at the end of every completed tick — the external
 *  liveness vigia (GET /api/v1/agent-org/liveness + CI cron) reads it. */
export const GRAPHTICK_LAST_OK_KEY = "graphtick:last_ok";
/** Early alarm: any zero-step run older than this means the scheduler is starving NOW. */
const STARVATION_ALARM_HOURS = 2;
/** Redis rate-limit key for the starvation alarm — at most one per 24h. */
const STARVATION_ALARM_KEY = "graphtick:starvation-alarm:sent";

let warnedMissingHermes = false;

/**
 * Relative lift of a new outcome vs its baseline (mean of prior outcomes for
 * the same metric). Pure, exported for tests. Honest null when there is no
 * baseline, the baseline is 0, or the value is missing — a first run has
 * nothing to be compared against, and we never invent a comparison.
 * Rounded to 4 decimals (0.25 = +25%).
 */
export function computeLift(valueAfter: number | null, baseline: number | null): number | null {
  if (valueAfter == null || baseline == null || !(baseline > 0)) return null;
  return Math.round(((valueAfter - baseline) / baseline) * 10_000) / 10_000;
}

async function httpJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ status: number; body: unknown }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

async function sendTelegram(text: string, buttons?: TelegramButton[]): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) {
    logger.warn("graph_tick_telegram_env_missing", { preview: text.slice(0, 120) });
    return;
  }
  try {
    // Inline buttons (approve/reject) — one row; callback_data ≤64 bytes per
    // Telegram's limit, which `ap:<uuid>` / `rj:<uuid>` (39 chars) respects.
    const payload: Record<string, unknown> = { chat_id: TG_CHAT, text };
    if (buttons && buttons.length > 0) {
      payload["reply_markup"] = {
        inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))],
      };
    }
    await httpJson(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      15_000
    );
  } catch (err) {
    logger.error("graph_tick_telegram_failed", { message: (err as Error).message?.slice(0, 160) });
  }
}

/**
 * "CUSTO POR TENANT" block of the ops snapshot (master list 5.C.2).
 * api_spend.tenant_id records since 22/08 and NOTHING read it — the margin
 * question ("does this tenant cost more than the plan it pays?") had the data
 * and no reader. This hands it to the brain that already looks at cost every
 * day: the Watchdog's lens-cost eats this same [ops] snapshot.
 *
 * Bounded by design: top 10 tenants by spend in the window, top 3 ops each,
 * dollars with 2 decimals. Cost per row = measured_cost_cents when the LLM
 * client measured tokens, est_cost_cents otherwise (the ledger's own fallback
 * order). A tenant with an ACTIVE subscription carries `plan=$X/mes` next to
 * the cost — the number the pricing decision (5.C.4) expects side by side.
 * tenant_id NULL (free test, drift-checks, system spend) aggregates into one
 * honest "sem tenant (plataforma)" line.
 *
 * On a deploy where the table/column does not exist yet (42P01/42703) the
 * section degrades to ONE honest line — it never breaks the snapshot the
 * other lenses depend on.
 */
async function tenantCostSection(sql: postgres.Sql, d: number): Promise<string[]> {
  try {
    const tenants = await sql<
      { tenant_id: string; tenant_name: string | null; plan_tier: string | null; cost_cents: string; ops: string }[]
    >`
      /* snap:tenant-cost */
      SELECT a.tenant_id::text AS tenant_id,
             t.name AS tenant_name,
             bs.plan_tier,
             SUM(COALESCE(a.measured_cost_cents, a.est_cost_cents))::text AS cost_cents,
             COUNT(*)::text AS ops
        FROM api_spend a
        LEFT JOIN tenants t ON t.id = a.tenant_id
        LEFT JOIN billing_subscriptions bs
               ON bs.tenant_id = a.tenant_id AND bs.status = 'active'
       WHERE a.tenant_id IS NOT NULL
         AND a.created_at >= NOW() - make_interval(days => ${d})
       GROUP BY a.tenant_id, t.name, bs.plan_tier
       ORDER BY SUM(COALESCE(a.measured_cost_cents, a.est_cost_cents)) DESC
       LIMIT 10`;

    const topOps = await sql<{ tenant_id: string; op: string; cost_cents: string }[]>`
      /* snap:tenant-ops */
      SELECT tenant_id, op, cost_cents
        FROM (SELECT a.tenant_id::text AS tenant_id,
                     a.op,
                     SUM(COALESCE(a.measured_cost_cents, a.est_cost_cents))::text AS cost_cents,
                     ROW_NUMBER() OVER (
                       PARTITION BY a.tenant_id
                       ORDER BY SUM(COALESCE(a.measured_cost_cents, a.est_cost_cents)) DESC
                     ) AS rn
                FROM api_spend a
               WHERE a.tenant_id IS NOT NULL
                 AND a.created_at >= NOW() - make_interval(days => ${d})
               GROUP BY a.tenant_id, a.op) ranked
       WHERE rn <= 3`;

    const platform = await sql<{ cost_cents: string | null; ops: string }[]>`
      /* snap:platform-cost */
      SELECT SUM(COALESCE(measured_cost_cents, est_cost_cents))::text AS cost_cents,
             COUNT(*)::text AS ops
        FROM api_spend
       WHERE tenant_id IS NULL
         AND created_at >= NOW() - make_interval(days => ${d})`;

    const p = platform[0];
    if (tenants.length === 0 && (!p || Number(p.ops) === 0)) return [];

    const usd = (cents: string | number | null | undefined) => `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
    const opsByTenant = new Map<string, string[]>();
    for (const o of topOps) {
      const list = opsByTenant.get(o.tenant_id) ?? [];
      list.push(`${o.op} ${usd(o.cost_cents)}`);
      opsByTenant.set(o.tenant_id, list);
    }

    const lines: string[] = [``, `CUSTO POR TENANT (api_spend, ${d}d):`];
    for (const t of tenants) {
      const name = t.tenant_name ?? `tenant ${t.tenant_id.slice(0, 8)}`;
      // Margin data only when there IS an active subscription. A tier whose
      // price we cannot map (legacy value) shows the tier name and no invented
      // dollar figure — honesty beats completeness here.
      const price = t.plan_tier != null ? (PLAN_PRICE_USD as Record<string, number | undefined>)[t.plan_tier] : undefined;
      const plan = t.plan_tier == null ? "sem assinatura" : price != null ? `plan=$${price}/mes` : `plan=${t.plan_tier}`;
      const top = opsByTenant.get(t.tenant_id) ?? [];
      lines.push(
        `- ${name}: ${plan} · custo ${d}d=${usd(t.cost_cents)} · ${t.ops} ops${top.length > 0 ? ` · top: ${top.join(", ")}` : ""}`
      );
    }
    if (p && Number(p.ops) > 0) {
      lines.push(`- sem tenant (plataforma): ${usd(p.cost_cents)} (${p.ops} ops)`);
    }
    return lines;
  } catch (err) {
    // Old deploy (42P01 table absent / 42703 column absent) or any read
    // failure: one honest line in the snapshot, loud in the log — the lenses
    // must never lose the rest of the ops digest over this section.
    const code = (err as { code?: string }).code ?? "";
    logger.warn("snapshot_tenant_cost_unavailable", {
      code,
      message: (err as Error).message?.slice(0, 160),
    });
    return [
      ``,
      `CUSTO POR TENANT: indisponivel neste deploy (api_spend/tenant_id ausente ou ilegivel${code ? ` — ${code}` : ""}).`,
    ];
  }
}

/**
 * The read-only brains' fuel: a bounded, PII-free digest of ops.* as text.
 * ops.* holds slugs, statuses, hashes and numbers — no tenant data is touched,
 * so this stays inside the company's own record. Two sources:
 *  - 'ops'      → run/step health, cost, cycle time, failure hotspots,
 *                 repeated inputs (the Watchdog's raw material) + the
 *                 per-tenant api_spend digest (tenant name + plan price only —
 *                 the margin lens; no emails, no brands, no domains);
 *  - 'outcomes' → agent_outcome lift per metric/graph (the CDO's raw material).
 * Returns "" when there is genuinely nothing — the runner turns that into an
 * honest "SEM DADOS" marker so the lenses never invent a number.
 * Exported for tests (the fake sql routes on the queries' own markers).
 */
export async function buildSnapshot(
  sql: postgres.Sql,
  source: string,
  days: number,
  metricPrefix?: string
): Promise<string> {
  const d = Math.min(90, Math.max(1, Math.round(days) || 14));
  // Sphere memory (#156): narrow an outcomes snapshot to one channel's own
  // record. No prefix → '%' matches every metric (the CDO's full view).
  const metricLike = (metricPrefix ?? "").replace(/%/g, "") + "%";

  if (source === "ops") {
    const perGraph = await sql<
      { graph: string; runs: string; succeeded: string; failed: string; running: string; cost_cents: string; avg_seconds: string | null }[]
    >`
      SELECT graph,
             COUNT(*)::text AS runs,
             COUNT(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
             COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
             COUNT(*) FILTER (WHERE status = 'running')::text AS running,
             COALESCE(SUM(cost_cents), 0)::text AS cost_cents,
             AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
               FILTER (WHERE ended_at IS NOT NULL)::text AS avg_seconds
        FROM ops.agent_run
       WHERE started_at >= NOW() - make_interval(days => ${d})
       GROUP BY graph
       ORDER BY COUNT(*) DESC`;

    const hotspots = await sql<{ node: string; graph: string; fails: string; total: string }[]>`
      SELECT s.node, r.graph,
             COUNT(*) FILTER (WHERE s.status = 'failed')::text AS fails,
             COUNT(*)::text AS total
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.started_at >= NOW() - make_interval(days => ${d})
       GROUP BY s.node, r.graph
      HAVING COUNT(*) FILTER (WHERE s.status = 'failed') > 0
       ORDER BY COUNT(*) FILTER (WHERE s.status = 'failed') DESC
       LIMIT 8`;

    const dupes = await sql<{ n: string; node: string }[]>`
      SELECT COUNT(*)::text AS n, MIN(node) AS node
        FROM ops.agent_step
       WHERE input_hash IS NOT NULL
         AND started_at >= NOW() - make_interval(days => ${d})
       GROUP BY input_hash
      HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT 6`;

    if (perGraph.length === 0) return "";
    const lines: string[] = [`REGISTRO OPERACIONAL (ops.*, ${d}d):`, ``, `Por graph:`];
    for (const g of perGraph) {
      const avg = g.avg_seconds ? `${Math.round(Number(g.avg_seconds))}s ciclo medio` : "sem ciclo medido";
      lines.push(
        `- ${g.graph}: ${g.runs} runs (${g.succeeded} ok / ${g.failed} falha / ${g.running} rodando) · ${(Number(g.cost_cents) / 100).toFixed(2)} USD · ${avg}`
      );
    }
    if (hotspots.length > 0) {
      lines.push(``, `Nodes que mais falham:`);
      for (const h of hotspots) lines.push(`- ${h.graph}/${h.node}: ${h.fails} falhas em ${h.total} execucoes`);
    }
    if (dupes.length > 0) {
      lines.push(``, `Inputs repetidos (mesmo hash rodado varias vezes):`);
      for (const dp of dupes) lines.push(`- node '${dp.node}': input identico rodou ${dp.n}x`);
    }
    // 5.C.2 — the tenant-level spend the ledger records but nobody read.
    lines.push(...(await tenantCostSection(sql, d)));
    return lines.join("\n");
  }

  if (source === "outcomes") {
    const outcomes = await sql<
      { metric: string; graph: string | null; value_after: string | null; lift: string | null; measured_at: string }[]
    >`
      SELECT ao.metric,
             r.graph,
             ao.value_after::text AS value_after,
             ao.lift::text AS lift,
             ao.measured_at::text AS measured_at
        FROM ops.agent_outcome ao
        JOIN ops.agent_step s ON s.id = ao.step_id
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE ao.measured_at >= NOW() - make_interval(days => ${d})
         AND ao.metric LIKE ${metricLike}
       ORDER BY ao.measured_at DESC
       LIMIT 60`;

    // Founder rejections are memory too (17/08: "quando houver reject a
    // pergunta do porquê, para alimentar a informação do grafo"). The Telegram
    // webhook stores the reason as the failed approval step's summary
    // ("rejected: <why>"); here the sphere reads its OWN recent rejections —
    // graphs whose harvest metric shares this prefix — so the next briefing
    // knows what the human said no to, and why.
    const sphereGraphs = metricPrefix
      ? Object.values(GRAPH_REGISTRY)
          .filter((g) => g.nodes.some((n) => n.kind === "harvest" && String(n.config?.["metric"] ?? "").startsWith(metricPrefix.replace(/%/g, ""))))
          .map((g) => g.slug)
      : [];
    const rejections =
      sphereGraphs.length > 0
        ? await sql<{ graph: string; summary: string; started_at: string }[]>`
            SELECT r.graph, s.summary, s.started_at::text AS started_at
              FROM ops.agent_step s
              JOIN ops.agent_run r ON r.id = s.run_id
             WHERE r.graph = ANY(${sphereGraphs})
               AND s.status = 'failed'
               AND s.summary LIKE 'rejected:%'
               AND s.started_at >= NOW() - make_interval(days => ${d})
             ORDER BY s.started_at DESC
             LIMIT 8`
        : [];

    if (outcomes.length === 0 && rejections.length === 0) return "";
    const scope = metricPrefix ? ` · esfera ${metricPrefix}*` : "";
    const lines: string[] = [`RESULTADOS REAIS (ops.agent_outcome, ${d}d${scope}):`, ``];
    for (const o of outcomes) {
      const lift = o.lift != null ? `lift ${o.lift}` : "sem baseline";
      const val = o.value_after != null ? o.value_after : "?";
      lines.push(`- ${o.metric} (${o.graph ?? "?"}): ${val} · ${lift} · ${o.measured_at.slice(0, 10)}`);
    }
    if (rejections.length > 0) {
      lines.push(``, `REJEICOES RECENTES DO FOUNDER (o que ele disse NAO, e por que — nao repita):`);
      for (const rj of rejections) {
        lines.push(`- ${rj.started_at.slice(0, 10)} (${rj.graph}): ${rj.summary.replace(/^rejected:\s*/, "")}`);
      }
    }
    return lines.join("\n");
  }

  if (source === "product") {
    // The CPO's fuel (founder, 13/08: "na estrutura falta o responsável pelo
    // produto"): what the PRODUCT is actually delivering, as AGGREGATES ONLY.
    // PII rule is absolute here — these are tenant tables, so nothing but
    // counts, rates and averages may leave this function: no emails, no brand
    // names, no domains, no ids.
    const audits = await sql<
      { total: string; failed: string; avg_brand: string | null; avg_perf: string | null; avg_ai: string | null; avg_seconds: string | null }[]
    >`
      SELECT COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
             AVG(score_brand)::text AS avg_brand,
             AVG(score_performance)::text AS avg_perf,
             AVG(score_ai)::text AS avg_ai,
             AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))
               FILTER (WHERE completed_at IS NOT NULL)::text AS avg_seconds
        FROM geo_audit
       WHERE created_at >= NOW() - make_interval(days => ${d})`;

    const engines = await sql<{ engine: string; status: string; positive_rate: string | null }[]>`
      SELECT DISTINCT ON (engine) engine, status, positive_rate::text
        FROM engine_drift_check
       ORDER BY engine, checked_at DESC`;

    const funnel = await sql<{ free_tests: string; claimed: string; new_tenants: string; active_subs: string }[]>`
      SELECT (SELECT COUNT(*) FROM lead_capture WHERE created_at >= NOW() - make_interval(days => ${d}))::text AS free_tests,
             (SELECT COUNT(*) FROM lead_capture WHERE claimed_at >= NOW() - make_interval(days => ${d}))::text AS claimed,
             (SELECT COUNT(*) FROM tenants WHERE created_at >= NOW() - make_interval(days => ${d}))::text AS new_tenants,
             (SELECT COUNT(*) FROM billing_subscriptions WHERE status IN ('active','trialing'))::text AS active_subs`;

    const usage = await sql<{ brands: string; monitored: string; credits_spent: string }[]>`
      SELECT (SELECT COUNT(*) FROM brands)::text AS brands,
             (SELECT COUNT(*) FROM brands WHERE monitoring_enabled)::text AS monitored,
             (SELECT COALESCE(ABS(SUM(delta)), 0) FROM credit_ledger
               WHERE delta < 0 AND created_at >= NOW() - make_interval(days => ${d}))::text AS credits_spent`;

    const a = audits[0];
    const f = funnel[0];
    const u = usage[0];
    if (!a || Number(a.total) === 0) {
      // Zero audits in the window is itself the finding — say it, don't hide it.
      return `PRODUTO (${d}d): NENHUMA auditoria rodou na janela. Funil: ${f?.free_tests ?? 0} free tests · ${f?.new_tenants ?? 0} tenants novos · ${f?.active_subs ?? 0} assinaturas ativas.`;
    }
    const failRate = ((Number(a.failed) / Number(a.total)) * 100).toFixed(0);
    const lines: string[] = [
      `PRODUTO (agregados, ${d}d — sem PII):`,
      ``,
      `Auditorias: ${a.total} rodadas · ${a.failed} falharam (${failRate}%) · scores medios brand=${Number(a.avg_brand ?? 0).toFixed(0)} perf=${Number(a.avg_perf ?? 0).toFixed(0)} ai=${Number(a.avg_ai ?? 0).toFixed(0)} · ciclo medio ${a.avg_seconds ? `${Math.round(Number(a.avg_seconds))}s` : "sem dado"}`,
      ``,
      `Motores (ultimo drift-check por engine):`,
      ...engines.map((e) => `- ${e.engine}: ${e.status}${e.positive_rate ? ` · positive_rate ${Number(e.positive_rate).toFixed(2)}` : ""}`),
      ``,
      `Funil (${d}d): ${f?.free_tests ?? 0} free tests → ${f?.claimed ?? 0} claims → ${f?.new_tenants ?? 0} tenants novos · ${f?.active_subs ?? 0} assinaturas ativas (total)`,
      `Uso: ${u?.brands ?? 0} marcas cadastradas · ${u?.monitored ?? 0} com monitoring ligado · ${u?.credits_spent ?? 0} creditos consumidos na janela`,
    ];
    return lines.join("\n");
  }

  // Unknown source: honest empty, not a throw — the graph author named it, the
  // validator required it non-empty, so this is a typo, not an outage.
  return "";
}

function buildPorts(sql: postgres.Sql, redis: Redis): GraphRunnerPorts {
  return {
    substrate: {
      async getRun(runId) {
        const rows = await sql<RunRow[]>`
          SELECT id, graph, status, started_at::text AS started_at
            FROM ops.agent_run WHERE id = ${runId}::uuid`;
        return rows[0] ?? null;
      },
      async loadSteps(runId) {
        const rows = await sql<StepRow[]>`
          SELECT id, node, status, started_at::text AS started_at
            FROM ops.agent_step WHERE run_id = ${runId}::uuid
           ORDER BY started_at ASC`;
        return rows;
      },
      async startStep(input) {
        const rows = await sql<{ id: string }[]>`
          INSERT INTO ops.agent_step (run_id, node, parent_step_id, input_hash)
          VALUES (${input.runId}::uuid, ${input.node}, ${input.parentStepId ?? null}, ${input.inputHash ?? null})
          RETURNING id`;
        return rows[0]!.id;
      },
      async finishStep(stepId, input) {
        await sql`
          UPDATE ops.agent_step
             SET status = ${input.status},
                 output_hash = ${input.outputHash ?? null},
                 summary = ${input.summary?.slice(0, 500) ?? null},
                 ms = ${input.ms ?? null},
                 engine = ${input.engine ?? null}
           WHERE id = ${stepId}::uuid`;
      },
      async finishRun(runId, status) {
        await sql`
          UPDATE ops.agent_run
             SET status = ${status},
                 ended_at = NOW(),
                 cost_cents = (SELECT COALESCE(SUM(cost_cents), 0) FROM ops.agent_step WHERE run_id = ${runId}::uuid)
           WHERE id = ${runId}::uuid`;
      },
      async recordOutcome(input) {
        // LIFT, for real (structural hole #2 of the 14/08 sweep — this was a
        // hardcoded null since day one, so every verdict was absolute and the
        // learning loop compared against nothing). Baseline = the mean of the
        // last 5 PRIOR outcomes for the exact same metric; lift = relative
        // change vs that baseline. Honest null when there is no prior row or
        // the baseline is 0 — a first run has nothing to be measured against,
        // and we never invent a comparison. One query, no schema change.
        const base = await sql<{ baseline: string | null }[]>`
          SELECT AVG(value_after)::text AS baseline
            FROM (SELECT value_after
                    FROM ops.agent_outcome
                   WHERE metric = ${input.metric}
                     AND value_after IS NOT NULL
                   ORDER BY measured_at DESC
                   LIMIT 5) prior`;
        const baseline = base[0]?.baseline != null ? Number(base[0].baseline) : null;
        const lift = computeLift(input.valueAfter, baseline);
        const rows = await sql<{ id: string }[]>`
          INSERT INTO ops.agent_outcome (step_id, metric, value_before, value_after, lift)
          VALUES (${input.stepId}::uuid, ${input.metric}, ${input.valueBefore}, ${input.valueAfter}, ${lift})
          RETURNING id`;
        return rows[0]!.id;
      },
      async snapshot(input) {
        return buildSnapshot(sql, input.source, input.days, input.metricPrefix);
      },
      async startRun(input) {
        const rows = await sql<{ id: string }[]>`
          INSERT INTO ops.agent_run (graph, trigger, vp_owner)
          VALUES (${input.graph}, ${input.trigger}, ${input.vpOwner})
          RETURNING id`;
        return rows[0]!.id;
      },
      async externalSignals() {
        if (!SE_URL || !SE_KEY) return null; // not wired: cells run as before
        const cacheKey = `se:signals:${SE_COUNTRY || "all"}`;
        try {
          const cached = await redis.get(cacheKey);
          if (cached) return cached;
        } catch {
          /* cache miss on redis error is fine */
        }
        const se = signalEngine({ baseUrl: SE_URL, apiKey: SE_KEY });
        const r = await se.opportunities(SE_COUNTRY || undefined);
        if (!r.ok) {
          // Honest: the cell will see SEM DADO, and we log why (no key in log).
          logger.warn("signal_engine_unavailable", { reason: r.reason, status: r.status ?? null });
          return signalsBlock([], { source: `Signal Engine indisponivel (${r.reason})` });
        }
        const opps = listOf<SeOpportunity>(r.data, "items", "opportunities");
        const block = signalsBlock(opps, { fetchedAt: r.fetchedAt });
        try {
          await redis.set(cacheKey, block, "EX", SE_CACHE_SECONDS);
        } catch {
          /* fine */
        }
        return block;
      },
      async readHarvest(metric, sinceIso) {
        // The #162 cron writes outcomes named like 'youtube_views_7d'; a graph
        // harvest config names the exact metric or a TRUE prefix of it
        // ('youtube_views'). Beware: an abbreviation ('yt_views') matches
        // NOTHING — that was the daily-video v2 false-zero bug (13/08).
        const rows = await sql<{ n: string; total: string | null }[]>`
          SELECT COUNT(*)::text AS n, COALESCE(SUM(value_after), 0)::text AS total
            FROM ops.agent_outcome
           WHERE metric LIKE ${metric.replace(/%/g, "") + "%"}
             AND measured_at >= ${sinceIso}::timestamptz`;
        return { n: Number(rows[0]?.n ?? 0), total: Number(rows[0]?.total ?? 0) };
      },
      async publishedToday(channel) {
        // Counter of the cadence valve (24/08): succeeded publishes to this
        // channel since 00:00 UTC. The channel travels in the step summary
        // ("published via postiz channel=<ch>..."), so LIKE on the marker is
        // the join — channels are single tokens, no prefix collisions.
        const rows = await sql<{ n: string }[]>`
          SELECT COUNT(*)::text AS n
            FROM ops.agent_step
           WHERE node = 'publish' AND status = 'succeeded'
             AND summary LIKE ${"%channel=" + channel + "%"}
             AND started_at >= date_trunc('day', now() AT TIME ZONE 'utc')`;
        return Number(rows[0]?.n ?? 0);
      },
    },
    hermes: {
      async task(prompt) {
        const res = await callWithFallback(HERMES_ENGINES, async (engine) => {
          const { status, body } = await httpJson(
            `${HERMES_URL}/task`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${HERMES_TOKEN}` },
              body: JSON.stringify({ engine, timeoutMs: HERMES_TIMEOUT_MS - 20_000, prompt }),
            },
            HERMES_TIMEOUT_MS
          );
          const b = body as { ok?: boolean; output?: string; engine_used?: string; ms?: number; error?: string };
          const ok = status === 200 && b?.ok === true;
          return {
            ok,
            output: ok ? String(b?.output ?? "") : String(b?.error ?? b?.output ?? `http_${status}`),
            engineUsed: b?.engine_used ?? engine,
            ms: typeof b?.ms === "number" ? b.ms : null,
          };
        });
        // Primary engine down (but a fallback saved the step): shout ONCE per
        // window with the fix, not once per step. Never silent, never spam.
        if (res.failures.length > 0) {
          const primary = res.failures[0]!;
          const key = res.ok ? HERMES_PRIMARY_DOWN_KEY : HERMES_ALL_DOWN_KEY;
          let first = true;
          try {
            first = (await redis.set(key, "1", "EX", HERMES_ALARM_WINDOW_S, "NX")) === "OK";
          } catch {
            first = true; // no Redis → prefer a duplicate alarm over silence
          }
          logger.warn("hermes_engine_fallback", {
            ok: res.ok,
            fallbacks: res.fallbacks,
            engineUsed: res.engineUsed,
            failures: res.failures,
          });
          if (first) {
            await sendTelegram(
              res.ok
                ? `🟡 HERMES: engine "${primary.engine}" falhou (${primary.error}). Os grafos estão rodando em fallback "${res.engineUsed}". Para voltar ao primário: re-autentique na VPS (ex.: claude login). Este aviso repete a cada 6h enquanto durar.`
                : `🔴 HERMES: TODOS os engines falharam (${res.failures.map((f) => f.engine).join(", ")}). Último erro: ${errorHead(primary.error, 80)}. Nenhum passo de LLM avança até um engine voltar.`
            );
          }
        }
        return { ok: res.ok, output: res.output, engineUsed: res.engineUsed, ms: res.ms };
      },
      async publish(payload) {
        const { status, body } = await httpJson(
          `${HERMES_URL}/postiz-schedule`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${HERMES_TOKEN}` },
            body: JSON.stringify({ channel: payload.channel, post: payload.post }),
          },
          60_000
        );
        const b = body as { ok?: boolean; postiz?: unknown };
        return {
          ok: status === 200 && b?.ok === true,
          detail: JSON.stringify(b?.postiz ?? body).slice(0, 500),
        };
      },
    },
    artifacts: {
      async get(runId, node) {
        return redis.get(`graphrun:${runId}:${node}`);
      },
      async set(runId, node, text) {
        await redis.set(`graphrun:${runId}:${node}`, text, "EX", ARTIFACT_TTL_SECONDS);
      },
    },
    telegram: sendTelegram,
    now: () => new Date(),
  };
}

/**
 * The brains that self-start on a schedule (proactivity, not a button someone
 * remembers to press). Cadence matched to the work: operational hygiene is a
 * DAILY concern (the Watchdog), strategy is a WEEKLY one (the CDO) — and the
 * CDO now carries an acting tail (approval → spawn), so weekly also keeps the
 * launch approvals from piling up.
 */
const DAILY_BRAINS = ["daily-watchdog"];
// Monday morning strategy pair: the CDO (growth) and the CPO (product) land
// together — the founder reviews both briefs in one sitting.
const WEEKLY_BRAINS = ["daily-dream", "weekly-product"];
/**
 * Specialist cells (#156) that self-start on their own cadence. Founder 14/08:
 * the X cell runs EVERY day now (was Mon/Wed/Fri); the editorial calendar
 * rotates the theme so daily volume stays diverse. The legacy VPS X thread
 * must be retired by the founder — two producers on one channel is R7.
 */
const SPHERE_CELLS = ["sphere-x"];
/**
 * #156 cells two and three. LinkedIn posts EVERY day (founder 14/08), one
 * hour after X so approvals never collide. The blog cell thinks on Thursday,
 * so its brief+outline reaches the founder before the Monday 12:00 CI
 * autopublish; it publishes nothing.
 */
const LINKEDIN_CELLS = ["sphere-linkedin"];
const BLOG_CELLS = ["sphere-blog"];
/**
 * The Reddit sphere (#485 consumer, 18/08): the first cell built to consume the
 * Signal Engine's "where to act" queue ([__signals__]). Report-only — it
 * publishes nothing — so it never counts against the approvals valve. Weekly
 * (Wed 08:00 UTC, a slot free of the other sphere crons); its brief reaches the
 * founder with the week's real Reddit opportunities, or SEM DADO honestly.
 */
const REDDIT_CELLS = ["sphere-reddit"];
/**
 * The daily video, as a GRAPH (v2/v3 — memory + adapt + correct harvest
 * metric). The structural hole of 14/08: this graph was registered and valid
 * but appeared in NO cron list, so nothing ever started it — while the legacy
 * VPS/n8n video job it was built to replace went silent on 10/08. This is the
 * clock. The legacy path stays untouched until this graph's first PROVEN
 * publish (founder retires it — a live switch); the absence check below
 * screams either way, so the gap can never again be silent.
 */
const VIDEO_CELLS = ["daily-video"];
/**
 * Content alive on every platform (founder, 17/08). The three short-video
 * spheres run daily, staggered after LinkedIn (IG 11:00, TikTok 12:00, YT
 * 14:00 UTC) so approvals land one at a time; PPC thinks weekly (Tue 08:00)
 * and can only report — zero spend by construction. One queue, four named
 * repeatables (see worker index).
 */
const PLATFORM_CELLS: Record<string, string> = {
  "sphere-instagram": "sphere-instagram",
  "sphere-tiktok": "sphere-tiktok",
  "sphere-youtube": "sphere-youtube",
  "sphere-ppc": "sphere-ppc",
};

/**
 * Founder-load safety valve (17/08). With X, LinkedIn, IG, TikTok, YT and the
 * daily video all asking for a yes, one day is ~6 approvals. This cap is NOT a
 * hard rule — it is a valve: once today already STARTED >= N gated marketing
 * runs (marketing-owned graphs that carry an approval node), further gated
 * marketing starts are skipped, out loud (log + one Telegram note per call).
 * Read-only cells (blog, PPC) and the CEO brains never count and never skip.
 * Env SPHERE_MAX_DAILY_APPROVALS, default 6; 0 disables the valve.
 */
export const DEFAULT_MAX_DAILY_APPROVALS = 6;
export function maxDailyApprovals(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["SPHERE_MAX_DAILY_APPROVALS"];
  if (raw === undefined || raw === "") return DEFAULT_MAX_DAILY_APPROVALS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_DAILY_APPROVALS;
}

/** A graph the valve counts: marketing-owned AND gated by a human approval. */
export function isGatedMarketingGraph(slug: string): boolean {
  const def = GRAPH_REGISTRY[slug];
  return !!def && def.vpOwner === "marketing" && def.nodes.some((n) => n.kind === "approval");
}

/** Every registered slug the valve counts — the SQL filter for "today's gated starts". */
export function gatedMarketingSlugs(): string[] {
  return Object.keys(GRAPH_REGISTRY).filter(isGatedMarketingGraph);
}

/**
 * Start brain runs — idempotent by a look-back window so a worker restart or a
 * second instance cannot double-fire. Gated on HERMES_TOKEN: with no executor,
 * starting a run only creates a stuck row and a false alarm, so we skip (the
 * tick's own missing-token alarm still covers a token that vanishes
 * mid-flight). The every-10-min graph-tick advances whatever this starts.
 * Exported for the valve's unit test; the cron entry points below wrap it.
 */
export async function startBrainRuns(
  sql: postgres.Sql,
  brains: string[],
  lookbackHours: number,
  trigger: string,
  opts: { hermesToken?: string; maxDailyApprovals?: number } = {}
): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  const started: string[] = [];
  const skipped: string[] = [];
  const capped: string[] = [];
  const token = opts.hermesToken ?? HERMES_TOKEN;
  if (!token) {
    logger.warn("brain_start_skipped_no_executor", { brains: brains.join(","), trigger });
    return { started, skipped: [...brains], capped };
  }
  // The valve: count today's gated marketing starts ONCE per call, only when
  // this call could add one — brains/read-only cells never pay for the query.
  const cap = opts.maxDailyApprovals ?? maxDailyApprovals();
  let gatedToday = -1;
  if (cap > 0 && brains.some(isGatedMarketingGraph)) {
    const rows = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM ops.agent_run
       WHERE graph = ANY(${gatedMarketingSlugs()})
         AND started_at >= date_trunc('day', NOW())`;
    gatedToday = Number(rows[0]?.n ?? 0);
  }
  for (const graph of brains) {
    if (cap > 0 && isGatedMarketingGraph(graph) && gatedToday >= cap) {
      capped.push(graph);
      logger.warn("brain_start_capped_daily_approvals", { graph, trigger, gatedToday, cap });
      continue;
    }
    const recent = await sql<{ id: string }[]>`
      SELECT id FROM ops.agent_run
       WHERE graph = ${graph}
         AND started_at >= NOW() - make_interval(hours => ${lookbackHours})
       LIMIT 1`;
    if (recent.length > 0) {
      skipped.push(graph);
      continue;
    }
    // vp_owner comes from the graph's own definition — the CEO owns the
    // brains, marketing owns the sphere cells; one lookup, no drift.
    const vpOwner = GRAPH_REGISTRY[graph]?.vpOwner ?? "ceo";
    const rows = await sql<{ id: string }[]>`
      INSERT INTO ops.agent_run (graph, trigger, vp_owner)
      VALUES (${graph}, ${trigger}, ${vpOwner})
      RETURNING id`;
    started.push(`${graph}:${rows[0]!.id.slice(0, 8)}`);
    logger.info("brain_started", { graph, runId: rows[0]!.id, trigger });
    if (isGatedMarketingGraph(graph)) gatedToday += 1;
  }
  if (started.length > 0) {
    await sendTelegram(`🧠 Cérebros iniciados (${trigger}): ${started.join(", ")}. Relatórios chegam quando os graphs concluírem.`);
  }
  if (capped.length > 0) {
    // One note per call, never silent: the founder must know a cell did not
    // run today because the valve closed, not because something broke.
    await sendTelegram(
      `🟡 VÁLVULA DE APROVAÇÕES: hoje já começaram ${gatedToday} run(s) de marketing com aprovação (limite SPHERE_MAX_DAILY_APPROVALS=${cap}). Pulei: ${capped.join(", ")} (${trigger}). Não é falha — é a válvula. Suba a env para liberar.`
    );
  }
  return { started, skipped, capped };
}

/** Daily hygiene: the Watchdog. 20h look-back (once per calendar day). */
export async function runBrainDaily(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, DAILY_BRAINS, 20, "cron:brain-daily");
}

/** Weekly strategy: the Chief Dreaming Officer. 6-day look-back (once/week). */
export async function runBrainWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, WEEKLY_BRAINS, 24 * 6, "cron:brain-weekly");
}

/**
 * CDO+CPO active discovery (founder rule 13/08): improvements + new products,
 * matured to MVP-ready before the founder sees them. Thursday, offset from the
 * Monday strategy pair so the week has two thinking moments, not one pile.
 */
export async function runDiscoveryWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, ["weekly-discovery"], 24 * 6, "cron:discovery-weekly");
}

/** Specialist cells (#156): daily content runs. 20h look-back. */
export async function runSphereStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, SPHERE_CELLS, 20, "cron:sphere-start");
}

/** LinkedIn cell (#156): daily content runs. 20h look-back. */
export async function runSphereLinkedinStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, LINKEDIN_CELLS, 20, "cron:sphere-linkedin");
}

/** Blog cell (#156): weekly thinker, Thursday. 6-day look-back. */
export async function runSphereBlogStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, BLOG_CELLS, 24 * 6, "cron:sphere-blog");
}

/** Reddit cell (#485): weekly thinker, Wednesday. 6-day look-back (as blog/PPC). */
export async function runSphereRedditStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, REDDIT_CELLS, 24 * 6, "cron:sphere-reddit");
}

/** The daily video graph (v2), once per calendar day. 20h look-back. */
export async function runVideoDaily(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, VIDEO_CELLS, 20, "cron:video-daily");
}

/**
 * Platform cells (17/08): one entry point, keyed by the repeatable's job name.
 * IG / TikTok / YouTube are daily (20h look-back); PPC is weekly (6-day
 * look-back) and read-only. An unknown name starts nothing and says so.
 */
export async function runPlatformCellStart(
  sql: postgres.Sql,
  name: string
): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  const graph = PLATFORM_CELLS[name];
  if (!graph) {
    logger.error("platform_cell_unknown", { name });
    return { started: [], skipped: [name], capped: [] };
  }
  const lookback = graph === "sphere-ppc" ? 24 * 6 : 20;
  return startBrainRuns(sql, [graph], lookback, `cron:${name}`);
}

/**
 * The video ABSENCE watchdog (#169 — "vigia de ausência de publicação").
 * The 10-14/08 outage taught the rule the hard way: a pipeline that stops is
 * not an error anyone sees — it is a silence. This check makes silence LOUD:
 * if no daily-video publish step SUCCEEDED in the look-back window, it says so
 * on Telegram, with enough context to diagnose (runs started? stuck where?).
 * It never fixes anything itself — the watcher stays outside the watched.
 */
export async function runVideoAbsenceCheck(
  sql: postgres.Sql
): Promise<{ published: number; runsStarted: number; alarmed: boolean }> {
  const LOOKBACK_HOURS = 26; // one day + slack for a slow approval
  const def = GRAPH_REGISTRY["daily-video"];
  // Publish node ids come from the graph definition itself — no drift when the
  // graph changes shape.
  const publishNodes = (def?.nodes ?? []).filter((n) => n.kind === "publish").map((n) => n.id);

  const pub = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n
      FROM ops.agent_step s
      JOIN ops.agent_run r ON r.id = s.run_id
     WHERE r.graph = 'daily-video'
       AND s.node = ANY(${publishNodes})
       AND s.status = 'succeeded'
       AND s.started_at >= NOW() - make_interval(hours => ${LOOKBACK_HOURS})`;
  const published = Number(pub[0]?.n ?? 0);

  const runs = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n
      FROM ops.agent_run
     WHERE graph = 'daily-video'
       AND started_at >= NOW() - make_interval(hours => ${LOOKBACK_HOURS})`;
  const runsStarted = Number(runs[0]?.n ?? 0);

  if (published > 0) {
    return { published, runsStarted, alarmed: false };
  }
  // Silence detected — scream with a diagnosis, not just a siren.
  const diagnosis =
    runsStarted === 0
      ? "nenhum run do graph daily-video começou (relógio ou executor parados)"
      : `${runsStarted} run(s) começaram mas NENHUM publish concluiu (preso em aprovação, falha de nó, ou Postiz)`;
  await sendTelegram(
    `🔴 VÍDEO SEM PUBLICAR há ${LOOKBACK_HOURS}h: ${diagnosis}. ` +
      `Ver ops.agent_run WHERE graph='daily-video' e o alerta de aprovação no Telegram.`
  );
  return { published, runsStarted, alarmed: true };
}

export interface GraphTickResult {
  advanced: number;
  /** Parked runs (waiting frontier) that got their cheap re-check this tick. */
  parkedChecked: number;
  /** Zero-step runs older than STARVED_RUN_HOURS reconciled as failed this tick. */
  starvedFailed: number;
  /** Off-registry 'running' runs idle >STARVED_RUN_HOURS reconciled as failed this tick. */
  orphanFailed: number;
  results: Array<{ runId: string; graph: string; status: string; started: string[]; pool: "exec" | "parked" }>;
}

/** Test seams — production callers pass nothing and get the real wiring. */
export interface GraphTickOpts {
  hermesToken?: string;
  advance?: typeof advanceRun;
  ports?: GraphRunnerPorts;
  telegram?: (text: string, buttons?: TelegramButton[]) => Promise<void>;
}

export async function runGraphTick(
  sql: postgres.Sql,
  redis: Redis,
  opts: GraphTickOpts = {}
): Promise<GraphTickResult> {
  const slugs = Object.keys(GRAPH_REGISTRY);
  const telegram = opts.telegram ?? sendTelegram;

  // 0) Starved-run reconciliation. A 'running' run with ZERO steps after 24h
  // was never picked up by any tick — the 18-20/08 backlog (26 runs). Failing
  // them here, with an auditable step row, keeps a deploy from suddenly
  // burning LLM money on days-old briefings; the next cron starts fresh.
  const starved = await sql<{ id: string; graph: string }[]>`
    /* tick:starved-select */
    SELECT r.id, r.graph FROM ops.agent_run r
     WHERE r.status = 'running' AND r.graph = ANY(${slugs})
       AND r.started_at < NOW() - make_interval(hours => ${STARVED_RUN_HOURS})
       AND NOT EXISTS (SELECT 1 FROM ops.agent_step s WHERE s.run_id = r.id)
     ORDER BY r.started_at ASC`;
  if (starved.length > 0) {
    const ids = starved.map((r) => r.id);
    // One failed step per run so the failure is auditable (todo job auditável)
    // — agent_run has no summary column; the step carries the reason.
    await sql`
      /* tick:starved-step */
      INSERT INTO ops.agent_step (run_id, node, status, summary)
      SELECT id, '__starved__', 'failed', ${STARVED_SUMMARY}
        FROM ops.agent_run WHERE id = ANY(${ids}::uuid[])`;
    await sql`
      /* tick:starved-fail */
      UPDATE ops.agent_run SET status = 'failed', ended_at = NOW()
       WHERE id = ANY(${ids}::uuid[])`;
    // ONE consolidated line, count per graph — not 26 messages.
    const perGraph = new Map<string, number>();
    for (const r of starved) perGraph.set(r.graph, (perGraph.get(r.graph) ?? 0) + 1);
    const breakdown = [...perGraph.entries()].map(([g, n]) => `${g}×${n}`).join(", ");
    await telegram(
      `🔴 RECONCILIAÇÃO DE FOME: ${starved.length} run(s) com ZERO steps há >${STARVED_RUN_HOURS}h marcadas como failed ("${STARVED_SUMMARY}"): ${breakdown}. Backlog limpo — os próximos crons rodam do zero, sem queimar LLM em briefings velhos.`
    );
    logger.warn("graph_tick_starved_reconciled", { count: starved.length, breakdown });
  }

  // 0a) Orphan reconciliation — SAME block, the other zombie shape. A run whose
  // graph left (or never entered) GRAPH_REGISTRY is filtered out of every pool
  // query above and below: no tick will ever advance or finish it. Real case:
  // a 'hermes-task-server' run (created via the operator API, by design outside
  // the registry) stuck 'running' since 17/08. The criterion is INACTIVITY —
  // last step (or started_at when stepless) older than STARVED_RUN_HOURS —
  // never the name: hermes-task-server also has legitimate short-lived runs.
  const orphans = await sql<{ id: string; graph: string }[]>`
    /* tick:orphan-select */
    SELECT r.id, r.graph FROM ops.agent_run r
     WHERE r.status = 'running' AND NOT (r.graph = ANY(${slugs}))
       AND COALESCE(
             (SELECT MAX(s.started_at) FROM ops.agent_step s WHERE s.run_id = r.id),
             r.started_at
           ) < NOW() - make_interval(hours => ${STARVED_RUN_HOURS})
     ORDER BY r.started_at ASC`;
  if (orphans.length > 0) {
    const ids = orphans.map((r) => r.id);
    // Auditable, like the starved path: one failed step names the reason.
    await sql`
      /* tick:orphan-step */
      INSERT INTO ops.agent_step (run_id, node, status, summary)
      SELECT id, '__orphan__', 'failed', ${ORPHAN_SUMMARY}
        FROM ops.agent_run WHERE id = ANY(${ids}::uuid[])`;
    await sql`
      /* tick:orphan-fail */
      UPDATE ops.agent_run SET status = 'failed', ended_at = NOW()
       WHERE id = ANY(${ids}::uuid[])`;
    const perGraph = new Map<string, number>();
    for (const r of orphans) perGraph.set(r.graph, (perGraph.get(r.graph) ?? 0) + 1);
    const breakdown = [...perGraph.entries()].map(([g, n]) => `${g}×${n}`).join(", ");
    await telegram(
      `🟠 RECONCILIAÇÃO DE ÓRFÃOS: ${orphans.length} run(s) 'running' com graph FORA do registry e sem atividade há >${STARVED_RUN_HOURS}h marcadas como failed ("${ORPHAN_SUMMARY}"): ${breakdown}. Nenhum tick consegue avançá-las — zumbis por construção.`
    );
    logger.warn("graph_tick_orphans_reconciled", { count: orphans.length, breakdown });
  }

  // 0b) Starvation alarm — cheap in-tick check, rate-limited to once per 24h.
  // Any zero-step run older than 2h means the scheduler is starving NOW.
  // NOTE (vigia fica fora do vigiado): this alarm lives INSIDE the tick, so a
  // dead worker cannot fire it — the true external vigia (CI-based liveness
  // probe on ops.agent_step recency) is follow-up work, per the house rule.
  const hungry = await sql<{ id: string; graph: string; started_at: string }[]>`
    /* tick:starvation-alarm */
    SELECT r.id, r.graph, r.started_at::text AS started_at FROM ops.agent_run r
     WHERE r.status = 'running' AND r.graph = ANY(${slugs})
       AND r.started_at < NOW() - make_interval(hours => ${STARVATION_ALARM_HOURS})
       AND NOT EXISTS (SELECT 1 FROM ops.agent_step s WHERE s.run_id = r.id)
     ORDER BY r.started_at ASC
     LIMIT 50`;
  if (hungry.length > 0) {
    let firstToday: unknown = "OK";
    try {
      firstToday = await redis.set(STARVATION_ALARM_KEY, "1", "EX", 24 * 3600, "NX");
    } catch {
      /* redis down: alarm anyway — better twice than never */
    }
    if (firstToday === "OK") {
      const oldest = hungry[0]!;
      await telegram(
        `🟠 FOME NO SCHEDULER: ${hungry.length} run(s) 'running' com ZERO steps há >${STARVATION_ALARM_HOURS}h. Mais antiga: ${oldest.graph} (run ${oldest.id.slice(0, 8)}, desde ${oldest.started_at.slice(0, 16)}). O tick não está chegando nelas — verificar slots/parked runs.`
      );
    }
    logger.warn("graph_tick_starvation_detected", { count: hungry.length, oldestGraph: hungry[0]!.graph });
  }

  // 1) Two-pool selection. THE 18-20/08 LESSON: a parked run must NEVER cost
  // an advanceable run its execution slot.
  //  - exec pool: runs with NO waiting step — their next step is real work
  //    (an LLM call), so they get the MAX_RUNS_PER_TICK slots, oldest first.
  //    On a healthy queue (nothing waiting) this is EXACTLY the old query.
  //  - parked pool: runs whose frontier holds a 'waiting' step (approval /
  //    wait / harvest). advanceRun's section 2 re-checks these cheaply every
  //    tick (timers, metric polls, approval timeouts) — no LLM call unless
  //    the wait actually resolves, which is precisely when we WANT one.
  // The partition is one indexed NOT EXISTS / EXISTS over agent_step(run_id);
  // the two sets are disjoint by construction.
  const execPool = await sql<{ id: string; graph: string }[]>`
    /* tick:exec-pool */
    SELECT r.id, r.graph FROM ops.agent_run r
     WHERE r.status = 'running' AND r.graph = ANY(${slugs})
       AND NOT EXISTS (
         SELECT 1 FROM ops.agent_step s
          WHERE s.run_id = r.id AND s.status = 'waiting')
     ORDER BY r.started_at ASC
     LIMIT ${MAX_RUNS_PER_TICK}`;
  const parkedPool = await sql<{ id: string; graph: string }[]>`
    /* tick:parked-pool */
    SELECT r.id, r.graph FROM ops.agent_run r
     WHERE r.status = 'running' AND r.graph = ANY(${slugs})
       AND EXISTS (
         SELECT 1 FROM ops.agent_step s
          WHERE s.run_id = r.id AND s.status = 'waiting')
     ORDER BY r.started_at ASC
     LIMIT ${MAX_PARKED_RECHECKS_PER_TICK}`;

  const token = opts.hermesToken ?? HERMES_TOKEN;
  if (!token) {
    // No token + no runs = dormant, log-only. No token + RUNS WAITING = an
    // incident: someone started a graph the orchestrator cannot execute.
    const inflight = execPool.length + parkedPool.length;
    logger.error("graph_tick_hermes_token_missing", {
      inflight,
      hint: "set HERMES_TASK_TOKEN (and optionally HERMES_TASK_URL) on the worker",
    });
    if (inflight > 0 && !warnedMissingHermes) {
      warnedMissingHermes = true;
      await telegram(
        `🔴 ORQUESTRADOR SEM EXECUTOR: ${inflight} run(s) de graph em andamento mas HERMES_TASK_TOKEN ausente no worker — nada avança até a env existir.`
      );
    }
    return { advanced: 0, parkedChecked: 0, starvedFailed: starved.length, orphanFailed: orphans.length, results: [] };
  }

  const advance = opts.advance ?? advanceRun;
  const ports = opts.ports ?? buildPorts(sql, redis);
  const results: GraphTickResult["results"] = [];
  const visit = async (run: { id: string; graph: string }, pool: "exec" | "parked") => {
    const def = GRAPH_REGISTRY[run.graph];
    if (!def) return; // registry changed underfoot; next deploy's problem
    try {
      const res = await advance(def, run.id, ports);
      results.push({ runId: run.id, graph: run.graph, status: res.status, started: res.started, pool });
      logger.info("graph_tick_advanced", {
        runId: run.id,
        graph: run.graph,
        pool,
        status: res.status,
        started: res.started.join(","),
        notes: res.notes.join("; ").slice(0, 300),
      });
    } catch (err) {
      // One broken run must not stall the others — log loud, keep ticking.
      logger.error("graph_tick_run_error", {
        runId: run.id,
        graph: run.graph,
        pool,
        message: (err as Error).message?.slice(0, 200),
      });
    }
  };
  for (const run of execPool) await visit(run, "exec");
  for (const run of parkedPool) await visit(run, "parked");

  // ---------------------------------------------------------------------------
  // Re-notify pending approvals (founder, 22/08: "o telegram não enviou nada
  // para aprovar"). The original approval message goes out ONCE, when the step
  // is created — which after a recovery burst means 3am, buried in the chat
  // history. Any approval still waiting after 1h gets a fresh message with
  // fresh buttons, at most once per 24h per step (Redis NX). No Redis → skip
  // (a duplicate every 10 minutes would be worse than none).
  // ---------------------------------------------------------------------------
  let renotified = 0;
  try {
    const pending = await sql<{ id: string; run_id: string; graph: string; node: string; started_at: string }[]>`
      /* tick:renotify-select */
      SELECT s.id, s.run_id, r.graph, s.node, s.started_at::text AS started_at
        FROM ops.agent_step s JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.status = 'waiting' AND s.node ILIKE ${"%approval%"}
         AND s.started_at < NOW() - INTERVAL '1 hour'
       ORDER BY s.started_at ASC LIMIT ${20}`;
    for (const a of pending) {
      let first: string | null = null;
      // The 24h gate is PER BOT (22/08: the bot was swapped mid-day and the
      // pending approvals had to reach the NEW bot immediately — a reminder
      // sent by a dead bot must not suppress the living one). The key carries
      // a short hash of the current token, never the token itself.
      const botFp = createHash("sha256")
        .update(process.env["TELEGRAM_BOT_TOKEN"] ?? "none")
        .digest("hex")
        .slice(0, 8);
      try {
        first = (await redis.set(`tg:renotify:${a.id}:${botFp}`, "1", "EX", 24 * 3600, "NX")) as string | null;
      } catch {
        first = null;
      }
      if (first !== "OK") continue;
      // Best-effort content preview: the approval node's upstream artifact
      // (synthesis/finalize) still lives in Redis for 7 days.
      let content = "";
      try {
        const def = GRAPH_REGISTRY[a.graph];
        const contentNodeId = def?.nodes.find((n) => n.id === a.node)?.dependsOn[0] ?? "";
        content = contentNodeId ? ((await redis.get(`graphrun:${a.run_id}:${contentNodeId}`)) ?? "") : "";
      } catch {
        content = "";
      }
      const ageHours = Math.max(1, Math.round((Date.now() - new Date(a.started_at).getTime()) / 3_600_000));
      await telegram(
        [
          `⏰ APROVAÇÃO PENDENTE há ${ageHours}h — ${a.graph}`,
          content ? content.slice(0, 900) : "(conteúdo na mensagem original, mais acima no histórico do chat)",
          `Sem decisão em 96h desde a criação, vira rejeição automática. Este lembrete repete no máximo 1x/dia.`,
        ].join("\n\n"),
        [
          { text: "✅ Aprovar", data: `ap:${a.id}` },
          { text: "❌ Rejeitar", data: `rj:${a.id}` },
        ]
      );
      renotified += 1;
      logger.info("graph_tick_approval_renotified", { stepId: a.id, graph: a.graph, ageHours });
    }
  } catch (err) {
    logger.warn("graph_tick_renotify_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  // Liveness heartbeat for the EXTERNAL vigia (R9/C10 — the 18-20/08 lesson:
  // the watchdog died inside the engine). The tick that reaches this line did
  // its full pass; the CI cron (agent-org-liveness.yml) reads this stamp via
  // GET /api/v1/agent-org/liveness and screams when it goes stale. Best-effort:
  // a Redis blip must not fail the tick — a missing stamp makes the vigia
  // scream, which is exactly the safe direction.
  try {
    await redis.set(GRAPHTICK_LAST_OK_KEY, new Date().toISOString(), "EX", 24 * 3600);
  } catch {
    logger.warn("graph_tick_liveness_stamp_failed", {});
  }

  return {
    advanced: results.filter((r) => r.pool === "exec").length,
    parkedChecked: results.filter((r) => r.pool === "parked").length,
    starvedFailed: starved.length,
    orphanFailed: orphans.length,
    results,
  };
}
