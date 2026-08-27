-- ops.memory_lesson — the durable store for consolidated sphere memory (5.F.1).
--
-- WHY THIS EXISTS. The spheres' "memory" today is a sliding window: the
-- CONTENT_LESSONS ruler is 7 static lines in code, and every per-run context
-- ([memory] snapshots, Redis artifacts with a 7-day TTL) forgets monthly.
-- The memory-consolidation graph distills the last ~30 days of REAL outcomes
-- (publishes per channel, harvested metrics, founder rejections with the
-- literal reason, expired approvals, closed verdicts) into per-channel
-- lessons — and ONLY the batch the founder explicitly approved on Telegram
-- may land here. The graph runner then injects the newest row as the
-- [__memory__] artifact into the critics of marketing graphs, next to
-- [__lessons__].
--
-- SHAPE: append-only document ledger, newest row wins on read. One row per
-- approved consolidation (the whole lessons block as TEXT), never an edit —
-- the same "a verdict that can be edited is not a verdict" rule as
-- ops.agent_outcome. History stays queryable: how the house's lessons evolved
-- month over month is itself a record worth keeping.
--
-- PII: none. Lessons are distilled from ops.* aggregates (slugs, statuses,
-- bounded summaries, numbers) — no tenant data ever reaches this table.

CREATE TABLE IF NOT EXISTS ops.memory_lesson (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The memory-consolidation run whose approval produced this batch —
  -- auditable back to the founder's Telegram yes. SET NULL keeps the lesson
  -- alive even if old runs are ever pruned.
  source_run_id UUID        REFERENCES ops.agent_run (id) ON DELETE SET NULL,
  -- The full approved lessons block (PT, max ~12 lines, each citing its
  -- evidence), exactly as the founder approved it.
  lessons       TEXT        NOT NULL,
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The runner reads "the newest approved batch" every tick — index the sort.
CREATE INDEX IF NOT EXISTS idx_memory_lesson_time ON ops.memory_lesson (approved_at DESC);

-- Grants mirror ops.agent_outcome: append-only for the runtime role. A lesson
-- batch that can be edited after approval is not what the founder approved.
GRANT SELECT, INSERT ON ops.memory_lesson TO app_user;
REVOKE UPDATE, DELETE ON ops.memory_lesson FROM app_user;

GRANT SELECT ON ops.memory_lesson TO organicposts_admin;
