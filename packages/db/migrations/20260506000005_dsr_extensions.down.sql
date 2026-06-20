-- =============================================================================
-- Migration: 20260506000005_dsr_extensions — DOWN
-- Reverts all changes from the UP migration.
-- Safe to run only when no active DSR requests exist (verifications will be lost).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove indexes on new columns
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_dsr_requests_verification_token;
DROP INDEX IF EXISTS idx_dsr_requests_verified_at;
DROP INDEX IF EXISTS idx_dsr_requests_otp_expires;
DROP INDEX IF EXISTS idx_users_deletion_requested;

-- ---------------------------------------------------------------------------
-- 2. Revert dsr_requests status CHECK to original set (remove 'processing')
-- ---------------------------------------------------------------------------

ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_status_check;

ALTER TABLE dsr_requests
  ADD CONSTRAINT dsr_requests_status_check
    CHECK (status IN ('received', 'in_progress', 'fulfilled', 'rejected'));

-- ---------------------------------------------------------------------------
-- 3. Remove new columns from dsr_requests
-- ---------------------------------------------------------------------------

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS verification_token;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS verification_otp_hash;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS verification_otp_expires_at;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS verification_attempts;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS verified_at;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS processed_at;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS result_artifact_url;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS submitter_ip_truncated;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS notes;

-- ---------------------------------------------------------------------------
-- 4. Remove deletion_requested_at from users
-- ---------------------------------------------------------------------------

ALTER TABLE users
  DROP COLUMN IF EXISTS deletion_requested_at;

-- Note: users.restricted is NOT dropped — it was added in initial_schema
-- (20260501000001) and is not part of this migration.

-- ---------------------------------------------------------------------------
-- 5. Drop SECURITY DEFINER function for generation_log pseudonymization
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pseudonymize_generation_log_for_erasure(UUID, UUID);
