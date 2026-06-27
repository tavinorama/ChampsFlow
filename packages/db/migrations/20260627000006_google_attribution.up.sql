-- =============================================================================
-- Migration: 20260627000006_google_attribution
-- Capability: Attribution v1 (#86)
-- Date: 2026-06-27
-- Jurisdiction: Brazil (LGPD) + EU (GDPR) + US (CCPA/CPRA)
--
-- Changes:
--   1. google_connection (NEW TABLE)
--      One row per (tenant, brand, kind) OAuth connection to Google.
--      Holds encrypted access + refresh tokens (AES-256-GCM at the application
--      layer, stored as BYTEA). Plaintext tokens are NEVER written to this table.
--      Supports both GA4 (kind='ga4') and Google Search Console (kind='gsc').
--      Retention: account life + 30-day grace (ROPA §G2).
--
--   2. google_metric_cache (NEW TABLE)
--      Caches GA4 / GSC time-series metrics fetched via the Google APIs.
--      Populated by the background worker; refreshed at most once per day
--      (enforced at the application layer, not here).
--      series JSONB holds aggregate metrics only (sessions, users, clicks,
--      impressions) — no PII, no raw user data.
--
-- Data-processor role note:
--   GA4 and GSC data represents the client's own Google Analytics / Search
--   Console account.  TrustIndex AI acts as a data processor on behalf of the
--   client (the data controller).  Only aggregate, non-PII time-series metrics
--   are stored (no individual user-level data, no identifiers, no raw query
--   strings).  The lawful basis for processing is the client's DPA with
--   TrustIndex AI.  Retention is bounded by the account lifetime + 30-day grace
--   period per ROPA §G2.  Token bytes are encrypted at the application layer
--   (AES-256-GCM) before being written to the BYTEA columns; the encryption key
--   is held in the application secrets layer, never in the database.
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
-- Table 1: google_connection
--
-- One row per (tenant_id, brand_id, kind) active Google OAuth connection.
-- brand_id is nullable: a connection can be tenant-wide (brand_id IS NULL) or
-- scoped to a specific brand.  The UNIQUE constraint enforces at most one live
-- connection per (tenant, brand, kind) combination.  When brand is deleted,
-- ON DELETE SET NULL preserves the connection row (now brand_id=NULL) so
-- historical metric cache rows remain queryable.
--
-- Token columns (BYTEA):
--   access_token_enc  — ENCRYPTED: AES-256-GCM at application layer
--   refresh_token_enc — ENCRYPTED: AES-256-GCM at application layer
--
-- revoked_at NULL  = active connection.
-- revoked_at SET   = disconnected; tokens should be treated as invalid and
--                    the application should zero-out or re-encrypt the BYTEA
--                    columns on revocation.
--
-- Retention: account life + 30-day grace (ROPA §G2).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_connection (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  -- FK to brands: SET NULL on brand delete so cache rows stay queryable.
  brand_id          UUID                 REFERENCES brands (id) ON DELETE SET NULL,
  kind              TEXT        NOT NULL CHECK (kind IN ('ga4', 'gsc')),
  -- ENCRYPTED: AES-256-GCM at application layer; NULL when token revoked/absent.
  access_token_enc  BYTEA                DEFAULT NULL,
  -- ENCRYPTED: AES-256-GCM at application layer; NULL when token revoked/absent.
  refresh_token_enc BYTEA                DEFAULT NULL,
  -- GA4-specific: e.g. 'properties/123456789'.  NULL for kind='gsc'.
  ga4_property_id   TEXT                 DEFAULT NULL,
  -- GSC-specific: e.g. 'https://example.com/'.  NULL for kind='ga4'.
  -- URL format validation enforced at the application layer, not here.
  gsc_site_url      TEXT                 DEFAULT NULL,
  -- OAuth scopes granted by the user (space-separated string from Google).
  scope             TEXT                 DEFAULT NULL,
  -- Token expiry timestamp from Google's token response.
  expires_at        TIMESTAMPTZ          DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL while active; SET to the instant of disconnection/revocation.
  revoked_at        TIMESTAMPTZ          DEFAULT NULL
);

-- Unique constraint: at most one non-revoked connection per (tenant, brand, kind).
-- NULLS NOT DISTINCT is Postgres 15+; use a partial index for broad compatibility.
-- The partial index covers the active-connection uniqueness guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_connection_active
  ON google_connection (tenant_id, brand_id, kind)
  WHERE revoked_at IS NULL;

-- Index on brand_id FK (not covered by the partial unique index for all rows).
CREATE INDEX IF NOT EXISTS idx_google_connection_brand
  ON google_connection (brand_id);

-- RLS: §4.1 mandatory tenant-isolation pattern
ALTER TABLE google_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connection FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON google_connection
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON google_connection TO app_user;

-- ---------------------------------------------------------------------------
-- Table 2: google_metric_cache
--
-- Caches GA4 / GSC time-series data per connection.  One row per (connection,
-- period) fetch.  The application layer decides when to refresh (at most daily).
-- Older rows are retained until the application prunes them; a future migration
-- can add a TTL trigger or pg_cron job once the pruning strategy is finalised.
--
-- tenant_id + brand_id are denormalized from google_connection to support fast
-- RLS checks and brand-scoped queries without a JOIN to google_connection.
--
-- series JSONB schema (array of objects):
--   GA4:  [{ "date": "YYYY-MM-DD", "sessions": N, "users": N }, ...]
--   GSC:  [{ "date": "YYYY-MM-DD", "clicks": N, "impressions": N }, ...]
--   Aggregate metrics only; no individual user data, no PII.
--
-- raw_response is optional debug storage.  It must NOT contain OAuth tokens,
-- personal data, or raw user-level records.  Application code is responsible
-- for stripping sensitive fields before writing.
--
-- Retention: account life + 30-day grace (ROPA §G2 — client analytics data,
--            processor role only).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_metric_cache (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID        NOT NULL REFERENCES google_connection (id) ON DELETE CASCADE,
  -- Denormalized from google_connection for RLS + brand-scoped fast path.
  tenant_id     UUID        NOT NULL,
  brand_id      UUID                 DEFAULT NULL,
  kind          TEXT        NOT NULL CHECK (kind IN ('ga4', 'gsc')),
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Inclusive bounds of the returned time series.
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  -- Aggregate time-series payload. No PII, no user-level data.
  series        JSONB       NOT NULL,
  -- Optional raw response excerpt for debugging (strip tokens + PII in app code).
  raw_response  JSONB                DEFAULT NULL
);

-- "Latest cache row per connection" — the primary lookup pattern.
CREATE INDEX IF NOT EXISTS idx_google_metric_cache_connection
  ON google_metric_cache (connection_id, fetched_at DESC);

-- "Latest cache row for a brand+kind" — fast path used on the attribution dashboard.
CREATE INDEX IF NOT EXISTS idx_google_metric_cache_brand_kind
  ON google_metric_cache (tenant_id, brand_id, kind, fetched_at DESC);

-- RLS: §4.1 mandatory tenant-isolation pattern
ALTER TABLE google_metric_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_metric_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON google_metric_cache
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON google_metric_cache TO app_user;
