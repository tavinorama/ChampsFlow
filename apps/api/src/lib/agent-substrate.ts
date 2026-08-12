/**
 * agent-substrate.ts — the write/read library over ops.agent_run /
 * ops.agent_step / ops.agent_outcome (#161a).
 *
 * This is the organization's memory of ITSELF. Every prior table describes
 * the product; these describe the agents — so the 22:45 bulletin can query a
 * schema instead of guessing at raw logs, so #151's CEO→VP drill-down is a
 * GROUP BY, and so #156's specialists have a verdict to learn from.
 *
 * Lives in the API (not the worker) on purpose: the Operator API is the
 * authenticated bridge the agent org already uses (Cockpit Fase 2 gave Hermes
 * scoped write). #161b wires Hermes' /task calls through these functions;
 * #164's orchestrator drives them per node.
 *
 * PRIVACY DISCIPLINE (inherited from ai_generation_log / GEO-A6): this module
 * accepts HASHES and a bounded summary — there is deliberately no parameter
 * that could carry a raw transcript, so the substrate cannot become the
 * fast-growing text store that would actually justify a warehouse.
 *
 * FOUNDER RULE: the watcher stays outside the watched. Incident Watch and
 * check-video-posted must NOT be routed through here.
 */

import { logger } from "../../../../packages/shared/src/logger";
// #438's lesson, applied late: types the worker can reach live in
// packages/shared, NEVER in a route file. This import previously pointed at
// ../routes/social-accounts — harmless until the graph runner pulled this
// lib into the worker's compile graph, and the route's hono import killed
// every worker deploy on 2026-08-12 (the #438 disease, second outbreak).
import type { PostgresClient } from "../../../../packages/shared/src/db-client";

export type VpOwner =
  | "engineering"
  | "marketing"
  | "sales"
  | "finance"
  | "legal"
  | "cx"
  | "ceo";

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type StepStatus = "running" | "succeeded" | "failed" | "skipped" | "waiting";

/** Bounded gist — a sentence about what the step decided, never a transcript. */
export const MAX_STEP_SUMMARY_CHARS = 500;

export interface StartRunInput {
  /** Graph definition slug, e.g. 'daily-video'. */
  graph: string;
  /** What started it: cron slug, 'manual', 'telegram', another run's id. */
  trigger: string;
  vpOwner: VpOwner;
}

export async function startRun(db: PostgresClient, input: StartRunInput): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO ops.agent_run (graph, trigger, vp_owner)
     VALUES ($1, $2, $3) RETURNING id`,
    [input.graph, input.trigger, input.vpOwner]
  );
  return res.rows[0]!.id;
}

/**
 * Close a run. cost_cents is summed from the run's steps HERE, not passed in:
 * a total the caller types is a total that drifts from its parts — the exact
 * api_spend disease (#152), not repeated.
 */
export async function finishRun(
  db: PostgresClient,
  runId: string,
  outcome: { status: Exclude<RunStatus, "running">; engineUsed?: string | null }
): Promise<void> {
  await db.query(
    `UPDATE ops.agent_run
        SET status = $2,
            engine_used = COALESCE($3, engine_used),
            ended_at = NOW(),
            cost_cents = (SELECT COALESCE(SUM(cost_cents), 0) FROM ops.agent_step WHERE run_id = $1)
      WHERE id = $1`,
    [runId, outcome.status, outcome.engineUsed ?? null]
  );
}

export interface StartStepInput {
  runId: string;
  /** Node slug within the graph ('briefing', 'debate-hook', 'verdict'...). */
  node: string;
  /**
   * THE graph edge. null/undefined = root. Several steps sharing one parent
   * = fan-out (the debate's parallel critics); the synthesis step points at
   * whichever critic's branch won.
   */
  parentStepId?: string | null;
  /** sha256 of the input the node received. Hash, never text. */
  inputHash?: string | null;
}

export async function startStep(db: PostgresClient, input: StartStepInput): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO ops.agent_step (run_id, node, parent_step_id, input_hash)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.runId, input.node, input.parentStepId ?? null, input.inputHash ?? null]
  );
  return res.rows[0]!.id;
}

export interface FinishStepInput {
  status: Exclude<StepStatus, "running">;
  outputHash?: string | null;
  /** One sentence about what was decided. Capped — never a transcript. */
  summary?: string | null;
  ms?: number | null;
  engine?: string | null;
  costCents?: number | null;
}

export async function finishStep(
  db: PostgresClient,
  stepId: string,
  input: FinishStepInput
): Promise<void> {
  const summary =
    input.summary != null ? input.summary.slice(0, MAX_STEP_SUMMARY_CHARS) : null;
  if (input.summary != null && input.summary.length > MAX_STEP_SUMMARY_CHARS) {
    // A summary that needed truncating is a caller trying to store prose.
    // Cap silently would hide the misuse; cap loudly teaches it.
    logger.warn("agent_step_summary_truncated", {
      stepId,
      originalLength: input.summary.length,
    });
  }
  await db.query(
    `UPDATE ops.agent_step
        SET status = $2, output_hash = $3, summary = $4, ms = $5, engine = $6, cost_cents = $7
      WHERE id = $1`,
    [
      stepId,
      input.status,
      input.outputHash ?? null,
      summary,
      input.ms ?? null,
      input.engine ?? null,
      input.costCents ?? null,
    ]
  );
}

/**
 * Normalized change for an outcome. Defined once so every verdict speaks the
 * same unit: lift = after/before − 1 (0.25 = +25%). Null when there is no
 * meaningful baseline (before null/zero/negative) — a lift computed against
 * nothing would be the bulletin guessing again, only with more decimals.
 */
export function computeLift(
  valueBefore: number | null | undefined,
  valueAfter: number | null | undefined
): number | null {
  if (valueBefore == null || valueAfter == null) return null;
  if (!(valueBefore > 0)) return null;
  return valueAfter / valueBefore - 1;
}

export interface RecordOutcomeInput {
  stepId: string;
  /** What was measured: 'yt_views_72h', 'li_impressions_72h'... */
  metric: string;
  valueBefore?: number | null;
  valueAfter?: number | null;
}

/**
 * The read-it-back row. Append-only at the DATABASE level (no UPDATE grant):
 * a verdict that can be edited is not a verdict. Re-measurement = a new row,
 * and the history of measurements is itself signal.
 */
export async function recordOutcome(
  db: PostgresClient,
  input: RecordOutcomeInput
): Promise<string> {
  const lift = computeLift(input.valueBefore, input.valueAfter);
  const res = await db.query<{ id: string }>(
    `INSERT INTO ops.agent_outcome (step_id, metric, value_before, value_after, lift)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.stepId, input.metric, input.valueBefore ?? null, input.valueAfter ?? null, lift]
  );
  return res.rows[0]!.id;
}

/**
 * The loop-is-broken query (#156's precondition): published steps whose wait
 * window has passed with NO outcome recorded. The absence of a verdict is the
 * one failure mode this whole substrate exists to make visible.
 */
export async function stepsMissingOutcome(
  db: PostgresClient,
  opts: { node: string; olderThanHours: number }
): Promise<Array<{ step_id: string; run_id: string; graph: string; started_at: string }>> {
  const res = await db.query<{
    step_id: string;
    run_id: string;
    graph: string;
    started_at: string;
  }>(
    `SELECT s.id AS step_id, s.run_id, r.graph, s.started_at
       FROM ops.agent_step s
       JOIN ops.agent_run r ON r.id = s.run_id
      WHERE s.node = $1
        AND s.status = 'succeeded'
        AND s.started_at < NOW() - make_interval(hours => $2)
        AND NOT EXISTS (SELECT 1 FROM ops.agent_outcome o WHERE o.step_id = s.id)
      ORDER BY s.started_at ASC`,
    [opts.node, opts.olderThanHours]
  );
  return res.rows;
}
