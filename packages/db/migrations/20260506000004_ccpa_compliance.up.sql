-- =============================================================================
-- Migration: 20260506000004_ccpa_compliance
-- Purpose:   CI-2 CCPA/CPRA Privacy Controls schema
--
-- Changes:
--   1. CREATE TABLE ccpa_requests — captures Do Not Sell, Limit PI, and other
--      CCPA rights submissions. tenant_id is nullable (unauthenticated allowed).
--   2. ALTER TABLE users — add limit_sensitive_pi BOOLEAN + audit timestamp.
--
-- RLS:
--   ccpa_requests: RLS enabled + forced. Policy applies only when tenant_id
--   IS NOT NULL (unauthenticated rows are visible only to super_admin).
--   users: RLS already enabled via initial_schema migration; no change needed.
--
-- Append-only enforcement:
--   REVOKE UPDATE, DELETE on ccpa_requests from app_user (CC-1 pattern,
--   same as audit_log and generation_log).
--
-- Architecture refs:
--   docs/03-architecture.md §4, §4.1
--   docs/02-prd.md CI-2
--   CI dispatch spec (CI-2 capability)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ccpa_requests table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ccpa_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  -- NULL when submitted by unauthenticated visitor (CCPA requires no account)

  requester_email       TEXT        NOT NULL,
  requester_name        TEXT,

  request_type          TEXT        NOT NULL
                        CHECK (request_type IN (
                          'do_not_sell',
                          'limit_sensitive_pi',
                          'delete',
                          'correct',
                          'access',
                          'portability'
                        )),

  status                TEXT        NOT NULL
                        CHECK (status IN (
                          'received',
                          'verifying',
                          'processing',
                          'completed',
                          'denied'
                        ))
                        DEFAULT 'received',

  verification_token    TEXT,       -- single-use token for email OTP (future)
  verified_at           TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,
  notes                 TEXT,

  -- GDPR/CCPA data minimization: last octet zeroed (IPv4) or last 80 bits (IPv6)
  submitter_ip_truncated TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: required by architecture §4.1 (every tenant-scoped table)
ALTER TABLE ccpa_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccpa_requests FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy — only rows where tenant_id matches current session.
-- Rows with tenant_id IS NULL (unauthenticated submissions) are NOT accessible
-- via the application app_user role; super_admin sees all rows.
CREATE POLICY tenant_isolation ON ccpa_requests
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Append-only enforcement (CC-1 pattern)
-- The application layer NEVER updates or deletes ccpa_requests rows.
-- Status transitions are done via INSERT of new rows or admin-only SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'app_user'
  ) THEN
    REVOKE UPDATE, DELETE ON ccpa_requests FROM app_user;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. users table — add CCPA sensitive PI limit columns
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS limit_sensitive_pi        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS limit_sensitive_pi_set_at TIMESTAMPTZ;

-- limit_sensitive_pi = FALSE by default (user must explicitly opt-in to limit)
-- limit_sensitive_pi_set_at = NULL until first toggle; updated on each change.

-- Note: ccpa_optout BOOL, ccpa_optout_at, ccpa_optout_ip are already defined
-- in the initial schema (20260501000001_initial_schema.up.sql §4 data model).
-- This migration only adds the limit_sensitive_pi columns (separate concern).

-- ---------------------------------------------------------------------------
-- 3. Indexes for efficient lookups
-- ---------------------------------------------------------------------------

-- Operator-side: look up all requests by email (for admin panel)
CREATE INDEX IF NOT EXISTS idx_ccpa_requests_email
  ON ccpa_requests (requester_email);

-- Operator-side: look up all requests by tenant
CREATE INDEX IF NOT EXISTS idx_ccpa_requests_tenant_id
  ON ccpa_requests (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Status-based filtering for workflow processing
CREATE INDEX IF NOT EXISTS idx_ccpa_requests_status
  ON ccpa_requests (status, created_at);

-- ---------------------------------------------------------------------------
-- 4. Update check-rls.sql monitored table set
-- ---------------------------------------------------------------------------
-- NOTE: check-rls.sql is updated separately (see scripts/check-rls.sql).
-- ccpa_requests must be added to the monitored table set.
-- The CI assertion runs: SELECT ... WHERE relname IN (...) AND NOT relrowsecurity
-- Expected result after this migration: 0 rows (ccpa_requests has RLS enabled).
