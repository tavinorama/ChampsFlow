/**
 * operator-graphs.ts — #164 body: start and inspect graph runs.
 *
 * Deliberately thin. Starting a run is ONE INSERT (ops.agent_run,
 * status 'running'); the worker's 10-minute tick picks it up from the
 * substrate — the api never talks to BullMQ or Hermes, so a Redis or VPS
 * outage cannot break the start endpoint, and there is exactly one
 * execution path to reason about.
 *
 * Approval/rejection of a waiting approval node is NOT here on purpose:
 * that is POST /api/v1/operator/agent-steps/:id/finish (#445) — one door
 * for step decisions, human or machine.
 */

import { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { requireOperatorKey } from "./api-keys";
import { validateGraph } from "../lib/agent-graphs";
import { GRAPH_REGISTRY } from "../lib/graph-runner";
import { startRun } from "../lib/agent-substrate";

export function registerOperatorGraphRoutes(app: Hono, db: PostgresClient): void {
  const graphsKey = requireOperatorKey(db, ["operator", "business"]);

  // GET /api/v1/operator/graphs — the runnable catalog, with validation
  // verdicts (a registry entry that fails validation is a deploy bug and
  // must be visible here, not discovered at start time).
  app.get("/api/v1/operator/graphs", graphsKey, async (c) => {
    const graphs = Object.values(GRAPH_REGISTRY).map((def) => ({
      slug: def.slug,
      version: def.version,
      vp_owner: def.vpOwner,
      description: def.description,
      nodes: def.nodes.length,
      validation: validateGraph(def),
    }));
    return c.json({ graphs });
  });

  // POST /api/v1/operator/graph-runs — start a run. Picked up by the worker
  // tick within ~10 minutes; the response says so instead of pretending
  // execution is immediate.
  app.post("/api/v1/operator/graph-runs", graphsKey, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { slug?: string; trigger?: string } | null;
    const slug = body?.slug ?? "";
    const def = GRAPH_REGISTRY[slug];
    if (!def) {
      return c.json(
        { error: "bad_request", message: `unknown graph '${slug}'. Known: ${Object.keys(GRAPH_REGISTRY).join(", ")}.` },
        400
      );
    }
    const verdict = validateGraph(def);
    if (!verdict.valid) {
      return c.json({ error: "invalid_graph", message: verdict.errors.join(" | ") }, 500);
    }
    const trigger = `${(body?.trigger ?? "operator").slice(0, 40)}:v${def.version}`;
    const runId = await startRun(db, { graph: def.slug, trigger, vpOwner: def.vpOwner });
    return c.json(
      { run_id: runId, graph: def.slug, version: def.version, note: "picked up by the worker tick within ~10 minutes" },
      201
    );
  });

  // GET /api/v1/operator/graph-runs/:id — the run and its per-node states.
  app.get("/api/v1/operator/graph-runs/:id", graphsKey, async (c) => {
    const runId = c.req.param("id");
    if (!runId) return c.json({ error: "bad_request", message: "run id is required." }, 400);
    const runRes = await db.query<{
      id: string;
      graph: string;
      trigger: string;
      status: string;
      started_at: string;
      ended_at: string | null;
    }>(
      `SELECT id, graph, "trigger", status, started_at, ended_at FROM ops.agent_run WHERE id = $1`,
      [runId]
    );
    const run = runRes.rows[0];
    if (!run) return c.json({ error: "not_found", message: "run not found." }, 404);
    const steps = await db.query<{
      id: string;
      node: string;
      status: string;
      summary: string | null;
      engine: string | null;
      ms: number | null;
      started_at: string;
    }>(
      `SELECT id, node, status, summary, engine, ms, started_at
         FROM ops.agent_step WHERE run_id = $1 ORDER BY started_at ASC`,
      [runId]
    );
    return c.json({ run, steps: steps.rows });
  });
}
