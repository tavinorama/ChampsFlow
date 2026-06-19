-- =============================================================================
-- Migration: 20260619000001_dsr_closure_reason — DOWN
-- Reverts the closure_reason column and the 'closed_no_data' status value.
-- =============================================================================

-- 1. Revert the status CHECK to the prior set.
--    NOTE: fails if any rows still carry status='closed_no_data' — migrate those
--    rows to another terminal status before rolling back.
ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_status_check;

ALTER TABLE dsr_requests
  ADD CONSTRAINT dsr_requests_status_check
    CHECK (status IN ('received', 'processing', 'in_progress', 'fulfilled', 'rejected'));

-- 2. Drop closure_reason and its constraint.
ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_closure_reason_check;

ALTER TABLE dsr_requests
  DROP COLUMN IF EXISTS closure_reason;
