-- =============================================================================
-- Migration DOWN: 20260506000002_publish_jobs_extras
-- Reverts: next_attempt_at, published_at columns + status constraint extension.
--
-- WARNING: Running this down migration will remove 'pending' and 'cancelled'
-- status values from the CHECK constraint. If any rows have status='pending'
-- or status='cancelled', the original constraint addition will fail.
-- Ensure no such rows exist before rolling back.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Restore retry index to original (queued only)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_publish_jobs_retry;
DROP INDEX IF EXISTS idx_publish_jobs_status_scheduled;

CREATE INDEX IF NOT EXISTS idx_publish_jobs_status
  ON publish_jobs (status, scheduled_at)
  WHERE status = 'queued';

-- ---------------------------------------------------------------------------
-- Revert status CHECK constraint to original 4-value set
-- ---------------------------------------------------------------------------
ALTER TABLE publish_jobs
  DROP CONSTRAINT IF EXISTS publish_jobs_status_check;

ALTER TABLE publish_jobs
  ADD CONSTRAINT publish_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'done', 'failed'));

-- ---------------------------------------------------------------------------
-- Drop added columns
-- ---------------------------------------------------------------------------
ALTER TABLE publish_jobs
  DROP COLUMN IF EXISTS published_at;

ALTER TABLE publish_jobs
  DROP COLUMN IF EXISTS next_attempt_at;
