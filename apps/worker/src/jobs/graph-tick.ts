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
import { buildProspectBatchBlock } from "../lib/prospect-probe";
import { crmNoteFor } from "../../../api/src/lib/prospecting";
import { PLAN_PRICE_USD } from "../../../../packages/shared/src/plan-limits";
import { createHash } from "node:crypto";
import {
  advanceRun,
  GRAPH_REGISTRY,
  CIRCUIT_BREAKER_THRESHOLD,
  channelDailyCap,
  type GraphRunnerPorts,
  type RunRow,
  type StepRow,
  type TelegramButton,
  INCIDENT_LESSON_PREFIX,
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
 * 5.F.6 circuit breaker per Postiz channel. `circuit:<channel>` holds the
 * CONSECUTIVE publish-failure count (INCR on failure, DEL on success); open =
 * count >= CIRCUIT_BREAKER_THRESHOLD. The key's TTL is the half-open re-test
 * window: while parked publishes stop producing new failures, the counter
 * expires after 6h and the next tick releases ONE wave of parked publishes as
 * a probe — success closes the circuit for good, failure re-opens it. The
 * founder healing the channel in Postiz therefore needs no manual reset.
 * `circuit:alarm:<channel>` is the NX alarm gate (1 Telegram / 6h / channel)
 * — the exact hermes-fallback alarm pattern.
 */
const CIRCUIT_RETEST_WINDOW_S = 6 * 3600;
const CIRCUIT_ALARM_WINDOW_S = 6 * 3600;
const circuitKey = (channel: string) => `circuit:${channel.toLowerCase()}`;
const circuitAlarmKey = (channel: string) => `circuit:alarm:${channel.toLowerCase()}`;
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

// ---------------------------------------------------------------------------
// 5.F.5 — cadência auto-ajustada, a camada MEDIDA (founder-gated).
// A válvula (channelDailyCap) continua ESTÁTICA no código, com override por
// env CHANNEL_DAILY_CAP_<CANAL>. O que este bloco adiciona é a MEDIÇÃO: por
// canal, posts/dia vs média de resultado por post — 100% SQL/código (o modelo
// nunca toca nestes números: a seção viaja VERBATIM do snapshot para o report
// de segunda, sem passar pelo compose). A recomendação fecha o loop; o gate é
// o founder mudando a env. NADA aqui aplica cap sozinho — cap auto-aplicado
// seria auto-ativação, proibida pelas regras da casa.
// ---------------------------------------------------------------------------

/** Amostra mínima por canal para recomendar algo (abaixo disso: dito, sem estatística inventada). */
export const CADENCE_MIN_SAMPLE = 10;
/** Queda relativa da média-por-post (pico vs base) que sustenta recomendar um cap menor. */
export const CADENCE_DROP_THRESHOLD = 0.3;
/** Dias após o publish em que o resultado colhido conta para aquele dia de publicação. */
export const CADENCE_OUTCOME_WINDOW_DAYS = 3;
/**
 * Canal → prefixo de métrica em ops.agent_outcome (o que o coletor da VPS
 * escreve). Mapa EXPLÍCITO de propósito: derivar do registry seria errado
 * (daily-video publica em linkedin mas colhe youtube_views). Canal fora do
 * mapa = "sem métrica mapeada", nunca um palpite.
 */
export const CHANNEL_METRIC_PREFIX: Record<string, string> = {
  linkedin: "linkedinpage_",
  x: "x_",
  instagram: "instagramstandalone_",
  tiktok: "tiktok_",
  youtube: "youtube_",
};

/**
 * A seção de cadência do relatório de segunda — PURA (exportada para teste
 * unitário direto). Entra: publishes bem-sucedidos (summary com channel=) e
 * outcomes crus da janela. Sai: uma linha de RECOMENDAÇÃO por canal, cada uma
 * nomeando a ação do founder (env CHANNEL_DAILY_CAP_<CANAL>). Guardas:
 *  - < CADENCE_MIN_SAMPLE posts → "sem amostra suficiente (N posts)";
 *  - canal sem métrica mapeada → dito, sem recomendação;
 *  - sem variação de posts/dia na janela → nada a comparar, dito;
 *  - média-base sem valor utilizável → dito.
 * String vazia quando não há publish nenhum (o runner vira SEM DADOS).
 */
export function computeCadenceSection(
  pubs: Array<{ summary: string; started_at: string }>,
  outcomes: Array<{ metric: string; value_after: string | null; measured_at: string }>,
  days: number
): string {
  const byChannel = new Map<string, Map<string, number>>(); // canal → dia UTC → posts
  for (const p of pubs) {
    const ch = /channel=([a-z0-9_-]+)/i.exec(p.summary)?.[1]?.toLowerCase();
    if (!ch) continue;
    const day = p.started_at.slice(0, 10);
    const m = byChannel.get(ch) ?? new Map<string, number>();
    m.set(day, (m.get(day) ?? 0) + 1);
    byChannel.set(ch, m);
  }
  if (byChannel.size === 0) return "";

  const lines: string[] = [
    `VALVULA DE CADENCIA — camada medida (5.F.5, ${days}d; calculo 100% por codigo, o modelo nao toca nestes numeros):`,
    `O cap segue estatico no codigo. NADA muda sozinho: agir = founder definir env CHANNEL_DAILY_CAP_<CANAL> (0 ou negativo = sem cap).`,
    ``,
  ];
  for (const [ch, dayCounts] of [...byChannel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const total = [...dayCounts.values()].reduce((a, b) => a + b, 0);
    const cap = channelDailyCap(ch);
    const capStr = cap === null ? "sem cap" : `${cap}/dia`;
    if (total < CADENCE_MIN_SAMPLE) {
      lines.push(
        `- ${ch}: sem amostra suficiente (${total} post(s) em ${days}d; minimo ${CADENCE_MIN_SAMPLE}) — cap atual mantido (${capStr}), sem estatistica inventada.`
      );
      continue;
    }
    const prefix = CHANNEL_METRIC_PREFIX[ch];
    if (!prefix) {
      lines.push(`- ${ch}: ${total} posts, mas sem metrica mapeada para o canal — sem recomendacao honesta possivel.`);
      continue;
    }
    const chOutcomes = outcomes.filter((o) => o.metric.startsWith(prefix) && o.value_after != null);
    // Média de resultado POR POST nos dias com k posts: para cada dia de
    // publicação, soma dos outcomes do canal medidos em (dia, dia+3] ÷ k.
    const perK = new Map<number, { nDays: number; perPostSum: number }>();
    for (const [day, k] of dayCounts) {
      const dayStart = Date.parse(`${day}T00:00:00Z`);
      const windowEnd = dayStart + CADENCE_OUTCOME_WINDOW_DAYS * 86_400_000;
      const harvested = chOutcomes
        .filter((o) => {
          const t = Date.parse(o.measured_at);
          return t > dayStart && t <= windowEnd;
        })
        .reduce((acc, o) => acc + Number(o.value_after), 0);
      const bucket = perK.get(k) ?? { nDays: 0, perPostSum: 0 };
      bucket.nDays += 1;
      bucket.perPostSum += harvested / k;
      perK.set(k, bucket);
    }
    const ks = [...perK.keys()].sort((a, b) => a - b);
    const kMin = ks[0]!;
    const kMax = ks[ks.length - 1]!;
    if (kMin === kMax) {
      lines.push(
        `- ${ch}: ${total} posts, sempre ${kMax}/dia na janela — sem variacao de cadencia para comparar; cap atual mantido (${capStr}).`
      );
      continue;
    }
    const avgOf = (k: number): number => {
      const b = perK.get(k)!;
      return b.perPostSum / b.nDays;
    };
    const base = avgOf(kMin);
    const top = avgOf(kMax);
    if (base <= 0) {
      lines.push(
        `- ${ch}: ${total} posts, mas a metrica ${prefix}* nao trouxe valor utilizavel na janela — sem recomendacao honesta possivel.`
      );
      continue;
    }
    const drop = 1 - top / base;
    if (drop >= CADENCE_DROP_THRESHOLD) {
      const pct = Math.round(drop * 100);
      lines.push(
        `- ${ch}: dados sugerem ${kMax - 1}/dia em vez de ${capStr} — media por post cai ${pct}% nos dias com ${kMax} posts (${Math.round(base)} → ${Math.round(top)} por post; ${total} posts em ${days}d). Agir = env CHANNEL_DAILY_CAP_${ch.toUpperCase()}=${kMax - 1}.`
      );
    } else {
      lines.push(
        `- ${ch}: cap atual (${capStr}) mantem — media por post estavel entre ${kMin} e ${kMax} posts/dia (variacao ${Math.round(Math.max(drop, 0) * 100)}%; ${total} posts em ${days}d).`
      );
    }
  }
  return lines.join("\n");
}

/**
 * 5.F.7 — the active incident lessons (approved postmortems → ops.memory_lesson
 * rows starting with INCIDENT_LESSON_PREFIX), rendered for the 'ops' snapshot.
 * Newest 3 rows, size-capped. Fail-open by contract: missing table (42P01,
 * migration 5.F.1 pending) or any read blip → no section at all, the snapshot
 * stays exactly as before — never a placeholder, never a broken digest.
 */
async function incidentLessonsSection(sql: postgres.Sql): Promise<string[]> {
  try {
    const rows = await sql<{ lessons: string; approved_at: string }[]>`
      /* snap:incident-lessons */
      SELECT lessons, approved_at::text AS approved_at
        FROM ops.memory_lesson
       WHERE lessons LIKE ${INCIDENT_LESSON_PREFIX + "%"}
       ORDER BY approved_at DESC
       LIMIT 3`;
    if (rows.length === 0) return [];
    const lines = ["", "Licoes de incidentes ativas (postmortems aprovados — ops.memory_lesson):"];
    for (const r of rows) {
      // Each row is already "PREFIX (postmortem aprovado <date>):\n- NUNCA ...".
      // Cap at 8 lines/row so a malformed giant row can never flood the digest.
      for (const l of r.lessons.split("\n").slice(0, 8)) lines.push(`  ${l.slice(0, 300)}`);
    }
    return lines;
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code !== "42P01") {
      logger.warn("incident_lessons_read_failed", { code, message: (err as Error).message?.slice(0, 160) });
    }
    return [];
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
    // 5.F.7 — active incident lessons: the approved-postmortem lessons the
    // store-lessons node wrote into ops.memory_lesson (INCIDENT_LESSON_PREFIX
    // rows). They are OPS lessons, so they surface to the ops brain (the
    // daily-watchdog and the weekly report read this snapshot) — the
    // marketing critics' [__memory__] deliberately excludes them.
    lines.push(...(await incidentLessonsSection(sql)));
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

  if (source === "memory") {
    // 5.F.1 — the memory-consolidation graph's fuel: the last ~30 days of REAL
    // outcomes as AGGREGATED FACTS, per channel. Aggregation is SQL/code here;
    // the compose LLM downstream only WRITES lessons from these lines ("vigia
    // também mente": the model never guesses schema and never invents a
    // number). Everything below lives in ops.* — slugs, statuses, bounded
    // summaries and numbers; no tenant data, no PII.
    const pubs = await sql<{ graph: string; summary: string; started_at: string }[]>`
      /* snap:memory-publishes */
      SELECT r.graph, s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.status = 'succeeded'
         AND s.summary LIKE 'published via%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at DESC
       LIMIT 80`;

    const metrics = await sql<
      { metric: string; n: string; total: string | null; avg: string | null; last: string }[]
    >`
      /* snap:memory-metrics */
      SELECT metric,
             COUNT(*)::text AS n,
             SUM(value_after)::text AS total,
             AVG(value_after)::text AS avg,
             MAX(measured_at)::text AS last
        FROM ops.agent_outcome
       WHERE measured_at >= NOW() - make_interval(days => ${d})
       GROUP BY metric
       ORDER BY metric`;

    // Founder REJECTIONS with the literal reason the Telegram webhook stored
    // ("rejected: <why>") — the strongest lesson signal there is.
    const rejections = await sql<{ graph: string; summary: string; started_at: string }[]>`
      /* snap:memory-rejections */
      SELECT r.graph, s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.status = 'failed'
         AND s.summary LIKE 'rejected:%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at DESC
       LIMIT 30`;

    // Approvals that timed out (timeout = rejection-by-silence): a channel the
    // founder keeps NOT deciding on is itself a lesson.
    const timeouts = await sql<{ graph: string; n: string }[]>`
      /* snap:memory-timeouts */
      SELECT r.graph, COUNT(*)::text AS n
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.summary LIKE 'approval timed out%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       GROUP BY r.graph
       ORDER BY COUNT(*) DESC`;

    // Closed verdicts — the durable trace of every harvest→verdict loop
    // ("verdict <metric>: total=X n=Y" / "SEM DADO").
    const verdicts = await sql<{ graph: string; summary: string; started_at: string }[]>`
      /* snap:memory-verdicts */
      SELECT r.graph, s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.node = 'verdict'
         AND s.status = 'succeeded'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at DESC
       LIMIT 40`;

    if (
      pubs.length === 0 &&
      metrics.length === 0 &&
      rejections.length === 0 &&
      timeouts.length === 0 &&
      verdicts.length === 0
    ) {
      return ""; // honest empty — the runner turns this into SEM DADOS
    }

    // Channel attribution: the publish summary carries "channel=<ch>" (the
    // cadence valve's own marker) — parse it; fall back to the graph slug.
    const channelOf = (summary: string, graph: string): string => {
      const m = /channel=([a-z0-9_-]+)/i.exec(summary);
      return m?.[1]?.toLowerCase() ?? graph;
    };
    const pubsByChannel = new Map<string, Map<string, number>>();
    for (const p of pubs) {
      const ch = channelOf(p.summary, p.graph);
      const perGraph = pubsByChannel.get(ch) ?? new Map<string, number>();
      perGraph.set(p.graph, (perGraph.get(p.graph) ?? 0) + 1);
      pubsByChannel.set(ch, perGraph);
    }

    const lines: string[] = [
      `HISTORICO PARA CONSOLIDACAO DE MEMORIA (ops.*, ${d}d — fatos agregados por codigo; nada abaixo foi estimado):`,
    ];
    if (pubsByChannel.size > 0) {
      lines.push(``, `PUBLICACOES CONCLUIDAS (por canal):`);
      for (const [ch, perGraph] of pubsByChannel) {
        const total = [...perGraph.values()].reduce((a, b) => a + b, 0);
        const detail = [...perGraph.entries()].map(([g, n]) => `${g}×${n}`).join(", ");
        lines.push(`- ${ch}: ${total} publicacao(oes) (${detail})`);
      }
    }
    if (metrics.length > 0) {
      lines.push(``, `METRICAS COLHIDAS (ops.agent_outcome, por metrica):`);
      for (const m of metrics) {
        const avg = m.avg != null ? Math.round(Number(m.avg)) : "?";
        lines.push(
          `- ${m.metric}: n=${m.n} · total=${m.total ?? "?"} · media=${avg} · ultima ${m.last.slice(0, 10)}`
        );
      }
    }
    if (rejections.length > 0) {
      lines.push(``, `REJEICOES DO FOUNDER (motivo literal registrado — o sinal mais forte):`);
      for (const rj of rejections) {
        lines.push(`- ${rj.started_at.slice(0, 10)} (${rj.graph}): ${rj.summary.replace(/^rejected:\s*/, "")}`);
      }
    }
    if (timeouts.length > 0) {
      lines.push(``, `APROVACOES EXPIRADAS POR SILENCIO (timeout = rejeicao):`);
      for (const t of timeouts) lines.push(`- ${t.graph}: ${t.n} aprovacao(oes) expiraram sem decisao`);
    }
    if (verdicts.length > 0) {
      lines.push(``, `VEREDITOS FECHADOS (o loop leu o proprio resultado):`);
      for (const v of verdicts) lines.push(`- ${v.started_at.slice(0, 10)} (${v.graph}): ${v.summary}`);
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

  if (source === "tuning") {
    // 5.F.2 — o combustível do prompt-tuner: os últimos ~21d de sinal REAL
    // sobre o que os grafos produzem, agregado por SQL POR GRAPH/área de
    // prompt. O compose downstream só ESCREVE a proposta a partir destas
    // linhas ("vigia também mente": o modelo nunca conta nem agrega). Tudo
    // vem de ops.* — slugs, statuses, resumos capados e números; sem PII.
    const verdicts = await sql<{ graph: string; summary: string; started_at: string }[]>`
      /* snap:tuning-verdicts */
      SELECT r.graph, s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.node = 'verdict'
         AND s.status = 'succeeded'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at DESC
       LIMIT 40`;

    // Rejeições com o motivo LITERAL do founder — o sinal mais forte que um
    // afinador de prompts pode ter.
    const rejections = await sql<{ graph: string; summary: string; started_at: string }[]>`
      /* snap:tuning-rejections */
      SELECT r.graph, s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.status = 'failed'
         AND s.summary LIKE 'rejected:%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at DESC
       LIMIT 30`;

    // Contagem de rejeições POR GRAPH — a agregação é SQL, o modelo só lê.
    const rejectionCounts = await sql<{ graph: string; n: string }[]>`
      /* snap:tuning-rejection-counts */
      SELECT r.graph, COUNT(*)::text AS n
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.status = 'failed'
         AND s.summary LIKE 'rejected:%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       GROUP BY r.graph
       ORDER BY COUNT(*) DESC`;

    // Timeouts de aprovação por graph (timeout = rejeição por silêncio).
    const timeouts = await sql<{ graph: string; n: string }[]>`
      /* snap:tuning-timeouts */
      SELECT r.graph, COUNT(*)::text AS n
        FROM ops.agent_step s
        JOIN ops.agent_run r ON r.id = s.run_id
       WHERE s.summary LIKE 'approval timed out%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       GROUP BY r.graph
       ORDER BY COUNT(*) DESC`;

    // Overrides já ativos — para o tuner saber o estado atual e nunca propor
    // no escuro. Fail-soft: tabela ausente = linha honesta, nunca um throw
    // (o snapshot inteiro não pode morrer por causa desta seção).
    let overrides: Array<{ prompt_key: string; body_len: string; approved_at: string }> = [];
    let overridesUnavailable = false;
    try {
      overrides = await sql<{ prompt_key: string; body_len: string; approved_at: string }[]>`
        /* snap:tuning-overrides */
        SELECT DISTINCT ON (prompt_key)
               prompt_key,
               LENGTH(body)::text AS body_len,
               approved_at::text AS approved_at
          FROM ops.prompt_override
         ORDER BY prompt_key, approved_at DESC`;
    } catch (err) {
      overridesUnavailable = true;
      const code = (err as { code?: string }).code ?? "";
      if (code !== "42P01") {
        logger.warn("snapshot_tuning_overrides_unavailable", { code, message: (err as Error).message?.slice(0, 160) });
      }
    }

    if (verdicts.length === 0 && rejections.length === 0 && timeouts.length === 0 && overrides.length === 0) {
      return ""; // honest empty — the runner turns this into SEM DADOS
    }

    const lines: string[] = [
      `EVIDENCIA PARA TUNING DE PROMPTS (ops.*, ${d}d — fatos agregados por codigo; nada abaixo foi estimado):`,
    ];
    if (verdicts.length > 0) {
      lines.push(``, `VEREDITOS FECHADOS (por graph — o loop leu o proprio resultado):`);
      for (const v of verdicts) lines.push(`- ${v.started_at.slice(0, 10)} (${v.graph}): ${v.summary}`);
    }
    if (rejectionCounts.length > 0) {
      lines.push(``, `REJEICOES DO FOUNDER POR GRAPH (contagem por SQL):`);
      for (const rc of rejectionCounts) lines.push(`- ${rc.graph}: ${rc.n} rejeicao(oes)`);
    }
    if (rejections.length > 0) {
      lines.push(``, `REJEICOES DO FOUNDER (motivo literal registrado — o sinal mais forte):`);
      for (const rj of rejections) {
        lines.push(`- ${rj.started_at.slice(0, 10)} (${rj.graph}): ${rj.summary.replace(/^rejected:\s*/, "")}`);
      }
    }
    if (timeouts.length > 0) {
      lines.push(``, `APROVACOES EXPIRADAS POR SILENCIO POR GRAPH (timeout = rejeicao):`);
      for (const t of timeouts) lines.push(`- ${t.graph}: ${t.n} aprovacao(oes) expiraram sem decisao`);
    }
    if (overrides.length > 0) {
      lines.push(``, `OVERRIDES DE PROMPT JA ATIVOS (ops.prompt_override — linha mais nova por chave):`);
      for (const o of overrides) {
        const state = Number(o.body_len) === 0 ? "body vazio = revertido ao prompt estatico" : `${o.body_len} chars`;
        lines.push(`- ${o.prompt_key}: desde ${o.approved_at.slice(0, 10)} (${state})`);
      }
    } else if (overridesUnavailable) {
      lines.push(``, `OVERRIDES DE PROMPT: tabela ops.prompt_override indisponivel neste deploy — nenhum override ativo.`);
    } else {
      lines.push(``, `OVERRIDES DE PROMPT: nenhum ativo — todos os grafos rodam nos prompts estaticos do codigo.`);
    }
    return lines.join("\n");
  }

  if (source === "cadence") {
    // 5.F.5 — a válvula medida. DUAS queries marcadas trazem os fatos crus
    // (publishes com channel= no summary; outcomes da janela); TODO o cálculo
    // e a redação das recomendações são código puro (computeCadenceSection).
    // Este texto vai VERBATIM ao report de segunda — nunca passa pelo compose.
    const pubs = await sql<{ summary: string; started_at: string }[]>`
      /* snap:cadence-publishes */
      SELECT s.summary, s.started_at::text AS started_at
        FROM ops.agent_step s
       WHERE s.status = 'succeeded'
         AND s.summary LIKE 'published via%'
         AND s.started_at >= NOW() - make_interval(days => ${d})
       ORDER BY s.started_at
       LIMIT 500`;
    const outcomes = await sql<{ metric: string; value_after: string | null; measured_at: string }[]>`
      /* snap:cadence-outcomes */
      SELECT metric, value_after::text AS value_after, measured_at::text AS measured_at
        FROM ops.agent_outcome
       WHERE measured_at >= NOW() - make_interval(days => ${d})
       ORDER BY measured_at
       LIMIT 2000`;
    return computeCadenceSection(pubs, outcomes, d);
  }

  if (source === "incidents") {
    // 5.D.2: the postmortem's evidence node. The SAME SQL detection the daily
    // cron ran to decide "there IS an incident" re-aggregates the facts here,
    // at node time, into the block the compose step is allowed to use. Every
    // number in the draft comes from these queries; the LLM only writes.
    return incidentEvidenceBlock(await detectIncidentSignatures(sql, d * 24));
  }

  // Unknown source: honest empty, not a throw — the graph author named it, the
  // validator required it non-empty, so this is a typo, not an outage.
  return "";
}

// ---------------------------------------------------------------------------
// incident-postmortem (5.D.2) — DETECTION IS SQL/CODE, NEVER AN LLM GUESS
// ("o vigia também mente": agregação é query, o modelo só redige).
//
// Three incident signatures, straight from the week the founder wrote three
// postmortems by hand (18-22/08):
//  1. failure-cluster  — >= FAILURE_CLUSTER_MIN steps falhados no MESMO graph
//     em 24h (o apagão de engines de 21/08 era isso, em todo graph);
//  2. reconciliation   — QUALQUER step '__starved__'/'__orphan__' na janela
//     (a fome de 18-20/08 e os zumbis fora do registry; 1 já é incidente);
//  3. approval-timeout-mass — >= APPROVAL_TIMEOUT_MASS_MIN aprovações
//     expiradas por silêncio na janela (aprovações apodrecendo em massa foi
//     o tampão da fome de 18/08);
//  4. approved-content-lost — publish falhado num run com approval succeeded,
//     n=1 POR DESENHO (5.D.5, sáb 29/08: LinkedIn aprovado 10h50 perdido em
//     crash do worker — o cluster de 3+ nunca veria).
// Rejeições do founder ("rejected: ...") NÃO são incidente — são decisão
// humana — e as falhas de approval são tratadas só pela assinatura 3, então a
// assinatura 1 exclui nodes de approval e os steps sintéticos de
// reconciliação (senão o mesmo fato contaria duas vezes).
//
// The thresholds live in TS (not in SQL HAVING) so the unit tests pin the
// REAL decision logic: 2 failures ≠ incident, 3 = incident.
// ---------------------------------------------------------------------------

/** Steps falhados no mesmo graph/24h a partir do qual é incidente. */
export const FAILURE_CLUSTER_MIN = 3;
/** Aprovações expiradas na janela a partir do qual é "em massa". */
export const APPROVAL_TIMEOUT_MASS_MIN = 3;
/** Summary do step auditável gravado num dia SEM incidente (zero Telegram). */
export const QUIET_SUMMARY = "sem incidente nas ultimas 24h (scan SQL: 0 assinaturas)";
/** Cap de cada resumo literal de erro que entra na evidência. */
const ERROR_SAMPLE_CAP = 160;

export interface IncidentSignature {
  kind:
    | "failure-cluster"
    | "reconciliation"
    | "approval-timeout-mass"
    | "approved-content-lost";
  /** Graph afetado (failure-cluster) ou null nas assinaturas cross-graph. */
  graph: string | null;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Fatos literais, com tamanho capado (erros / graphs afetados). */
  detail: string;
}

/**
 * Scan the last `hours` of ops.* for incident signatures. Pure aggregation:
 * counts, first/last timestamps, affected graphs, literal error summaries
 * capped at ERROR_SAMPLE_CAP chars. Returns [] on a healthy window.
 */
export async function detectIncidentSignatures(
  sql: postgres.Sql,
  hours = 24
): Promise<IncidentSignature[]> {
  const h = Math.min(24 * 7, Math.max(1, Math.round(hours) || 24));
  const out: IncidentSignature[] = [];

  // 1) Failure clusters per graph. Approval nodes are excluded (rejection is
  // a human decision; timeout is signature 3) and so are the synthetic
  // reconciliation steps (signature 2 owns them).
  // 5.F.6 INTERPLAY WITH THE RETRY BUDGET — decision documented here and
  // pinned by test: the runner now writes one failed step PER ATTEMPT of the
  // same node (default budget 2 → up to 3 failed rows for ONE flaky node), so
  // counting rows would let a single node fake a >=3 cluster. Two guards:
  //  (a) count per (run, node), never per attempt — COUNT(DISTINCT run:node);
  //  (b) an attempt a LATER retry of the same (run, node) SAVED (a succeeded
  //      sibling at or after it) is not failure-cluster noise at all — the
  //      self-healing worked, the incident is the one that STAYS failed.
  const clusters = await sql<{ graph: string; fails: string; first_at: string; last_at: string }[]>`
    /* pm:failed-clusters */
    SELECT r.graph,
           COUNT(DISTINCT s.run_id::text || ':' || s.node)::text AS fails,
           MIN(s.started_at)::text AS first_at,
           MAX(s.started_at)::text AS last_at
      FROM ops.agent_step s
      JOIN ops.agent_run r ON r.id = s.run_id
     WHERE s.status = 'failed'
       AND s.started_at >= NOW() - make_interval(hours => ${h})
       AND s.node NOT IN ('__starved__', '__orphan__')
       AND NOT (s.node ILIKE '%approval%')
       AND NOT EXISTS (
             SELECT 1 FROM ops.agent_step ok
              WHERE ok.run_id = s.run_id
                AND ok.node = s.node
                AND ok.status = 'succeeded'
                AND ok.started_at >= s.started_at)
     GROUP BY r.graph
     ORDER BY COUNT(DISTINCT s.run_id::text || ':' || s.node) DESC
     LIMIT 10`;
  const hot = clusters.filter((c) => Number(c.fails) >= FAILURE_CLUSTER_MIN);
  if (hot.length > 0) {
    // Literal error samples (capped) for the hot graphs only — the draft may
    // quote these verbatim; it may not paraphrase them into invention.
    const samples = await sql<{ graph: string; summary: string }[]>`
      /* pm:failed-samples */
      SELECT graph, summary FROM (
        SELECT r.graph,
               LEFT(COALESCE(s.summary, 'sem resumo'), ${ERROR_SAMPLE_CAP}) AS summary,
               ROW_NUMBER() OVER (PARTITION BY r.graph ORDER BY s.started_at DESC) AS rn
          FROM ops.agent_step s
          JOIN ops.agent_run r ON r.id = s.run_id
         WHERE s.status = 'failed'
           AND s.started_at >= NOW() - make_interval(hours => ${h})
           AND r.graph = ANY(${hot.map((c) => c.graph)})
           AND s.node NOT IN ('__starved__', '__orphan__')
           AND NOT (s.node ILIKE '%approval%')
           AND NOT EXISTS (
                 SELECT 1 FROM ops.agent_step ok
                  WHERE ok.run_id = s.run_id
                    AND ok.node = s.node
                    AND ok.status = 'succeeded'
                    AND ok.started_at >= s.started_at)
      ) ranked
      WHERE rn <= 3`;
    const byGraph = new Map<string, string[]>();
    for (const smp of samples) {
      const list = byGraph.get(smp.graph) ?? [];
      list.push(`"${smp.summary}"`);
      byGraph.set(smp.graph, list);
    }
    for (const c of hot) {
      out.push({
        kind: "failure-cluster",
        graph: c.graph,
        count: Number(c.fails),
        firstAt: c.first_at,
        lastAt: c.last_at,
        detail: `erros: ${(byGraph.get(c.graph) ?? ["sem resumo"]).join(" | ")}`,
      });
    }
  }

  // 2) Starved/orphan reconciliations — ONE is already an incident: the tick
  // only writes these steps when a run died without ever being served.
  const recon = await sql<{ node: string; n: string; first_at: string; last_at: string; graphs: string }[]>`
    /* pm:reconciliations */
    SELECT s.node,
           COUNT(*)::text AS n,
           MIN(s.started_at)::text AS first_at,
           MAX(s.started_at)::text AS last_at,
           STRING_AGG(DISTINCT r.graph, ', ') AS graphs
      FROM ops.agent_step s
      JOIN ops.agent_run r ON r.id = s.run_id
     WHERE s.node IN ('__starved__', '__orphan__')
       AND s.started_at >= NOW() - make_interval(hours => ${h})
     GROUP BY s.node`;
  for (const rc of recon) {
    if (Number(rc.n) < 1) continue;
    out.push({
      kind: "reconciliation",
      graph: null,
      count: Number(rc.n),
      firstAt: rc.first_at,
      lastAt: rc.last_at,
      detail: `${rc.node} · graphs: ${rc.graphs || "?"}`,
    });
  }

  // 3) Approval timeouts en masse. The runner writes the exact summary prefix
  // 'approval timed out' (graph-runner.ts); rejections ('rejected: ...') never
  // match — a human's no is not an incident.
  const timeouts = await sql<{ n: string; first_at: string | null; last_at: string | null; graphs: string | null }[]>`
    /* pm:approval-timeouts */
    SELECT COUNT(*)::text AS n,
           MIN(s.started_at)::text AS first_at,
           MAX(s.started_at)::text AS last_at,
           STRING_AGG(DISTINCT r.graph, ', ') AS graphs
      FROM ops.agent_step s
      JOIN ops.agent_run r ON r.id = s.run_id
     WHERE s.status = 'failed'
       AND s.node ILIKE ${"%approval%"}
       AND s.summary LIKE ${"approval timed out%"}
       AND s.started_at >= NOW() - make_interval(hours => ${h})`;
  const t = timeouts[0];
  if (t && Number(t.n) >= APPROVAL_TIMEOUT_MASS_MIN) {
    out.push({
      kind: "approval-timeout-mass",
      graph: null,
      count: Number(t.n),
      firstAt: t.first_at,
      lastAt: t.last_at,
      detail: `graphs: ${t.graphs ?? "?"}`,
    });
  }

  // 4) Approved content lost — n=1 BY DESIGN (5.D.5, caso real de sáb 29/08:
  // LinkedIn aprovado pelo founder às 10h50 sumiu num crash do worker no
  // publish; o cluster de 3+ nunca dispararia). Um publish que falha DEPOIS
  // do sim humano é sempre incidente: o founder gastou um clique e o público
  // não recebeu nada. Especialização da assinatura 1 (um cluster grande de
  // publishes mostra as duas — fatos distintos, não contagem dupla).
  const lost = await sql<{ graph: string; n: string; first_at: string; last_at: string; sample: string }[]>`
    /* pm:approved-lost */
    -- 5.F.6: um publish que uma retry POSTERIOR do mesmo (run, node) salvou
    -- (step succeeded igual/depois dele) NAO e conteudo perdido — a auto-cura
    -- funcionou. Só o que TERMINA falhado dispara; e a contagem é por
    -- (run, node), nunca por tentativa (o retry escreve um step por attempt).
    SELECT r.graph,
           COUNT(DISTINCT s.run_id::text || ':' || s.node)::text AS n,
           MIN(s.started_at)::text AS first_at,
           MAX(s.started_at)::text AS last_at,
           LEFT(MAX(COALESCE(s.summary, 'sem resumo')), ${ERROR_SAMPLE_CAP}) AS sample
      FROM ops.agent_step s
      JOIN ops.agent_run r ON r.id = s.run_id
     WHERE s.status = 'failed'
       AND s.node ILIKE '%publish%'
       AND s.started_at >= NOW() - make_interval(hours => ${h})
       AND EXISTS (
             SELECT 1 FROM ops.agent_step a
              WHERE a.run_id = s.run_id
                AND a.node ILIKE '%approval%'
                AND a.status = 'succeeded'
           )
       AND NOT EXISTS (
             SELECT 1 FROM ops.agent_step ok
              WHERE ok.run_id = s.run_id
                AND ok.node = s.node
                AND ok.status = 'succeeded'
                AND ok.started_at >= s.started_at)
     GROUP BY r.graph
     ORDER BY COUNT(DISTINCT s.run_id::text || ':' || s.node) DESC
     LIMIT 10`;
  for (const l of lost) {
    if (Number(l.n) < 1) continue;
    out.push({
      kind: "approved-content-lost",
      graph: l.graph,
      count: Number(l.n),
      firstAt: l.first_at,
      lastAt: l.last_at,
      detail: `publish falhou APOS aprovacao do founder · ultimo erro: "${l.sample}"`,
    });
  }

  return out;
}

/**
 * Render the detected signatures as the [evidence] block the compose prompt
 * reads. Pure formatter: every number in it arrived from SQL. "" when the
 * window is healthy — the runner turns that into its honest SEM DADOS marker.
 */
export function incidentEvidenceBlock(signatures: IncidentSignature[]): string {
  if (signatures.length === 0) return "";
  const label: Record<IncidentSignature["kind"], string> = {
    "failure-cluster": "CLUSTER DE FALHAS",
    reconciliation: "RECONCILIACAO (run morta sem ser servida)",
    "approval-timeout-mass": "TIMEOUTS DE APROVACAO EM MASSA",
    "approved-content-lost": "CONTEUDO APROVADO PERDIDO (publish falhou apos o sim do founder)",
  };
  const lines: string[] = [`ASSINATURAS DE INCIDENTE (scan SQL sobre ops.*, ultimas 24h):`, ``];
  for (const s of signatures) {
    const where = s.graph ? ` em ${s.graph}` : "";
    const window = s.firstAt && s.lastAt ? ` · janela ${s.firstAt} → ${s.lastAt} (UTC)` : "";
    lines.push(`- ${label[s.kind]}${where}: ${s.count} ocorrencia(s)${window} · ${s.detail}`);
  }
  lines.push(
    ``,
    `(Todo numero acima veio de agregacao SQL sobre ops.agent_step/ops.agent_run — nada foi estimado. O rascunho so pode usar o que esta neste bloco.)`
  );
  return lines.join("\n");
}

/**
 * 5.D.2 daily scan (07:00 UTC): decide by SQL whether the last 24h carry an
 * incident signature and, ONLY then, start an incident-postmortem run for the
 * 10-min tick to advance (evidence → compose → founder gate → report).
 *
 * Quiet day: NO run of the graph starts, NO Telegram — a daily 🟢 would train
 * the founder to ignore the channel (the watchdog already reports daily). The
 * scan still leaves an AUDITABLE record ("todo job auditável"): one already-
 * succeeded ops.agent_run row with a single '__quiet__' step saying "sem
 * incidente nas últimas 24h". Verifiable in the substrate, invisible on the
 * phone.
 *
 * No executor (HERMES_TASK_TOKEN missing) + an incident found is itself an
 * incident: scream on Telegram with the unlocking action, start nothing (a
 * run no tick can execute would just rot into the starved pool).
 */
export async function runIncidentPostmortemDaily(
  sql: postgres.Sql,
  opts: { hermesToken?: string; telegram?: (text: string) => Promise<void> } = {}
): Promise<{ started: string[]; skipped: string[]; quiet: boolean; signatures: IncidentSignature[] }> {
  const telegram = opts.telegram ?? sendTelegram;
  const graph = "incident-postmortem";

  // Idempotent per calendar day: a worker restart or a second instance must
  // not double-scan (same look-back pattern as startBrainRuns). ANY run in
  // the window counts — including a quiet-day record.
  const recent = await sql<{ id: string }[]>`
    /* pm:recent-run */
    SELECT id FROM ops.agent_run
     WHERE graph = ${graph}
       AND started_at >= NOW() - make_interval(hours => ${20})
     LIMIT 1`;
  if (recent.length > 0) {
    return { started: [], skipped: [graph], quiet: false, signatures: [] };
  }

  const signatures = await detectIncidentSignatures(sql, 24);

  if (signatures.length === 0) {
    // Quiet day: auditable record, zero noise, zero LLM spend.
    const rows = await sql<{ id: string }[]>`
      /* pm:quiet-run */
      INSERT INTO ops.agent_run (graph, trigger, vp_owner, status, ended_at)
      VALUES (${graph}, 'cron:incident-postmortem', ${GRAPH_REGISTRY[graph]?.vpOwner ?? "ceo"}, 'succeeded', NOW())
      RETURNING id`;
    await sql`
      /* pm:quiet-step */
      INSERT INTO ops.agent_step (run_id, node, status, summary)
      VALUES (${rows[0]!.id}::uuid, '__quiet__', 'succeeded', ${QUIET_SUMMARY})`;
    logger.info("incident_scan_quiet", { runId: rows[0]!.id });
    return { started: [], skipped: [], quiet: true, signatures: [] };
  }

  const kinds = signatures.map((s) => `${s.kind}${s.graph ? `(${s.graph})` : ""}×${s.count}`).join(", ");

  const token = opts.hermesToken ?? HERMES_TOKEN;
  if (!token) {
    // Incident found and no executor to draft it: nada degrada calado.
    logger.error("incident_postmortem_no_executor", { signatures: kinds });
    await telegram(
      `🔴 INCIDENTE DETECTADO E SEM EXECUTOR — scan SQL achou ${signatures.length} assinatura(s) nas últimas 24h (${kinds}), mas HERMES_TASK_TOKEN está ausente no worker: o rascunho de postmortem NÃO será redigido. Ação que destrava: setar HERMES_TASK_TOKEN no serviço worker.`
    );
    return { started: [], skipped: [graph], quiet: false, signatures };
  }

  const rows = await sql<{ id: string }[]>`
    /* pm:incident-run */
    INSERT INTO ops.agent_run (graph, trigger, vp_owner)
    VALUES (${graph}, 'cron:incident-postmortem', ${GRAPH_REGISTRY[graph]?.vpOwner ?? "ceo"})
    RETURNING id`;
  const runId = rows[0]!.id;
  logger.warn("incident_postmortem_started", { runId, signatures: kinds });
  // An incident IS a legitimately loud event — one line, with what was seen.
  // The draft itself arrives via the approval message when compose finishes.
  await telegram(
    `🚨 INCIDENTE DETECTADO (scan SQL, últimas 24h): ${kinds}. Rascunho de postmortem em produção (run ${runId.slice(0, 8)}) — chega para a sua aprovação no Telegram; o commit em docs/learning/ segue manual.`
  );
  return { started: [`${graph}:${runId.slice(0, 8)}`], skipped: [], quiet: false, signatures };
}

/** Exported for tests (the fake sql routes on the queries' own markers). */
export function buildPorts(sql: postgres.Sql, redis: Redis): GraphRunnerPorts {
  // 5.F.2: cache dos overrides POR TICK — buildPorts é criado uma vez por
  // runGraphTick, então este closure vive um tick. Uma query serve todas as
  // runs do tick; nunca uma tempestade por-node (o advanceRun ainda faz o
  // próprio cache por-run em cima deste).
  let promptOverridesCache: Promise<Record<string, string> | null> | null = null;
  // Extraído do hermes port (5.A.1) para que o snapshot 'prospects' use a
  // MESMA cadeia de fallback + os MESMOS alarmes NX — nunca uma segunda via
  // com engine pinado (anti-pattern 21/08).
  const hermesTaskCall = async (
    prompt: string
  ): Promise<{ ok: boolean; output: string; engineUsed: string | null; ms: number | null }> => {
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
  };
  return {
    substrate: {
      async getRun(runId) {
        const rows = await sql<RunRow[]>`
          SELECT id, graph, status, started_at::text AS started_at
            FROM ops.agent_run WHERE id = ${runId}::uuid`;
        return rows[0] ?? null;
      },
      async loadSteps(runId) {
        // 5.F.6: summary travels back to the runner — it is the retry logic's
        // only memory (crash markers, gate markers, circuit parks).
        const rows = await sql<StepRow[]>`
          SELECT id, node, status, summary, started_at::text AS started_at
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
        // 5.A.1 — o snapshot 'prospects' não lê ops.*: ele executa o pipeline
        // sugestão-de-engine → verificação-por-código → mini-GEO-probe do
        // prospect-batch. Vive aqui (e não em buildSnapshot) porque precisa
        // dos ports de I/O do tick: a MESMA cadeia hermes (callWithFallback,
        // alarmes NX) e HTTP de verificação. Todo número do bloco é código.
        if (input.source === "prospects") {
          return buildProspectBatchBlock({ task: hermesTaskCall });
        }
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
      async activeMemoryLessons() {
        // 5.F.1: the newest founder-approved lessons batch — the store is
        // append-only, newest row wins. Fail-open by contract: before the
        // ops.memory_lesson migration is applied (42P01) or on any read blip,
        // return null and the critics run exactly as before ([__memory__]
        // simply is not injected — never a placeholder). 5.F.7: incident
        // lessons live in the SAME table under INCIDENT_LESSON_PREFIX and are
        // EXCLUDED here — [__memory__] stays the monthly consolidation for
        // the marketing critics; an incident row (ops-flavored, read by the
        // watchdog's ops snapshot) must never displace it via newest-wins.
        try {
          const rows = await sql<{ lessons: string }[]>`
            /* memory:active-read */
            SELECT lessons FROM ops.memory_lesson
             WHERE lessons NOT LIKE ${INCIDENT_LESSON_PREFIX + "%"}
             ORDER BY approved_at DESC
             LIMIT 1`;
          const text = rows[0]?.lessons?.trim() ?? "";
          return text.length > 0 ? text : null;
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          if (code !== "42P01") {
            logger.warn("memory_lessons_read_failed", { code, message: (err as Error).message?.slice(0, 160) });
          }
          return null;
        }
      },
      async storeMemoryLessons(input) {
        // Append-only insert — an approved lessons batch is a record, never an
        // edit. On a deploy where the migration is not applied yet (42P01),
        // fail SOFT with the exact unlocking action named: the runner fails
        // the step out loud and nothing pretends to be on.
        try {
          await sql`
            /* memory:store */
            INSERT INTO ops.memory_lesson (source_run_id, lessons)
            VALUES (${input.runId}::uuid, ${input.lessons})`;
          return { ok: true };
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          const reason =
            code === "42P01"
              ? `tabela ops.memory_lesson ausente — ${MEMORY_STORE_MISSING_ACTION}`
              : `${code || "erro"}: ${(err as Error).message?.slice(0, 120)}`;
          logger.error("memory_lessons_store_failed", { code, message: (err as Error).message?.slice(0, 160) });
          return { ok: false, reason };
        }
      },
      async activePromptOverrides() {
        // 5.F.2: a linha mais NOVA por prompt_key — append-only, a mais nova
        // vence; body vazio viaja no mapa e o buildPrompt o trata como
        // "reverte ao estatico". Fail-open por contrato: antes da migração
        // ops.prompt_override (42P01) ou em qualquer blip de leitura, null —
        // todos os grafos seguem nos prompts estáticos do código.
        if (!promptOverridesCache) {
          promptOverridesCache = (async (): Promise<Record<string, string> | null> => {
            try {
              const rows = await sql<{ prompt_key: string; body: string }[]>`
                /* override:active-read */
                SELECT DISTINCT ON (prompt_key) prompt_key, body
                  FROM ops.prompt_override
                 ORDER BY prompt_key, approved_at DESC`;
              if (rows.length === 0) return null;
              const map: Record<string, string> = {};
              for (const r of rows) map[r.prompt_key] = r.body;
              return map;
            } catch (err) {
              const code = (err as { code?: string }).code ?? "";
              if (code !== "42P01") {
                logger.warn("prompt_overrides_read_failed", { code, message: (err as Error).message?.slice(0, 160) });
              }
              return null;
            }
          })();
        }
        return promptOverridesCache;
      },
      async storePromptOverride(input) {
        // Append-only insert — um override aprovado é registro, nunca edit.
        // Reverter = linha nova (body anterior, ou '' para o estático). Numa
        // deploy sem a migração (42P01), fail SOFT com a ação nominal que
        // destrava: o runner falha o step em voz alta e nada finge estar on.
        try {
          await sql`
            /* override:store */
            INSERT INTO ops.prompt_override (source_run_id, prompt_key, body)
            VALUES (${input.runId}::uuid, ${input.promptKey}, ${input.body})`;
          promptOverridesCache = null; // a próxima leitura do tick vê a linha nova
          return { ok: true };
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          const reason =
            code === "42P01"
              ? `tabela ops.prompt_override ausente — ${PROMPT_OVERRIDE_MISSING_ACTION}`
              : `${code || "erro"}: ${(err as Error).message?.slice(0, 120)}`;
          logger.error("prompt_override_store_failed", { code, message: (err as Error).message?.slice(0, 160) });
          return { ok: false, reason };
        }
      },
      async storeCrmContacts(input) {
        // 5.A.1: prospects aprovados → crm_contact, o MESMO shape de escrita
        // do webhook SmartLead (upsert por e-mail, nota anexada) com uma
        // diferença deliberada: NUNCA toca o stage de linha existente — um
        // contato que o founder já moveu (contacted/qualified/customer) não
        // pode voltar a 'new' por um lote novo; só a nota registra o lote.
        // Sem RLS aqui por desenho (crm_contact é tabela ops cross-tenant,
        // como lead_capture) — o client privilegiado do worker escreve direto.
        let inserted = 0;
        try {
          for (const c of input.contacts) {
            // 0.6: a nota nomeia a TRILHA (geo|aistack) + a campanha do
            // contato — é o que deixa o founder carregar cada trilha na SUA
            // campanha do SmartLead. Uma fonte: crmNoteFor (prospecting.ts).
            const note = crmNoteFor({ ...c, track: c.track === "aistack" ? "aistack" : "geo" });
            const rows = await sql<{ inserted: boolean }[]>`
              /* prospect:crm-store */
              INSERT INTO crm_contact (email, stage, note, updated_at)
              VALUES (${c.email}, 'new', ${note}, NOW())
              ON CONFLICT (email) DO UPDATE SET
                note = LEFT(COALESCE(crm_contact.note || E'\n', '') || ${note}, 4000),
                updated_at = NOW()
              RETURNING (xmax = 0) AS inserted`;
            if (rows[0]?.inserted) inserted += 1;
          }
          return { ok: true, inserted };
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          const reason =
            code === "42P01"
              ? `tabela crm_contact ausente — ${CRM_CONTACT_MISSING_ACTION}`
              : `${code || "erro"}: ${(err as Error).message?.slice(0, 120)}`;
          logger.error("prospect_crm_store_failed", { code, inserted, message: (err as Error).message?.slice(0, 160) });
          return { ok: false, inserted, reason };
        }
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
      async recentPublishes(input) {
        // 0.8 anti-generic — the [__recent__] source. The publish record is
        // durable (ops.agent_step summaries carry 'published via ... channel=');
        // matching on the summary (not node='publish') also catches named
        // publish nodes like the A/B's publish-a/publish-b. The piece's TEXT
        // is recovered by the RUNNER from the Redis artifact (TTL 7d) — this
        // port only reports the durable record. Must never throw (fail-open:
        // an error means no [__recent__], cells run as before).
        try {
          const like = input.channel ? `%channel=${input.channel}%` : "%channel=%";
          const rows = await sql<
            { run_id: string; node: string; graph: string; summary: string; published_at: string }[]
          >`
            /* recent:publishes-read */
            SELECT s.run_id, s.node, r.graph, s.summary, s.started_at::text AS published_at
              FROM ops.agent_step s
              JOIN ops.agent_run r ON r.id = s.run_id
             WHERE s.status = 'succeeded'
               AND s.summary LIKE 'published via%'
               AND s.summary LIKE ${like}
             ORDER BY s.started_at DESC
             LIMIT ${Math.max(1, Math.min(input.limit, 20))}`;
          return rows.map((r) => ({
            runId: r.run_id,
            node: r.node,
            graph: r.graph,
            channel: /channel=([a-z0-9_-]+)/i.exec(r.summary)?.[1]?.toLowerCase() ?? "?",
            publishedAt: r.published_at,
            summary: r.summary,
          }));
        } catch (err) {
          logger.warn("recent_publishes_read_failed", { message: (err as Error).message?.slice(0, 160) });
          return [];
        }
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
      task: hermesTaskCall,
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
    // 5.F.6 — the circuit breaker's Redis half. Every method fails OPEN (a
    // Redis blip must never stop a publish or kill a run); the runner treats
    // a throwing/absent circuit as "closed" by contract.
    circuit: {
      async status(channel) {
        try {
          const raw = await redis.get(circuitKey(channel));
          const failures = Number(raw ?? 0) || 0;
          return { open: failures >= CIRCUIT_BREAKER_THRESHOLD, failures };
        } catch {
          return { open: false, failures: 0 };
        }
      },
      async record(channel, ok) {
        try {
          if (ok) {
            // A success CLOSES the circuit — consecutive means consecutive.
            await redis.del(circuitKey(channel));
            return { open: false, failures: 0 };
          }
          const failures = await redis.incr(circuitKey(channel));
          await redis.expire(circuitKey(channel), CIRCUIT_RETEST_WINDOW_S);
          const open = failures >= CIRCUIT_BREAKER_THRESHOLD;
          if (open) logger.warn("postiz_circuit_open", { channel, failures });
          return { open, failures };
        } catch {
          return { open: false, failures: 0 };
        }
      },
      async alarmOnce(channel) {
        try {
          return (await redis.set(circuitAlarmKey(channel), "1", "EX", CIRCUIT_ALARM_WINDOW_S, "NX")) === "OK";
        } catch {
          return true; // no Redis → prefer a duplicate alarm over silence
        }
      },
    },
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

/**
 * weekly-report (5.E.5): o relatório de segunda ao founder. Monday 07:30 UTC —
 * depois dos brains das 06:30 (o CDO/CPO pensam primeiro; o relatório abre o
 * dia útil), antes do expediente. Read-only por construção, então nunca conta
 * na válvula de aprovações. 6-day look-back (uma vez por semana).
 */
export async function runWeeklyReport(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, ["weekly-report"], 24 * 6, "cron:weekly-report");
}

/**
 * 5.F.1: the exact action that unlocks memory-consolidation in production —
 * named in every OFF report ("mergeado não é produção": a feature whose
 * dependency is missing reports itself OFF with the nominal fix, never as ok).
 */
export const MEMORY_STORE_MISSING_ACTION =
  "founder aplica a migracao 20260827000001_ops_memory_lesson (PR feat/memory-consolidation-migration — migracao NUNCA em auto-merge)";

/**
 * Does the durable memory store exist in THIS database? to_regclass is a
 * cheap catalog lookup (null when absent, no exception). Any error counts as
 * "not ready" — the safe direction is OFF, said out loud by the caller.
 */
export async function memoryLessonStoreReady(sql: postgres.Sql): Promise<boolean> {
  try {
    const rows = await sql<{ t: string | null }[]>`
      /* memory:table-check */
      SELECT to_regclass('ops.memory_lesson')::text AS t`;
    return rows[0]?.t != null;
  } catch (err) {
    logger.warn("memory_table_check_failed", { message: (err as Error).message?.slice(0, 160) });
    return false;
  }
}

/**
 * memory-consolidation (5.F.1): monthly, 1st of month 06:30 UTC. Gated on the
 * durable store existing FIRST: without ops.memory_lesson a run would burn an
 * LLM compose and a founder approval only to fail at the store — so the cron
 * declares the feature OFF (log + Telegram, with the unlocking action) and
 * starts nothing. 27-day look-back = once per calendar month, restart-safe.
 * CEO-owned and approval-gated, but never counted by the marketing valve.
 */
export async function runMemoryConsolidationMonthly(
  sql: postgres.Sql,
  opts: { hermesToken?: string } = {}
): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  if (!(await memoryLessonStoreReady(sql))) {
    logger.warn("memory_consolidation_off_no_table", { action: MEMORY_STORE_MISSING_ACTION });
    await sendTelegram(
      `🟡 MEMÓRIA (5.F.1) DESLIGADA: a tabela ops.memory_lesson não existe neste banco — nenhum run de memory-consolidation foi iniciado (não gasto LLM num run que morreria no store). Ação que destrava: ${MEMORY_STORE_MISSING_ACTION}.`
    );
    return { started: [], skipped: ["memory-consolidation"], capped: [] };
  }
  return startBrainRuns(sql, ["memory-consolidation"], 24 * 27, "cron:memory-consolidation", opts);
}

/**
 * 5.F.2: the exact action that unlocks prompt-tuning in production — named in
 * every OFF report ("mergeado não é produção": a feature whose dependency is
 * missing reports itself OFF with the nominal fix, never as ok).
 */
export const PROMPT_OVERRIDE_MISSING_ACTION =
  "founder aplica a migracao 20260831000001_ops_prompt_override (PR feat/prompt-tuning-migration — migracao NUNCA em auto-merge)";

/**
 * Does the prompt-override store exist in THIS database? Same cheap
 * to_regclass catalog lookup as memoryLessonStoreReady — any error counts as
 * "not ready" (the safe direction is OFF, said out loud by the caller).
 */
export async function promptOverrideStoreReady(sql: postgres.Sql): Promise<boolean> {
  try {
    const rows = await sql<{ t: string | null }[]>`
      /* override:table-check */
      SELECT to_regclass('ops.prompt_override')::text AS t`;
    return rows[0]?.t != null;
  } catch (err) {
    logger.warn("prompt_override_table_check_failed", { message: (err as Error).message?.slice(0, 160) });
    return false;
  }
}

/**
 * prompt-tuner (5.F.2): weekly, Tuesday 06:30 UTC — offset from the Monday
 * brains/report and the Thursday discovery. Gated on the durable store
 * existing FIRST: without ops.prompt_override a run would burn an LLM compose
 * and a founder approval only to fail at the store — so the cron declares the
 * feature OFF (log + Telegram, with the unlocking action) and starts nothing.
 * 6-day look-back = once per week, restart-safe. CEO-owned and
 * approval-gated, but never counted by the marketing valve.
 */
export async function runPromptTunerWeekly(
  sql: postgres.Sql,
  opts: { hermesToken?: string } = {}
): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  if (!(await promptOverrideStoreReady(sql))) {
    logger.warn("prompt_tuner_off_no_table", { action: PROMPT_OVERRIDE_MISSING_ACTION });
    await sendTelegram(
      `🟡 PROMPT-TUNING (5.F.2) DESLIGADO: a tabela ops.prompt_override não existe neste banco — nenhum run de prompt-tuner foi iniciado (não gasto LLM num run que morreria no store). Os grafos seguem nos prompts estáticos do código. Ação que destrava: ${PROMPT_OVERRIDE_MISSING_ACTION}.`
    );
    return { started: [], skipped: ["prompt-tuner"], capped: [] };
  }
  return startBrainRuns(sql, ["prompt-tuner"], 24 * 6, "cron:prompt-tuner", opts);
}

/**
 * ab-experiment (5.F.4): o A/B semanal — sexta 06:30 UTC, o único slot de
 * manhã ainda livre (segunda: brains 06:30 + relatório 07:30; terça: tuner
 * 06:30; quinta: discovery 06:30). Marketing-owned e gated por approval, então
 * CONTA na válvula de aprovações diárias (startBrainRuns aplica) — um A/B é
 * exatamente o tipo de pedido de atenção que a válvula existe para limitar.
 * 6-day look-back = uma vez por semana, restart-safe. Sem gate de migração:
 * reusa agent_run/agent_step/agent_outcome que já existem.
 */
export async function runAbExperimentWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, ["ab-experiment"], 24 * 6, "cron:ab-experiment");
}

/**
 * 5.A.1: a ação nominal que destrava a perna CRM do prospect-batch caso a
 * tabela não exista no banco ("mergeado não é produção" — o run em si segue,
 * a perna do CRM se declara OFF em voz alta com este texto).
 */
export const CRM_CONTACT_MISSING_ACTION =
  "founder aplica a migracao 20260713000002_crm_contact (ja aplicada em producao desde 13/07 — se este aviso aparecer, o worker esta apontando para o banco errado)";

/**
 * prospect-batch (5.A.1 + 2.10): o lote semanal de prospecção — quarta 07:30
 * UTC (quarta só tem o sphere-reddit às 08:00; 07:30 estava livre — segunda é
 * do weekly-report, e o incident-postmortem diário roda às 07:00). Vendas,
 * não marketing: nunca conta na válvula SPHERE_MAX_DAILY_APPROVALS. O cron só
 * cria o run; o tick de 10 min executa (prospects→draft→critic→finalize→
 * aprovação→store crm/report). Sem gate de migração: crm_contact já existe em
 * produção e a perna do CRM é fail-soft (o lote aprovado sai no report mesmo
 * com CRM indisponível). 6-day look-back = uma vez por semana, restart-safe.
 */
export async function runProspectBatchWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[]; capped: string[] }> {
  return startBrainRuns(sql, ["prospect-batch"], 24 * 6, "cron:prospect-batch");
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
