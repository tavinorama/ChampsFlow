-- =============================================================================
-- Migration: 20260506000003_dpa_acknowledgments
-- Description: DPA Onboarding Gate (CI-1) schema.
--              Adds dpa_acknowledgments table for per-version acknowledgment
--              records, and adds current_dpa_version to users for fast
--              middleware check.
--
-- RLS: dpa_acknowledgments is tenant-scoped; ENABLE + FORCE + tenant_isolation
--      per §4.1 mandatory pattern.
-- CC-1: No UPDATE or DELETE privileges granted to app_user on dpa_acknowledgments
--       (acknowledgment rows are append-only legal evidence records).
-- GDPR data minimization: IP stored truncated only (last octet zeroed for IPv4;
--       last 80 bits zeroed for IPv6). Full IP is never persisted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: dpa_acknowledgments
-- Records every user DPA acknowledgment per DPA version.
-- Retention: account life + 30-day grace (ROPA Activity 1 carry-over);
--            minimum 3 years per GDPR Art. 5(2) accountability obligation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dpa_acknowledgments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  dpa_version      TEXT NOT NULL,
  variant          TEXT NOT NULL
                     CHECK (variant IN ('EU', 'US')),
  country_code     CHAR(2),                -- ISO 3166-1 alpha-2, e.g. 'DE', 'US', NULL if unresolved
  -- GDPR data minimization: IPv4 last octet zeroed (e.g. '1.2.3.0');
  -- IPv6 last 80 bits zeroed (first 48 bits retained).
  -- Never stored as full IP.
  ip_truncated     TEXT,
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique: one row per (user, dpa_version). Re-acknowledgment on version bump
  -- inserts a new row; ON CONFLICT DO NOTHING allows idempotent re-submits.
  CONSTRAINT uq_dpa_acknowledgments_user_version
    UNIQUE (user_id, dpa_version)
);

-- RLS: §4.1 mandatory pattern
ALTER TABLE dpa_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dpa_acknowledgments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON dpa_acknowledgments
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dpa_ack_user
  ON dpa_acknowledgments (user_id);

CREATE INDEX IF NOT EXISTS idx_dpa_ack_tenant
  ON dpa_acknowledgments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_dpa_ack_user_version
  ON dpa_acknowledgments (user_id, dpa_version);

-- Grants
-- SELECT + INSERT only — no UPDATE or DELETE for app_user (append-only legal record)
GRANT SELECT, INSERT ON dpa_acknowledgments TO app_user;
GRANT SELECT ON dpa_acknowledgments TO organicposts_admin;

-- CC-1 enforcement: explicitly revoke UPDATE and DELETE from app_user
REVOKE UPDATE, DELETE ON dpa_acknowledgments FROM app_user;

-- ---------------------------------------------------------------------------
-- ALTER TABLE: users
-- Add current_dpa_version column for fast middleware check.
-- Denormalized: set when user acknowledges; compared against DPA_CURRENT_VERSION
-- env var in requireDpaAcknowledged middleware (O(1) lookup, no JOIN required).
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_dpa_version TEXT;

-- Index for middleware lookups (fetch user row by supabase_auth_uid)
-- Note: idx_users_supabase_uid already exists from initial schema; no new index needed.
-- current_dpa_version is read alongside other user fields in a single SELECT.

-- ---------------------------------------------------------------------------
-- Update check-rls assertion: add dpa_acknowledgments to the monitored table set
-- ---------------------------------------------------------------------------
-- NOTE: The check-rls.sql script must be updated to include 'dpa_acknowledgments'
-- in its IN-list. See packages/db/scripts/check-rls.sql update below.
-- This migration comment serves as the explicit record of that requirement.
-- The check-rls.sql update is performed as a separate file edit (not SQL DDL).
