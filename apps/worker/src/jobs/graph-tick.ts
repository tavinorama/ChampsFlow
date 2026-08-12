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

async function sendTelegram(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) {
    logger.warn("graph_tick_telegram_env_missing", { preview: text.slice(0, 120) });
    return;
  }
  try {
    await httpJson(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text }),
      },
      15_000
    );
  } catch (err) {
    logger.error("graph_tick_telegram_failed", { message: (err as Error).message?.slice(0, 160) });
  }
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
        const lift = null; // no baseline on a first-run verdict; lib semantics
        const rows = await sql<{ id: string }[]>`
          INSERT INTO ops.agent_outcome (step_id, metric, value_before, value_after, lift)
          VALUES (${input.stepId}::uuid, ${input.metric}, ${input.valueBefore}, ${input.valueAfter}, ${lift})
          RETURNING id`;
        return rows[0]!.id;
      },
      async readHarvest(metric, sinceIso) {
        // The #162 cron writes outcomes named like 'youtube_views_7d'; a graph
        // harvest config may name the exact metric or a prefix ('yt_views').
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
