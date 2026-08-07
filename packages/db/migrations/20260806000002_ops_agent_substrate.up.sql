-- ops schema — the agent substrate (#161a).
--
-- WHY THIS EXISTS. The company's agent organization has run for weeks with
-- its only memory being n8n's execution history: we pay a workflow SaaS to be
-- our database, its credit ceiling hurts precisely because it holds state,
-- and the 22:45 bulletin lied because the model had to GUESS raw log schema —
-- there was nothing structured to query. All 46 prior migrations describe the
-- PRODUCT; none describe the agents themselves. These three tables are the
-- first place the organization can read its own record.
--
-- WHY NOT A WAREHOUSE. Full org at speed ≈ 200–500 steps/day ≈ ~180k rows/yr.
-- ClickHouse earns its keep at tens of millions of rows per scan. Postgres
-- serves this for decades. The one fast-growing vector — raw LLM transcripts
-- — is excluded by design: steps store input_hash/output_hash + a bounded
-- summary, never raw text (ai_generation_log's pattern, GEO-A6).
--
-- WHY A SEPARATE SCHEMA. Company-operations data must not be reachable
-- through any tenant path. Isolation here is by GRANT, not by RLS policy:
-- product tables need row policies because tenants share them; ops tables
-- have no tenant dimension, so schema-level grants are the whole story.
--
-- THE THREE DECIDED SHAPES (task #161, 2026-08-05):
--  1. parent_step_id IS the graph. Fan-out, joins-back and resumption are SQL
--     queries over one column — no framework required to have a graph.
--  2. agent_outcome is the SAME missing piece as the product's plan_task
--     without a result: act → wait → measure → verdict. One design, two uses.
--  3. vp_owner on agent_run is #151's department chaining: the CEO→VP→job
--     drill-down becomes GROUP BY vp_owner, not a feature.
--
-- FOUNDER RULE PRESERVED: the watcher stays outside the watched. Incident
-- Watch and check-video-posted keep their local VPS records and do NOT write
-- here — a substrate outage must never blind the thing that reports outages.

CREATE SCHEMA IF NOT EXISTS ops;

-- One row per graph execution ("the daily video ran at 15:00").
CREATE TABLE IF NOT EXISTS ops.agent_run (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which graph definition ran (slug, e.g. 'daily-video', 'weekly-blog').
  graph        TEXT        NOT NULL,
  -- What started it: cron slug, 'manual', 'telegram', another run's id.
  trigger      TEXT        NOT NULL,
  -- The department that owns this work — #151's GROUP BY key.
  vp_owner     TEXT        NOT NULL
                 CHECK (vp_owner IN ('engineering', 'marketing', 'sales', 'finance', 'legal', 'cx', 'ceo')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  -- Which engine ultimately did the work (claude/codex/gemini) — the fallback
  -- chain's answer, mirrored from the Hermes Task Server's engine_used.
  engine_used  TEXT,
  -- Measured cents, summed from steps at close. NULL until the run ends.
  cost_cents   NUMERIC(10, 4)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_owner_time ON ops.agent_run (vp_owner, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_run_graph_time ON ops.agent_run (graph, started_at DESC);

-- One row per node execution inside a run. parent_step_id encodes the DAG.
CREATE TABLE IF NOT EXISTS ops.agent_step (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL REFERENCES ops.agent_run (id) ON DELETE CASCADE,
  -- Node slug within the graph definition (e.g. 'briefing', 'debate-hook',
  -- 'synthesis', 'human-approval', 'wait-72h', 'harvest', 'verdict').
  node            TEXT        NOT NULL,
  -- THE graph column. NULL = root. Multiple children of one parent = fan-out
  -- (the debate's parallel critics); a child with a chosen parent = the join.
  parent_step_id  UUID        REFERENCES ops.agent_step (id) ON DELETE SET NULL,
  -- Hashes, never raw text (ai_generation_log's privacy pattern). The
  -- transcript lives with the engine that produced it; the substrate records
  -- that work happened and what it was derived from.
  input_hash      TEXT,
  output_hash     TEXT,
  -- Bounded human-readable gist ("chose angle B: contractor story"), capped
  -- by the writer, never a transcript.
  summary         TEXT,
  status          TEXT        NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped', 'waiting')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ms              INTEGER,
  engine          TEXT,
  cost_cents      NUMERIC(10, 4)
);

CREATE INDEX IF NOT EXISTS idx_agent_step_run ON ops.agent_step (run_id);
CREATE INDEX IF NOT EXISTS idx_agent_step_parent ON ops.agent_step (parent_step_id);

-- The read-it-back row — the piece whose absence caused every silent failure
-- of 05-06/08 (video, plan_task, w_member_social, api_spend). A step that
-- publishes something schedules a harvest; the harvest writes the outcome;
-- the verdict re-weights the next run's signal. No outcome row after the
-- wait window = the loop is broken, and THAT is queryable too.
CREATE TABLE IF NOT EXISTS ops.agent_outcome (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id       UUID        NOT NULL REFERENCES ops.agent_step (id) ON DELETE CASCADE,
  -- What was measured: 'yt_views_72h', 'li_impressions_72h', 'blog_sessions_7d'.
  metric        TEXT        NOT NULL,
  value_before  NUMERIC,
  value_after   NUMERIC,
  measured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Normalized change, computed by the writer so queries never re-derive it.
  lift          NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_agent_outcome_step ON ops.agent_outcome (step_id);
CREATE INDEX IF NOT EXISTS idx_agent_outcome_metric_time ON ops.agent_outcome (metric, measured_at DESC);

-- Grants — the isolation story. app_user (the runtime role every product
-- request runs as) gets what the Operator API bridge needs and nothing more:
-- runs and steps are updatable (status transitions); outcomes are APPEND-ONLY
-- like every measurement ledger in this codebase (dpa_acknowledgments
-- precedent) — a verdict that can be edited is not a verdict.
GRANT USAGE ON SCHEMA ops TO app_user;
GRANT SELECT, INSERT, UPDATE ON ops.agent_run TO app_user;
GRANT SELECT, INSERT, UPDATE ON ops.agent_step TO app_user;
GRANT SELECT, INSERT ON ops.agent_outcome TO app_user;
REVOKE UPDATE, DELETE ON ops.agent_outcome FROM app_user;

GRANT USAGE ON SCHEMA ops TO organicposts_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA ops TO organicposts_admin;
