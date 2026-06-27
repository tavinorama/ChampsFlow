-- Rollback: 20260627000002_action_card_fields
-- Removes the evidence, metric, and owner columns from plan_task.
-- WARNING: Any data stored in these columns will be lost.

ALTER TABLE plan_task
  DROP COLUMN IF EXISTS owner,
  DROP COLUMN IF EXISTS metric,
  DROP COLUMN IF EXISTS evidence;
