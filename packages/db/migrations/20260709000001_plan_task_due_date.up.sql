-- 20260709000001_plan_task_due_date.up.sql
--
-- Batch D/2: let a client SCHEDULE a recommended fix (plan_task) to a target
-- date, so the Fix Queue + Calendar can surface "due soon / overdue". In-app
-- only — no reminder emails, no cron, no new outbound behaviour. Nullable, so
-- unscheduled tasks (the default) are untouched and every existing reader keeps
-- working.

ALTER TABLE plan_task
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- Fast lookup of a tenant's upcoming/overdue scheduled fixes.
CREATE INDEX IF NOT EXISTS idx_plan_task_due_date ON plan_task (due_date)
  WHERE due_date IS NOT NULL;
