-- 20260903000001_plan_task_lifecycle.up.sql
--
-- Audit P0-02 — "Parar de usar checkbox como conclusão"
-- (RELATORIO-AUDITORIA-COMPLETA-OZVOR.md §3.1, §5.2, §16, §17)
--
-- WHAT WAS WRONG
--   plan_task.status allowed exactly proposed|accepted|rejected|done, and a
--   client ticking a checkbox wrote 'done' with no evidence of any kind
--   (apps/api/src/routes/audits.ts:1946). Execution % counted those rows
--   (audits.ts:363). The result was a brand with a failing audit showing
--   Execution 100. That number measured declared activity, not execution.
--
-- WHAT THIS MIGRATION DOES
--   1. Widens plan_task_status_check to the full lifecycle:
--        PROPOSED → DRAFTING → REVIEW → PUBLISHED → INDEXED → CITED → VERIFIED
--      with exits REJECTED, BLOCKED, EXPIRED, REGRESSED, plus the three
--      unproven states a client CAN reach.
--   2. Adds the proof columns a transition has to fill in.
--   3. Adds plan_task_transition — the append-only history (actor, timestamp,
--      evidence, reason, artifact URL). Regression re-opens an action WITHOUT
--      deleting what came before.
--   4. Backfills every pre-existing 'done' row to 'legacy_self_reported'.
--      NEVER to 'verified'. Nothing in this file can produce 'verified' —
--      only a later audit that finds the citation can.
--
-- BACKFILL SCOPE (read this before merging)
--   The founder's instruction was "the 15 existing tasks become
--   LEGACY_SELF_REPORTED, never VERIFIED". Only 'done' rows carry a completion
--   claim, so only those are rewritten; rows still sitting at proposed /
--   accepted / rejected keep their meaning, because relabelling open work as
--   "legacy done" would be a second lie in the opposite direction. Every
--   pre-existing row — all of them, whatever their status — gets a
--   plan_task_transition entry recording the backfill, so the history is
--   complete either way.
--
-- ORDERING / SAFETY
--   'done' stays in the CHECK as a DEPRECATED value so this migration is safe
--   to apply in either order relative to the code deploy: a stale API pod that
--   still writes 'done' gets a successful write, and the read side coerces it
--   to 'legacy_self_reported' (packages/llm/src/plan-task-state.ts,
--   normalizePlanTaskState). New code never writes it. A follow-up migration
--   can drop it once no 'done' rows have been written for a full release.
--
-- Idempotent. Reversible: see the matching .down.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Status CHECK — grow to the full lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE plan_task DROP CONSTRAINT IF EXISTS plan_task_status_check;

ALTER TABLE plan_task ADD CONSTRAINT plan_task_status_check CHECK (status IN (
  -- spine (RELATORIO §5.2)
  'proposed',
  'drafting',
  'review',
  'published',
  'indexed',
  'cited',
  'verified',
  -- exits
  'rejected',
  'blocked',
  'expired',
  'regressed',
  -- client-reachable, unproven — a checkbox can reach these and nothing else
  'accepted',
  'client_acknowledged',
  'manual_done_pending_verification',
  -- backfill of pre-2026-09-03 rows; never a live transition target
  'legacy_self_reported',
  -- DEPRECATED: tolerated for deploy-ordering safety only. Read side coerces
  -- it to 'legacy_self_reported'. Do not write it.
  'done'
));

-- ---------------------------------------------------------------------------
-- 2. Proof columns — what a transition must record
-- ---------------------------------------------------------------------------
ALTER TABLE plan_task
  -- set only when the state machine reaches 'verified'; cleared on regression
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ,
  -- URL of what was published/changed (required to enter 'published')
  ADD COLUMN IF NOT EXISTS artifact_url     TEXT,
  -- why it stopped / was refused (required for blocked|rejected|expired|regressed)
  ADD COLUMN IF NOT EXISTS state_reason     TEXT,
  -- who moved it last: 'client' | 'ozvor' | 'system'
  ADD COLUMN IF NOT EXISTS state_actor      TEXT,
  ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_task_state_actor_check'
  ) THEN
    ALTER TABLE plan_task ADD CONSTRAINT plan_task_state_actor_check
      CHECK (state_actor IS NULL OR state_actor IN ('client', 'ozvor', 'system'));
  END IF;
END $$;

-- Only 'verified' may carry a verified_at stamp. A row cannot claim proof it
-- is not in the state for. Enforced by the database, not by hope.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_task_verified_at_check'
  ) THEN
    ALTER TABLE plan_task ADD CONSTRAINT plan_task_verified_at_check
      CHECK (verified_at IS NULL OR status = 'verified');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. plan_task_transition — append-only history
--    Nothing here is ever UPDATEd or DELETEd; regression appends a row.
--    Grants deliberately omit UPDATE/DELETE for app_user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_task_transition (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  task_id       UUID        NOT NULL REFERENCES plan_task (id) ON DELETE CASCADE,
  from_state    TEXT,       -- NULL for the row that records creation/backfill
  to_state      TEXT        NOT NULL,
  actor_type    TEXT        NOT NULL,   -- 'client' | 'ozvor' | 'system'
  actor_id      TEXT,                   -- user id, job name, or NULL
  evidence      TEXT,                   -- what was observed, and where
  reason        TEXT,                   -- why it stopped / was refused
  artifact_url  TEXT,                   -- the thing that was produced
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_task_transition_actor_check
    CHECK (actor_type IN ('client', 'ozvor', 'system'))
);

ALTER TABLE plan_task_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_task_transition FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'plan_task_transition' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON plan_task_transition
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plan_task_transition_task
  ON plan_task_transition (task_id, created_at DESC);

-- Append-only by grant: no UPDATE, no DELETE.
GRANT SELECT, INSERT ON plan_task_transition TO app_user;
GRANT SELECT ON plan_task_transition TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- 4. Backfill — history first, then the relabel
-- ---------------------------------------------------------------------------

-- 4a. One transition row per pre-existing task, so every row that predates the
--     state machine has a first entry in its history.
INSERT INTO plan_task_transition
  (tenant_id, task_id, from_state, to_state, actor_type, actor_id, reason, created_at)
SELECT
  t.tenant_id,
  t.id,
  t.status,
  CASE WHEN t.status = 'done' THEN 'legacy_self_reported' ELSE t.status END,
  'system',
  'migration:20260903000001_plan_task_lifecycle',
  CASE WHEN t.status = 'done'
       THEN 'Backfill: completed by checkbox before verification existed. Recorded as self-reported, not verified.'
       ELSE 'Backfill: state carried unchanged into the lifecycle state machine.'
  END,
  NOW()
  FROM plan_task t
 WHERE NOT EXISTS (
   SELECT 1 FROM plan_task_transition x WHERE x.task_id = t.id
 );

-- 4b. The relabel. 'done' claimed completion with no evidence behind it.
UPDATE plan_task
   SET status           = 'legacy_self_reported',
       state_actor      = 'system',
       state_changed_at = NOW(),
       state_reason     = 'Marked done before Ozvor verified anything. Kept as self-reported until an audit confirms it.'
 WHERE status = 'done';

-- 4c. Belt and braces: nothing in this migration may have produced 'verified'.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM plan_task WHERE status = 'verified';
  IF n > 0 THEN
    RAISE EXCEPTION 'Backfill produced % verified rows. Verified is earned by an audit, never by a migration.', n;
  END IF;
END $$;

COMMIT;
