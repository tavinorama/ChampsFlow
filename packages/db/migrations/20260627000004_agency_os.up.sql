-- =============================================================================
-- Migration: 20260627000004_agency_os
-- Capability: Agency OS v1
-- Date: 2026-06-27
-- Jurisdiction: Brazil (LGPD) + EU (GDPR) + US (CCPA/CPRA)
--
-- Changes:
--   1. brands — ADD COLUMN client_label TEXT DEFAULT NULL
--      Nullable grouping label for agency users to organise brands by client name.
--      No new RLS/GRANTs needed — brands already has RLS from
--      20260530000001_geo_audit_engine.
--
--   2. white_label (NEW TABLE)
--      Per-tenant agency branding overrides (agency name, accent colour, logo URL).
--      One row per tenant (PK = tenant_id). Updated_at tracked for cache busting.
--      Retention: account life + 30-day grace (ROPA §G2 — brand profile management).
--
--   3. report_share (NEW TABLE)
--      Capability-URL share tokens for branded client reports.
--      token is the capability — possession grants read access to one brand's report.
--      The public read path (/api/r/:token) queries by token+active explicitly in
--      application code WITHOUT a tenant session; RLS is intentionally bypassed there.
--      RLS here protects only the authenticated management operations (create/revoke).
--      Retention: account life + 30-day grace (ROPA §G2). revoked_at / expires_at
--      allow time-bounded and revocable access without deleting the row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure application role exists (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Change 1: Add client_label to brands
-- Nullable — agency users can optionally group brands by client name.
-- Hex/URL validation is enforced at the application layer, not here.
-- Retention: inherits brands retention — account life + 30-day grace (ROPA §G2).
-- ---------------------------------------------------------------------------
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS client_label TEXT DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Change 2: white_label
-- Per-tenant agency branding (agency_name, accent_hex, logo_url).
-- PK is tenant_id (one row per tenant, upsert pattern in application).
-- Hex colour and URL format validation enforced in application code.
-- Retention: account life + 30-day grace (ROPA §G2 — brand profile management).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS white_label (
  tenant_id    UUID        PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  agency_name  TEXT        DEFAULT NULL,
  accent_hex   TEXT        DEFAULT NULL,  -- e.g. '#0A7E5A'; format validated in code
  logo_url     TEXT        DEFAULT NULL,  -- absolute URL; validated in code
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: §4.1 mandatory tenant-isolation pattern
ALTER TABLE white_label ENABLE ROW LEVEL SECURITY;
ALTER TABLE white_label FORCE ROW LEVEL SECURITY;

CREATE POLICY white_label_tenant_isolation ON white_label
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON white_label TO app_user;

-- ---------------------------------------------------------------------------
-- Change 3: report_share
-- Capability-URL share tokens for branded client reports.
-- token (long random string) is the capability — knowing it grants read access
-- to one brand's report snapshot. Public read path bypasses RLS intentionally
-- in application code; RLS here covers only authed management operations.
-- revoked_at NULL = active share. expires_at NULL = never expires.
-- created_by is nullable to handle edge cases where the creating user is later
-- deleted (ON DELETE SET NULL).
-- Retention: account life + 30-day grace (ROPA §G2).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_share (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,  -- long random capability token
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id    UUID        NOT NULL REFERENCES brands  (id) ON DELETE CASCADE,
  created_by  UUID                 REFERENCES users   (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ          DEFAULT NULL,  -- NULL = active; SET to revoke
  expires_at  TIMESTAMPTZ          DEFAULT NULL   -- NULL = never expires
);

-- RLS: §4.1 mandatory tenant-isolation pattern (authed management operations only;
-- the public /api/r/:token path queries with explicit WHERE and bypasses RLS).
ALTER TABLE report_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_share FORCE ROW LEVEL SECURITY;

CREATE POLICY report_share_tenant_isolation ON report_share
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
-- Partial index on active tokens: the hot path for the public report endpoint.
CREATE INDEX IF NOT EXISTS idx_report_share_token
  ON report_share (token)
  WHERE revoked_at IS NULL;

-- Composite index for management queries: list all shares for a brand within a tenant.
CREATE INDEX IF NOT EXISTS idx_report_share_brand
  ON report_share (tenant_id, brand_id);

-- FK indexes (not covered by the above composite for all access patterns)
CREATE INDEX IF NOT EXISTS idx_report_share_created_by
  ON report_share (created_by);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON report_share TO app_user;
