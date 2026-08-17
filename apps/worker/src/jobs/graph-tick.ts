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
const HERMES_TIMEOUT_MS = 240_000;
/** Cap runs advanced per tick — a stampede of runs must not starve the queue. */
const MAX_RUNS_PER_TICK = 5;

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
 * The read-only brains' fuel: a bounded, PII-free digest of ops.* as text.
 * ops.* holds slugs, statuses, hashes and numbers — no tenant data is touched,
 * so this stays inside the company's own record. Two sources:
 *  - 'ops'      → run/step health, cost, cycle time, failure hotspots,
 *                 repeated inputs (the Watchdog's raw material);
 *  - 'outcomes' → agent_outcome lift per metric/graph (the CDO's raw material).
 * Returns "" when there is genuinely nothing — the runner turns that into an
 * honest "SEM DADOS" marker so the lenses never invent a number.
 */
async function buildSnapshot(
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
    },
    hermes: {
      async task(prompt) {
        const { status, body } = await httpJson(
          `${HERMES_URL}/task`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${HERMES_TOKEN}` },
            body: JSON.stringify({ engine: "claude", timeoutMs: HERMES_TIMEOUT_MS - 20_000, prompt }),
          },
          HERMES_TIMEOUT_MS
        );
        const b = body as { ok?: boolean; output?: string; engine_used?: string; ms?: number };
        return {
          ok: status === 200 && b?.ok === true,
          output: String(b?.output ?? ""),
          engineUsed: b?.engine_used ?? null,
          ms: typeof b?.ms === "number" ? b.ms : null,
        };
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
 * Start brain runs — idempotent by a look-back window so a worker restart or a
 * second instance cannot double-fire. Gated on HERMES_TOKEN: with no executor,
 * starting a run only creates a stuck row and a false alarm, so we skip (the
 * tick's own missing-token alarm still covers a token that vanishes
 * mid-flight). The every-10-min graph-tick advances whatever this starts.
 */
async function startBrainRuns(
  sql: postgres.Sql,
  brains: string[],
  lookbackHours: number,
  trigger: string
): Promise<{ started: string[]; skipped: string[] }> {
  const started: string[] = [];
  const skipped: string[] = [];
  if (!HERMES_TOKEN) {
    logger.warn("brain_start_skipped_no_executor", { brains: brains.join(","), trigger });
    return { started, skipped: [...brains] };
  }
  for (const graph of brains) {
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
  }
  if (started.length > 0) {
    await sendTelegram(`🧠 Cérebros iniciados (${trigger}): ${started.join(", ")}. Relatórios chegam quando os graphs concluírem.`);
  }
  return { started, skipped };
}

/** Daily hygiene: the Watchdog. 20h look-back (once per calendar day). */
export async function runBrainDaily(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, DAILY_BRAINS, 20, "cron:brain-daily");
}

/** Weekly strategy: the Chief Dreaming Officer. 6-day look-back (once/week). */
export async function runBrainWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, WEEKLY_BRAINS, 24 * 6, "cron:brain-weekly");
}

/**
 * CDO+CPO active discovery (founder rule 13/08): improvements + new products,
 * matured to MVP-ready before the founder sees them. Thursday, offset from the
 * Monday strategy pair so the week has two thinking moments, not one pile.
 */
export async function runDiscoveryWeekly(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, ["weekly-discovery"], 24 * 6, "cron:discovery-weekly");
}

/** Specialist cells (#156): daily content runs. 20h look-back. */
export async function runSphereStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, SPHERE_CELLS, 20, "cron:sphere-start");
}

/** LinkedIn cell (#156): daily content runs. 20h look-back. */
export async function runSphereLinkedinStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, LINKEDIN_CELLS, 20, "cron:sphere-linkedin");
}

/** Blog cell (#156): weekly thinker, Thursday. 6-day look-back. */
export async function runSphereBlogStart(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, BLOG_CELLS, 24 * 6, "cron:sphere-blog");
}

/** The daily video graph (v2), once per calendar day. 20h look-back. */
export async function runVideoDaily(sql: postgres.Sql): Promise<{ started: string[]; skipped: string[] }> {
  return startBrainRuns(sql, VIDEO_CELLS, 20, "cron:video-daily");
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
  results: Array<{ runId: string; graph: string; status: string; started: string[] }>;
}

export async function runGraphTick(sql: postgres.Sql, redis: Redis): Promise<GraphTickResult> {
  const slugs = Object.keys(GRAPH_REGISTRY);
  const inflight = await sql<{ id: string; graph: string }[]>`
    SELECT id, graph FROM ops.agent_run
     WHERE status = 'running' AND graph = ANY(${slugs})
     ORDER BY started_at ASC
     LIMIT ${MAX_RUNS_PER_TICK}`;

  if (!HERMES_TOKEN) {
    // No token + no runs = dormant, log-only. No token + RUNS WAITING = an
    // incident: someone started a graph the orchestrator cannot execute.
    logger.error("graph_tick_hermes_token_missing", {
      inflight: inflight.length,
      hint: "set HERMES_TASK_TOKEN (and optionally HERMES_TASK_URL) on the worker",
    });
    if (inflight.length > 0 && !warnedMissingHermes) {
      warnedMissingHermes = true;
      await sendTelegram(
        `🔴 ORQUESTRADOR SEM EXECUTOR: ${inflight.length} run(s) de graph em andamento mas HERMES_TASK_TOKEN ausente no worker — nada avança até a env existir.`
      );
    }
    return { advanced: 0, results: [] };
  }

  const ports = buildPorts(sql, redis);
  const results: GraphTickResult["results"] = [];
  for (const run of inflight) {
    const def = GRAPH_REGISTRY[run.graph];
    if (!def) continue; // registry changed underfoot; next deploy's problem
    try {
      const res = await advanceRun(def, run.id, ports);
      results.push({ runId: run.id, graph: run.graph, status: res.status, started: res.started });
      logger.info("graph_tick_advanced", {
        runId: run.id,
        graph: run.graph,
        status: res.status,
        started: res.started.join(","),
        notes: res.notes.join("; ").slice(0, 300),
      });
    } catch (err) {
      // One broken run must not stall the others — log loud, keep ticking.
      logger.error("graph_tick_run_error", {
        runId: run.id,
        graph: run.graph,
        message: (err as Error).message?.slice(0, 200),
      });
    }
  }
  return { advanced: results.length, results };
}
