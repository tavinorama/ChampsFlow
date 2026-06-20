-- =============================================================================
-- Migration: 20260506000005_dsr_extensions
-- Purpose:   CI-3/CI-4/CI-5 DSR workflow extensions
--
-- Changes:
--   1. ALTER TABLE dsr_requests — add OTP verification columns, processing
--      metadata, and submitter_ip_truncated.
--   2. ALTER TABLE users — add deletion_requested_at TIMESTAMPTZ.
--      (users.restricted BOOLEAN already added in initial_schema 20260501000001.)
--
-- Prerequisites:
--   20260501000001_initial_schema — dsr_requests table exists with base columns.
--   users.restricted already present (added in initial_schema).
--
-- RLS:
--   dsr_requests: RLS already ENABLED + FORCED; policies already created.
--   No new policies needed — existing tenant_isolation + dsr_admin_all cover
--   the new columns.
--   users: RLS already ENABLED + FORCED; no change.
--
-- Security:
--   verification_otp_hash stores SHA-256(otp + salt) ONLY — never plaintext OTP.
--   verification_token is a random hex token for status-check URL (not the OTP).
--   Both columns are TEXT (opaque) — no functional index on OTP hash column
--   to avoid timing oracle via index scan.
--
-- Retention:
--   dsr_requests: closed_at + 30 days then deleted (ROPA Activity 7).
--   users.deletion_requested_at: set on erasure DSR verification; hard delete
--   job runs after 30-day grace period.
--
-- Architecture refs:
--   docs/03-architecture.md §4, §4.1, §13 DSR Workflow
--   docs/02-prd.md CI-3, CI-4, CI-5
--   docs/compliance/dpia.md §4.1
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend dsr_requests with OTP + processing columns
-- ---------------------------------------------------------------------------

-- verification_token: random hex token returned to submitter; used to
-- poll GET /api/dsr/:id/status without exposing the row UUID directly.
-- Not the OTP. Retention: same as dsr_requests row.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS verification_token TEXT;

-- verification_otp_hash: SHA-256(otp_plaintext || salt) — NEVER plaintext.
-- OTP itself is only in transit (email delivery + user browser memory).
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS verification_otp_hash TEXT;  -- HASHED: SHA-256(otp+salt) only

-- verification_otp_expires_at: UTC expiry; OTP is invalid after this timestamp.
-- Server must check NOW() < verification_otp_expires_at on every verify attempt.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMPTZ;

-- verification_attempts: server-side counter incremented on each /verify call.
-- S-11: if verification_attempts > 5, OTP is invalidated (otp_hash set NULL,
-- expiry set to past). This prevents brute-force.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS verification_attempts INT NOT NULL DEFAULT 0;

-- verified_at: set when OTP is accepted (status → processing).
-- Mirrors architecture §13 "identity_verified_at" (original column name);
-- this column is additive — identity_verified_at is kept for backwards compat.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- processed_at: set when fulfillment is complete (status → fulfilled).
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- result_artifact_url: S3-style URL for access/portability JSON export packages.
-- Only set for access and portability fulfillment.
-- NULL for correction/restriction/erasure.
-- URL itself is opaque — presigned by backend at delivery time; never stored
-- with embedded credentials (path only).
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS result_artifact_url TEXT;

-- submitter_ip_truncated: truncated IP (last IPv4 octet zeroed, or last 80 IPv6
-- bits zeroed) for rate-limiting evidence and legal record.
-- GDPR data minimization: never store full IP.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS submitter_ip_truncated TEXT;

-- notes: free-text admin notes or auto-populated flags (e.g., 'lost_email_escalation').
-- Not exposed to the requester.
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- Verify CHECK constraint on request_type covers all 5 types
-- (already set in initial_schema: access, erasure, portability, correction, restriction)
-- No change needed — verifying here for documentation.
-- CHECK (request_type IN ('access','erasure','portability','correction','restriction'))
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verify status CHECK covers 'processing' (needed for post-verify state)
-- Initial schema has: received, in_progress, fulfilled, rejected.
-- We need 'processing' between 'received' (intake) and 'in_progress' (admin queue).
-- Add it by recreating the CHECK constraint.
-- ---------------------------------------------------------------------------

-- Drop and re-add the status CHECK to include 'processing'.
-- This requires temporarily dropping the constraint and re-adding it.
ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_status_check;

ALTER TABLE dsr_requests
  ADD CONSTRAINT dsr_requests_status_check
    CHECK (status IN ('received', 'processing', 'in_progress', 'fulfilled', 'rejected'));

-- ---------------------------------------------------------------------------
-- Indexes for new columns
-- ---------------------------------------------------------------------------

-- Index on verification_token for fast status lookups by token.
CREATE INDEX IF NOT EXISTS idx_dsr_requests_verification_token
  ON dsr_requests (verification_token)
  WHERE verification_token IS NOT NULL;

-- Index on verified_at for SLA monitoring queries.
CREATE INDEX IF NOT EXISTS idx_dsr_requests_verified_at
  ON dsr_requests (verified_at)
  WHERE verified_at IS NOT NULL;

-- Index on verification_otp_expires_at for cleanup jobs.
CREATE INDEX IF NOT EXISTS idx_dsr_requests_otp_expires
  ON dsr_requests (verification_otp_expires_at)
  WHERE verification_otp_expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Extend users with deletion_requested_at
-- ---------------------------------------------------------------------------

-- deletion_requested_at: set when an erasure DSR is verified and erasure cascade
-- is queued. Soft-delete marker. Hard-delete cron runs after 30-day grace.
-- NULL = no pending deletion. Set alongside deleted_at (which marks the soft-delete).
-- Retention: users row retained for 30-day grace period after this is set; then
-- permanently purged per ROPA Activity 1 retention schedule.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Index for cron job: find users pending hard-delete (deletion_requested_at < NOW()-30d).
CREATE INDEX IF NOT EXISTS idx_users_deletion_requested
  ON users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Confirmation: users.restricted already present from initial_schema.
-- Verified via column definition in 20260501000001:
--   restricted BOOLEAN NOT NULL DEFAULT FALSE
-- No ALTER needed for that column.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Grants: no new tables created; existing grants on dsr_requests and users
-- from initial_schema already cover the new columns:
--   app_user: SELECT, INSERT, UPDATE on dsr_requests
--   organicposts_admin: SELECT, INSERT, UPDATE on dsr_requests
--   app_user: SELECT, INSERT, UPDATE on users
--   organicposts_admin: SELECT on users
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. DSR erasure pseudonymization helper function (SECURITY DEFINER)
--
-- app_user is REVOKED from UPDATE on generation_log (CC-1 append-only rule).
-- DSR erasure legally requires pseudonymizing generation_log rows for a
-- deleted user (GDPR Art. 17 — row retained for accountability; direct
-- identifiers removed). This function runs as the DB owner (SECURITY DEFINER)
-- and is the ONLY path to UPDATE generation_log.user_id.
--
-- Called by: POST /api/dsr/:id/fulfill (erasure path)
-- Security: function validates user_id + tenant_id before update.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pseudonymize_generation_log_for_erasure(
  p_user_id   UUID,
  p_tenant_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows INT;
BEGIN
  -- Validate inputs not null
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id and p_tenant_id must not be null';
  END IF;

  UPDATE generation_log
  SET user_id    = NULL,
      prompt_user = '[redacted-dsr-erasure]'
  WHERE user_id   = p_user_id
    AND tenant_id = p_tenant_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

-- Grant EXECUTE to app_user so the Hono API can call this function.
-- This is the ONLY permitted path to UPDATE generation_log.
GRANT EXECUTE ON FUNCTION pseudonymize_generation_log_for_erasure(UUID, UUID) TO app_user;
GRANT EXECUTE ON FUNCTION pseudonymize_generation_log_for_erasure(UUID, UUID) TO organicposts_admin;
