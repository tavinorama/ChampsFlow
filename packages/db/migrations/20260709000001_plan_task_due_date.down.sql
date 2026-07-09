-- Rollback: 20260709000001_plan_task_due_date
-- Removes the scheduling column added to plan_task.
-- WARNING: any scheduled due dates stored in this column will be lost.

DROP INDEX IF EXISTS idx_plan_task_due_date;

ALTER TABLE plan_task
  DROP COLUMN IF EXISTS due_date;
