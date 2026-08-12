/**
 * operator-agents.ts — #161b: the Hermes writer's door into the agent
 * substrate (ops.agent_run / agent_step / agent_outcome).
 *
 * The substrate (#161a) shipped as tables + lib and sat at 0 rows because
 * nothing outside this repo could write it. These routes let the VPS task
 * server (and later the graph orchestrator, #164) record what actually ran:
 * run started, steps taken, verdicts read back. Same auth as the rest of the
 * operator surface — the Hermes operator key, scopes ["operator","business"].
 *
 * Discipline carried over from the lib, enforced here at the boundary:
 *  - hashes, never text: there is no field that could carry a prompt or an
 *    output; callers send sha256 hex or nothing.
 *  - summaries are one sentence, capped by the lib (loudly).
 *  - outcomes are append-only; lift is computed by the lib, never accepted
 *    from the caller — a self-reported lift is the bulletin guessing again.
 *  - vp_owner is validated against the real org chart before the INSERT so
 *    the caller gets a 400 with the allowed list instead of a bare 500.
 */

import { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { requireOperatorKey } from "./api-keys";
import { agentOpsSummary, clampDays } from "../lib/agent-ops";
import {
  startRun,
  finishRun,
  startStep,
  finishStep,
  recordOutcome,
  stepsMissingOutcome,
  type VpOwner,
} from "../lib/agent-substrate";

const VP_OWNERS: VpOwner[] = [
  "engineering",
  "marketing",
  "sales",
  "finance",
  "legal",
  "cx",
  "ceo",
];

const RUN_END_STATUSES = ["succeeded", "failed", "cancelled"] as const;
const STEP_END_STATUSES = ["succeeded", "failed", "skipped", "waiting"] as const;

/** 64 lowercase hex chars or null — the only shape a "hash" field accepts. */
function asSha256(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value === "string" && /^[0-9a-f]{64}$/.test(value)) return value;
  return undefined; // invalid — caller error, not silently dropped
}

export function registerOperatorAgentRoutes(app: Hono, db: PostgresClient): void {
  const agentsKey = requireOperatorKey(db, ["operator", "business"]);

  // POST /api/v1/operator/agent-runs — a graph run begins
  app.post("/api/v1/operator/agent-runs", agentsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      graph?: string;
      trigger?: string;
      vp_owner?: string;
    } | null;
    if (!body?.graph || !body?.trigger) {
      return c.json({ error: "bad_request", message: "graph and trigger are required." }, 400);
    }
    if (!VP_OWNERS.includes(body.vp_owner as VpOwner)) {
      return c.json(
        { error: "bad_request", message: `vp_owner must be one of: ${VP_OWNERS.join(", ")}.` },
        400
      );
    }
    const runId = await startRun(db, {
      graph: body.graph,
      trigger: body.trigger,
      vpOwner: body.vp_owner as VpOwner,
    });
    return c.json({ run_id: runId }, 201);
  });

  // POST /api/v1/operator/agent-runs/:id/finish — close it; cost is summed
  // from the steps by the lib, never accepted from the caller.
  app.post("/api/v1/operator/agent-runs/:id/finish", agentsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      status?: string;
      engine_used?: string;
    } | null;
    const status = body?.status as (typeof RUN_END_STATUSES)[number] | undefined;
    if (!status || !RUN_END_STATUSES.includes(status)) {
      return c.json(
        { error: "bad_request", message: `status must be one of: ${RUN_END_STATUSES.join(", ")}.` },
        400
      );
    }
    const runId = c.req.param("id");
    if (!runId) return c.json({ error: "bad_request", message: "run id is required." }, 400);
    await finishRun(db, runId, {
      status,
      engineUsed: typeof body?.engine_used === "string" ? body.engine_used.slice(0, 40) : null,
    });
    return c.json({ ok: true });
  });

  // POST /api/v1/operator/agent-steps — a node starts (parent_step_id IS the graph)
  app.post("/api/v1/operator/agent-steps", agentsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      run_id?: string;
      node?: string;
      parent_step_id?: string | null;
      input_hash?: string | null;
    } | null;
    if (!body?.run_id || !body?.node) {
      return c.json({ error: "bad_request", message: "run_id and node are required." }, 400);
    }
    const inputHash = asSha256(body.input_hash);
    if (inputHash === undefined) {
      return c.json(
        { error: "bad_request", message: "input_hash must be 64 lowercase hex chars (sha256) or null. Never send text." },
        400
      );
    }
    const stepId = await startStep(db, {
      runId: body.run_id,
      node: body.node,
      parentStepId: body.parent_step_id ?? null,
      inputHash,
    });
    return c.json({ step_id: stepId }, 201);
  });

  // POST /api/v1/operator/agent-steps/:id/finish
  app.post("/api/v1/operator/agent-steps/:id/finish", agentsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      status?: string;
      output_hash?: string | null;
      summary?: string | null;
      ms?: number | null;
      engine?: string | null;
      cost_cents?: number | null;
    } | null;
    const status = body?.status as (typeof STEP_END_STATUSES)[number] | undefined;
    if (!status || !STEP_END_STATUSES.includes(status)) {
      return c.json(
        { error: "bad_request", message: `status must be one of: ${STEP_END_STATUSES.join(", ")}.` },
        400
      );
    }
    const outputHash = asSha256(body?.output_hash);
    if (outputHash === undefined) {
      return c.json(
        { error: "bad_request", message: "output_hash must be 64 lowercase hex chars (sha256) or null. Never send text." },
        400
      );
    }
    const stepId = c.req.param("id");
    if (!stepId) return c.json({ error: "bad_request", message: "step id is required." }, 400);
    await finishStep(db, stepId, {
      status,
      outputHash,
      summary: typeof body?.summary === "string" ? body.summary : null,
      ms: typeof body?.ms === "number" ? Math.round(body.ms) : null,
      engine: typeof body?.engine === "string" ? body.engine.slice(0, 40) : null,
      costCents: typeof body?.cost_cents === "number" ? Math.round(body.cost_cents) : null,
    });
    return c.json({ ok: true });
  });

  // POST /api/v1/operator/agent-outcomes — the read-it-back verdict.
  // Append-only at the DB level; lift computed by the lib.
  app.post("/api/v1/operator/agent-outcomes", agentsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      step_id?: string;
      metric?: string;
      value_before?: number | null;
      value_after?: number | null;
    } | null;
    if (!body?.step_id || !body?.metric) {
      return c.json({ error: "bad_request", message: "step_id and metric are required." }, 400);
    }
    const outcomeId = await recordOutcome(db, {
      stepId: body.step_id,
      metric: body.metric.slice(0, 80),
      valueBefore: typeof body.value_before === "number" ? body.value_before : null,
      valueAfter: typeof body.value_after === "number" ? body.value_after : null,
    });
    return c.json({ outcome_id: outcomeId }, 201);
  });

  // GET /api/v1/operator/agent-runs/missing-outcomes — the loop-is-broken
  // query, for the nightly bulletin: succeeded steps past their wait window
  // with no verdict. The absence of a verdict must be queryable, not invisible.
  app.get("/api/v1/operator/agent-runs/missing-outcomes", agentsKey, async (c) => {
    const node = c.req.query("node") ?? "publish";
    const hoursRaw = Number(c.req.query("older_than_hours") ?? "72");
    const olderThanHours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 24 * 30) : 72;
    try {
      const rows = await stepsMissingOutcome(db, { node, olderThanHours });
      return c.json({ node, older_than_hours: olderThanHours, missing: rows });
    } catch (err) {
      logger.error("operator_missing_outcomes_failed", {
        message: (err as Error).message?.slice(0, 160),
      });
      return c.json({ error: "internal", message: "Query failed." }, 500);
    }
  });

  // GET /api/v1/operator/agent-ops — #151: the same CEO→VP→job summary the
  // founder sees in /admin, for Hermes and the Daily Brief. One builder,
  // two doors, zero chance of two truths.
  app.get("/api/v1/operator/agent-ops", agentsKey, async (c) => {
    const days = clampDays(c.req.query("days"));
    try {
      const summary = await agentOpsSummary(db, days);
      return c.json(summary);
    } catch (err) {
      logger.error("operator_agent_ops_failed", { message: (err as Error).message?.slice(0, 160) });
      return c.json({ error: "internal", message: "Query failed." }, 500);
    }
  });
}
