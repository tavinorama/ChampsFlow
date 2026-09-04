-- 20260903000001_plan_task_lifecycle.down.sql
--
-- Reverses the Verified Execution lifecycle (audit P0-02).
--
-- WHAT REVERTS CLEANLY
--   The CHECK constraint, the proof columns, and the transition table.
--
-- WHAT DOES NOT COME BACK
--   The distinction between "the client said it was done" and "an audit proved
--   it". Every lifecycle state is collapsed back onto the old four-value
--   vocabulary, so a row that was legitimately 'verified' and a row that was
--   only 'legacy_self_reported' both become 'done' again — which is exactly the
--   ambiguity this migration existed to remove. The history in
--   plan_task_transition is dropped with the table.
--
--   If the intent is to stop SHOWING the verified number rather than to undo the
--   schema, revert the UI/API instead and leave this migration applied. Nothing
--   is lost that way. Rolling this back loses evidence.

BEGIN;

-- 1. Collapse lifecycle states onto the legacy vocabulary before narrowing the
--    CHECK, or the constraint would refuse to apply.
UPDATE plan_task SET status = 'done'
 WHERE status IN ('verified', 'legacy_self_reported', 'manual_done_pending_verification');

UPDATE plan_task SET status = 'accepted'
 WHERE status IN ('drafting', 'review', 'published', 'indexed', 'cited',
                  'regressed', 'blocked', 'client_acknowledged');

UPDATE plan_task SET status = 'rejected'
 WHERE status = 'expired';

ALTER TABLE plan_task DROP CONSTRAINT IF EXISTS plan_task_status_check;
ALTER TABLE plan_task ADD CONSTRAINT plan_task_status_check
  CHECK (status IN ('proposed', 'accepted', 'rejected', 'done'));

-- 2. Proof columns
ALTER TABLE plan_task DROP CONSTRAINT IF EXISTS plan_task_verified_at_check;
ALTER TABLE plan_task DROP CONSTRAINT IF EXISTS plan_task_state_actor_check;
ALTER TABLE plan_task
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS artifact_url,
  DROP COLUMN IF EXISTS state_reason,
  DROP COLUMN IF EXISTS state_actor,
  DROP COLUMN IF EXISTS state_changed_at;

-- 3. History
DROP TABLE IF EXISTS plan_task_transition;

COMMIT;
