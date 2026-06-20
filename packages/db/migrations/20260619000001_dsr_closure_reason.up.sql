-- =============================================================================
-- Migration: 20260619000001_dsr_closure_reason — UP
-- GDPR Art. 17 — distinguish a DSR closed because no personal data is held from
-- one fulfilled by actually erasing / restricting / exporting data.
--
-- Context: POST /api/dsr/:id/fulfill previously set EVERY processed request to
-- status='fulfilled' — even when no data subject could be resolved (user_id NULL
-- and no matching account for requester_email). A "fulfilled" erasure that
-- deleted nothing was therefore indistinguishable from a real one. This adds:
--   1. status value 'closed_no_data' — request validly closed; the controller
--      holds no personal data for the requester (Art. 17 permits confirming so).
--   2. closure_reason TEXT — machine-readable reason recorded on close.
-- Companion code: apps/api/src/routes/dsr.ts (fulfill handler + resolveDsrSubjects).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. closure_reason column (NULL for ordinary fulfilled / rejected rows).
-- ---------------------------------------------------------------------------
ALTER TABLE dsr_requests
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

-- Constrain to the reasons the application writes today; extend via a later
-- migration if new closure reasons are introduced.
ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_closure_reason_check;

ALTER TABLE dsr_requests
  ADD CONSTRAINT dsr_requests_closure_reason_check
    CHECK (closure_reason IS NULL OR closure_reason IN ('no_personal_data_held'));

COMMENT ON COLUMN dsr_requests.closure_reason IS
  'Why a DSR was closed without a data-deleting/-modifying action. no_personal_data_held = controller holds no personal data for requester_email (GDPR Art. 17 confirmation). NULL for ordinary fulfilled/rejected rows.';

-- ---------------------------------------------------------------------------
-- 2. Extend the status CHECK to include 'closed_no_data'.
--    (Previous set, from 20260506000005: received, processing, in_progress,
--     fulfilled, rejected.)
-- ---------------------------------------------------------------------------
ALTER TABLE dsr_requests
  DROP CONSTRAINT IF EXISTS dsr_requests_status_check;

ALTER TABLE dsr_requests
  ADD CONSTRAINT dsr_requests_status_check
    CHECK (status IN ('received', 'processing', 'in_progress', 'fulfilled', 'rejected', 'closed_no_data'));
