/**
 * plan-task-lifecycle.ts — the database side of Verified Execution (P0-02).
 *
 * The rules live in packages/llm/src/plan-task-state.ts and are pure. This file
 * is the only place that turns a validated transition into rows: it updates
 * plan_task and appends to plan_task_transition in ONE transaction, so a state
 * change and its evidence can never come apart.
 *
 * ---------------------------------------------------------------------------
 * WORKS BEFORE THE MIGRATION APPLIES — deliberately, and here is why
 * ---------------------------------------------------------------------------
 * The migration (20260903000001_plan_task_lifecycle) ships in a SEPARATE PR
 * that the founder merges by hand. The choice was: ship this code switched OFF
 * until then, or make it defensive. Defensive won, for two reasons:
 *
 *   1. The "Add your own to-do" fix and the honest Execution reading are both
 *      worth having on day one, and neither needs the new schema.
 *   2. A feature that is dark until an unrelated merge is a feature that gets
 *      reported as shipped and is not. That is the exact failure this whole
 *      workstream exists to stop.
 *
 * So: `detectLifecycle()` asks the database once what it actually has, caches
 * it, and the rest of the module degrades honestly.
 *
 *   Schema present  → full state machine, history written, verified % is real.
 *   Schema absent   → the client-safe subset still works (a checkbox writes
 *                     the legacy 'done', which the read side coerces to
 *                     `legacy_self_reported`); every transition that needs a
 *                     new state or the history table is REFUSED with a plain
 *                     message naming the migration, never silently dropped;
 *                     and Verified Execution reports `null` with
 *                     reason `migration_pending` — NOT 0. Absent data does not
 *                     become a zero the client would read as failure.
 */

import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import {
  computeExecution,
  normalizePlanTaskState,
  validateTransition,
  type ExecutionBreakdown,
  type PlanTaskActor,
  type PlanTaskState,
} from "../../../../packages/llm/src/plan-task-state";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

export interface LifecycleCapability {
  /** plan_task_transition exists → history can be written. */
  history: boolean;
  /** plan_task.verified_at exists → proof columns can be written. */
  proofColumns: boolean;
  /** Both of the above. The full machine is available. */
  full: boolean;
}

let cached: LifecycleCapability | null = null;

/** Test seam — reset the memoized probe. */
export function resetLifecycleCapabilityCache(): void {
  cached = null;
}

/**
 * detectLifecycle — one catalog read, memoized for the process lifetime.
 *
 * On any error we report "not available" rather than throwing: the caller then
 * degrades to the honest subset. It logs, because a probe that keeps failing is
 * information, not noise.
 */
export async function detectLifecycle(db: PostgresClient): Promise<LifecycleCapability> {
  if (cached) return cached;
  try {
    const { rows } = await db.query<{ history: boolean; proof_columns: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name = 'plan_task_transition')       AS history,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'plan_task'
                    AND column_name = 'verified_at')               AS proof_columns`
    );
    const history = rows[0]?.history === true;
    const proofColumns = rows[0]?.proof_columns === true;
    cached = { history, proofColumns, full: history && proofColumns };
    if (!cached.full) {
      logger.warn("plan_task_lifecycle_migration_pending", {
        history,
        proof_columns: proofColumns,
        effect:
          "Verified Execution reports null (not 0) and lifecycle transitions beyond the legacy states are refused until 20260903000001_plan_task_lifecycle is applied",
      });
    }
    return cached;
  } catch (err) {
    logger.warn("plan_task_lifecycle_probe_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    return { history: false, proofColumns: false, full: false };
  }
}

// ---------------------------------------------------------------------------
// Reading — Verified Execution
// ---------------------------------------------------------------------------

export type ExecutionUnavailableReason =
  | "no_plan"
  | "no_tasks"
  | "migration_pending"
  | "read_failed";

export interface VerifiedExecution extends ExecutionBreakdown {
  /**
   * Why there is no number, when there is no number. The UI must say which —
   * "not measured yet" and "0% verified" mean very different things to a
   * client and must never render the same.
   */
  unavailableReason: ExecutionUnavailableReason | null;
  /** True once the lifecycle schema is in place. */
  measurable: boolean;
}

const EMPTY = (reason: ExecutionUnavailableReason): VerifiedExecution => ({
  verifiedPct: null,
  selfReportedPct: null,
  counts: {
    total: 0,
    denominator: 0,
    verified: 0,
    inFlight: 0,
    selfReported: 0,
    open: 0,
    notOwed: 0,
  },
  unavailableReason: reason,
  measurable: false,
});

/**
 * readVerifiedExecution — Verified Execution for a brand's LATEST plan.
 *
 * Replaces deriveExecutionProgress, which counted `status = 'done'` — i.e.
 * checkboxes — and returned that as a product metric (audits.ts:363 before
 * this change).
 *
 * Never returns 0 to mean "we could not read this". A failed read is
 * `verifiedPct: null` + `unavailableReason: 'read_failed'`, and it logs.
 */
export async function readVerifiedExecution(
  db: PostgresClient,
  brandId: string
): Promise<VerifiedExecution> {
  const cap = await detectLifecycle(db);
  try {
    const planRes = await db.query<{ id: string }>(
      `SELECT id FROM strategy_plan WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [brandId]
    );
    const planId = planRes.rows[0]?.id ?? null;
    if (!planId) return { ...EMPTY("no_plan"), measurable: cap.full };

    const taskRes = await db.query<{ status: string }>(
      `SELECT status FROM plan_task WHERE plan_id = $1`,
      [planId]
    );
    if (taskRes.rows.length === 0) return { ...EMPTY("no_tasks"), measurable: cap.full };

    const states: PlanTaskState[] = taskRes.rows.map((r) => normalizePlanTaskState(r.status));
    const breakdown = computeExecution(states);

    // Before the migration nothing can legitimately be `verified`, so a 0%
    // here would be an artefact of the schema, not a measurement. Report the
    // counts (they are real) but withhold the percentage.
    if (!cap.full) {
      return {
        ...breakdown,
        verifiedPct: null,
        unavailableReason: "migration_pending",
        measurable: false,
      };
    }
    return {
      ...breakdown,
      unavailableReason: breakdown.verifiedPct === null ? "no_tasks" : null,
      measurable: true,
    };
  } catch (err) {
    // The old code did `catch { return null }` with no log, so a broken table
    // read as "not started". Never again silently.
    logger.warn("verified_execution_read_failed", {
      brand_id: brandId,
      message: (err as Error).message?.slice(0, 160),
    });
    return EMPTY("read_failed");
  }
}

// ---------------------------------------------------------------------------
// Writing — one transition
// ---------------------------------------------------------------------------

export interface ApplyTransitionInput {
  taskId: string;
  tenantId: string;
  /** Derived from the session on the server. NEVER read from the request body. */
  actor: PlanTaskActor;
  /** User id / job name, for the history row. */
  actorId?: string | null;
  to: PlanTaskState;
  evidence?: string | null;
  reason?: string | null;
  artifactUrl?: string | null;
}

export type ApplyTransitionOutcome =
  | { ok: true; from: PlanTaskState; to: PlanTaskState; verifiedAt: string | null }
  | { ok: false; status: 404 | 409 | 403 | 503; message: string; code?: string };

/**
 * applyTransition — validate, then write the row and its history together.
 *
 * The validation is the pure module's, called with the actor the SERVER
 * derived. A client cannot pass `actor` in a request body; see the PATCH route.
 */
export async function applyTransition(
  db: PostgresClient,
  input: ApplyTransitionInput
): Promise<ApplyTransitionOutcome> {
  const cap = await detectLifecycle(db);

  const current = await db.query<{ status: string }>(
    `SELECT status FROM plan_task WHERE id = $1 AND tenant_id = $2`,
    [input.taskId, input.tenantId]
  );
  if (current.rows.length === 0) {
    return { ok: false, status: 404, message: "Task not found." };
  }
  const from = normalizePlanTaskState(current.rows[0].status);

  const verdict = validateTransition({
    from,
    to: input.to,
    actor: input.actor,
    evidence: input.evidence,
    reason: input.reason,
    artifactUrl: input.artifactUrl,
  });
  if (!verdict.ok) {
    const status = verdict.code === "actor_not_permitted" ? 403 : 409;
    return { ok: false, status, message: verdict.message ?? "Transition refused.", code: verdict.code };
  }

  // --- degraded mode ------------------------------------------------------
  // Without the migration the CHECK constraint only knows the four legacy
  // values. Rather than let Postgres throw a 500 that reads as a bug, refuse
  // clearly and name the thing that unblocks it.
  if (!cap.full) {
    const LEGACY_WRITABLE: readonly PlanTaskState[] = ["proposed", "accepted", "rejected"];
    if (!LEGACY_WRITABLE.includes(input.to)) {
      logger.warn("plan_task_transition_blocked_by_migration", {
        to: input.to,
        actor: input.actor,
      });
      return {
        ok: false,
        status: 503,
        message:
          "This step is switched off until the task-lifecycle migration is applied (20260903000001_plan_task_lifecycle). Nothing was changed.",
        code: "migration_pending",
      };
    }
    await db.query(`UPDATE plan_task SET status = $3 WHERE id = $1 AND tenant_id = $2`, [
      input.taskId,
      input.tenantId,
      input.to,
    ]);
    return { ok: true, from, to: input.to, verifiedAt: null };
  }

  // --- full mode ----------------------------------------------------------
  // Row and history commit together. A state without its evidence, or evidence
  // without its state, is the failure mode this transaction exists to prevent.
  const verifiedAt = input.to === "verified" ? new Date().toISOString() : null;
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE plan_task
          SET status           = $3,
              state_actor      = $4,
              state_changed_at = NOW(),
              state_reason     = $5,
              artifact_url     = COALESCE($6, artifact_url),
              -- cleared on any move away from verified (regression included)
              verified_at      = CASE WHEN $3 = 'verified' THEN NOW() ELSE NULL END
        WHERE id = $1 AND tenant_id = $2`,
      [
        input.taskId,
        input.tenantId,
        input.to,
        input.actor,
        input.reason ?? null,
        input.artifactUrl ?? null,
      ]
    );
    await tx.query(
      `INSERT INTO plan_task_transition
         (tenant_id, task_id, from_state, to_state, actor_type, actor_id, evidence, reason, artifact_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.tenantId,
        input.taskId,
        from,
        input.to,
        input.actor,
        input.actorId ?? null,
        input.evidence ?? null,
        input.reason ?? null,
        input.artifactUrl ?? null,
      ]
    );
  });

  return { ok: true, from, to: input.to, verifiedAt };
}

/**
 * readTransitions — the append-only history of one task, newest first.
 * Returns [] when the history table does not exist yet; the caller shows
 * "history starts when the migration lands", not an error.
 */
export async function readTransitions(
  db: PostgresClient,
  taskId: string,
  tenantId: string
): Promise<Array<Record<string, unknown>>> {
  const cap = await detectLifecycle(db);
  if (!cap.history) return [];
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT from_state, to_state, actor_type, actor_id, evidence, reason, artifact_url, created_at
         FROM plan_task_transition
        WHERE task_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 100`,
      [taskId, tenantId]
    );
    return rows;
  } catch (err) {
    logger.warn("plan_task_transition_read_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    return [];
  }
}
