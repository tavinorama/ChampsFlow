-- =============================================================================
-- Migration: 20260506000002_publish_jobs_extras
-- Description: Extends publish_jobs table for C2 Scheduler capability.
--
-- Changes:
--   1. Add next_attempt_at TIMESTAMPTZ — used by worker exponential backoff.
--   2. Add published_at TIMESTAMPTZ — timestamp when platform confirmed publish.
--   3. Extend status CHECK constraint to include 'pending' and 'cancelled':
--        'pending'    — created by schedule route, waiting for BullMQ enqueue
--        'queued'     — BullMQ delayed job enqueued
--        'processing' — worker has dequeued and started processing
--        'done'       — published successfully
--        'failed'     — permanently failed (non-retryable or max retries exceeded)
--        'cancelled'  — user cancelled before scheduled_at
--
-- RLS: No new table; publish_jobs already has ENABLE + FORCE RLS + tenant_isolation
--      policy from migration 20260501000001_initial_schema. check-rls.sh passes
--      without modification.
--
-- Architecture refs:
--   - §4 Data Model: publish_jobs schema
--   - §7 Data Flow C2/C3
--   - Threat Model S-9: token_expires_at check precedes decrypt
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add next_attempt_at column
--    Stores the earliest timestamp the worker should retry a failed-retryable job.
--    NULL = no retry scheduled (new job or permanently failed/done).
-- ---------------------------------------------------------------------------
ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Add published_at column
--    Stores the UTC timestamp at which the platform API confirmed publication.
--    Set by worker on status='done'. NULL for all other statuses.
-- ---------------------------------------------------------------------------
ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 3. Extend status CHECK constraint to include 'pending' and 'cancelled'.
--
--    Strategy: DROP the old CHECK constraint by name, then ADD a new one
--    covering all six statuses. We use DO $$ to look up the constraint name
--    dynamically (avoids hard-coding the Postgres auto-generated name).
--
--    The existing rows all have status IN ('queued','processing','done','failed')
--    which are a subset of the new constraint — no data migration needed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find the CHECK constraint on publish_jobs.status
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'publish_jobs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  -- Drop it if found
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE publish_jobs DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END
$$;

-- Add the new, extended CHECK constraint with an explicit name
ALTER TABLE publish_jobs
  ADD CONSTRAINT publish_jobs_status_check
    CHECK (status IN ('pending', 'queued', 'processing', 'done', 'failed', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Index: scheduled jobs pending/queued by scheduled_at for worker polling.
-- Replaces the existing partial index (which only covered 'queued').
-- Drop old index first (IF EXISTS for idempotency); create new one.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_publish_jobs_status;

CREATE INDEX IF NOT EXISTS idx_publish_jobs_status_scheduled
  ON publish_jobs (status, scheduled_at)
  WHERE status IN ('pending', 'queued');

-- Index for retry scheduling: find jobs due for retry
CREATE INDEX IF NOT EXISTS idx_publish_jobs_retry
  ON publish_jobs (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL AND status = 'queued';
