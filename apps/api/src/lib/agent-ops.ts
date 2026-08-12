/**
 * agent-ops.ts — #151: the CEO→VP→job analysis, as one query builder.
 *
 * Since 11/08 every agent run lands in ops.agent_run with a vp_owner (the
 * task-server hook, the social harvest, the graph runner). This module turns
 * that record into the drill-down the org chart promised: department totals →
 * jobs per department → recent runs. ONE builder feeds BOTH surfaces (the
 * founder's /admin tab and the operator route Hermes reads for the Daily
 * Brief), so the two can never tell different stories — the exact
 * two-screens-two-truths disease of #163, prevented structurally.
 *
 * PII-free by construction: ops.* holds slugs, statuses, hashes and numbers;
 * nothing here selects or joins tenant data.
 */

import type { PostgresClient } from "../../../../packages/shared/src/db-client";

export interface VpRow {
  vp_owner: string;
  runs: number;
  succeeded: number;
  failed: number;
  running: number;
  cost_cents: number;
  last_run_at: string | null;
}

export interface GraphRow {
  vp_owner: string;
  graph: string;
  runs: number;
  succeeded: number;
  failed: number;
  last_run_at: string | null;
}

export interface RecentRun {
  id: string;
  graph: string;
  vp_owner: string;
  trigger: string;
  status: string;
  engine_used: string | null;
  started_at: string;
  ended_at: string | null;
  steps: number;
}

export interface AgentOpsSummary {
  days: number;
  vps: VpRow[];
  graphs: GraphRow[];
  recent: RecentRun[];
}

/** Clamp the window: 1–90 days, default 7. Bad input degrades to default. */
export function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, Math.round(n)));
}

export async function agentOpsSummary(
  db: PostgresClient,
  days: number
): Promise<AgentOpsSummary> {
  const vps = await db.query<VpRow>(
    `SELECT vp_owner,
            COUNT(*)::int AS runs,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE status = 'running')::int AS running,
            COALESCE(SUM(cost_cents), 0)::float AS cost_cents,
            MAX(started_at)::text AS last_run_at
       FROM ops.agent_run
      WHERE started_at >= NOW() - make_interval(days => $1)
      GROUP BY vp_owner
      ORDER BY runs DESC`,
    [days]
  );

  const graphs = await db.query<GraphRow>(
    `SELECT vp_owner, graph,
            COUNT(*)::int AS runs,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            MAX(started_at)::text AS last_run_at
       FROM ops.agent_run
      WHERE started_at >= NOW() - make_interval(days => $1)
      GROUP BY vp_owner, graph
      ORDER BY vp_owner, runs DESC`,
    [days]
  );

  const recent = await db.query<RecentRun>(
    `SELECT r.id, r.graph, r.vp_owner, r."trigger", r.status, r.engine_used,
            r.started_at::text AS started_at, r.ended_at::text AS ended_at,
            (SELECT COUNT(*) FROM ops.agent_step s WHERE s.run_id = r.id)::int AS steps
       FROM ops.agent_run r
      WHERE r.started_at >= NOW() - make_interval(days => $1)
      ORDER BY r.started_at DESC
      LIMIT 20`,
    [days]
  );

  return { days, vps: vps.rows, graphs: graphs.rows, recent: recent.rows };
}
