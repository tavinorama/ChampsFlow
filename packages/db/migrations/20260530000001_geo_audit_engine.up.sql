-- =============================================================================
-- Migration: 20260530000001_geo_audit_engine
-- Capability: C1 — GEO Audit Engine (Phase 5 first GEO slice)
-- Date: 2026-05-30
-- Jurisdiction: EU + US
--
-- Tables created (all tenant-scoped + RLS):
--   1. brands           — client brand entities (multi-tenant)
--   2. geo_audit        — one row per audit run
--   3. geo_score        — time-series score snapshots (one per scoring event)
--   4. citation_check   — one row per probe-query execution; query_text purged after 90d
--   5. ai_generation_log — append-only AI inference log, all 6 GEO features (REVOKE UPDATE/DELETE)
--
-- Note: audit_log already exists from 20260501000001_initial_schema.
--       It is reused for GEO event types (no CHECK constraint — already extensible).
--
-- Also extends tenants table with GEO-specific columns.
--
-- Architecture refs:
--   §4 Data Model — entity definitions
--   §4.1 RLS Migration Standard
--   §4.3 Ownership Boundaries
--   §12 GEO-A6 — append-only ai_generation_log with REVOKE UPDATE/DELETE
--   Architecture review RE-RUN Issue 1 — 90-day purge on citation_check.query_text
--   Architecture review RE-RUN Issue 2 — openai_eu_enabled, gemini_eu_enabled default false
--
-- RLS: EVERY tenant-scoped table: ENABLE + FORCE + tenant_isolation policy.
-- Append-only: REVOKE UPDATE, DELETE on ai_generation_log from app_user.
-- 90-day purge: pg_cron scheduled function for citation_check.query_text.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure required extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_cron for scheduled purge job (Issue 1 from architecture review)
-- Installed in shared_preload_libraries on Supabase; CREATE EXTENSION is idempotent.
-- Wrapped in DO block to handle environments where pg_cron is unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available — query_text purge will be handled by worker cron fallback.';
END
$$;

-- ---------------------------------------------------------------------------
-- Ensure application roles exist (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'organicposts_admin') THEN
    CREATE ROLE organicposts_admin NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Extend tenants table with GEO-required columns
-- (tenants table already exists from 20260501000001_initial_schema)
-- ---------------------------------------------------------------------------

-- Region column: drives provider-routing gate (EU | US).
-- Set at signup from IP geo-detection + self-declaration; fallback = EU (GDPR-safe).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'EU'
    CHECK (region IN ('EU', 'US'));

-- GEO plan tier (parallel to old plan column; GEO product uses this)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS geo_plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (geo_plan_tier IN ('free', 'solo', 'agency', 'growth'));

-- ---------------------------------------------------------------------------
-- TABLE: brands
-- Client brand entities. Free tier: 1 brand per tenant. Agency/Growth: multiple.
-- Retention: account life + 30-day grace.
-- Architecture §4: brands — id, tenant_id, name, category, domain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT,
  domain      TEXT,
  market      TEXT,
  -- region drives the provider routing gate (EU excludes Perplexity until SCCs). GEO-A3.
  region      TEXT        NOT NULL DEFAULT 'EU',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brands_region_check CHECK (region IN ('EU', 'US'))
);

-- RLS: §4.1 mandatory pattern
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON brands
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands (tenant_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON brands TO app_user;
GRANT SELECT ON brands TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: geo_audit
-- One row per audit run (triggered on-demand or by cron).
-- report_token: UUID for public shareable links (30-day TTL).
-- providers_used: jsonb array of provider IDs included in this run.
--   EU users will not include 'perplexity', 'openai', 'google' while gates are active.
-- Retention: account life + 30-day grace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,

  -- Trigger context
  triggered_by    TEXT        NOT NULL DEFAULT 'paid'
                    CHECK (triggered_by IN ('free_tier', 'paid', 'cron')),

  -- Lifecycle
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  error_message   TEXT,

  -- Score results (populated after completion)
  score_brand         SMALLINT CHECK (score_brand BETWEEN 0 AND 100),
  score_performance   SMALLINT CHECK (score_performance BETWEEN 0 AND 100),
  score_ai            SMALLINT CHECK (score_ai BETWEEN 0 AND 100),

  -- Providers used in this run (jsonb array of provider ID strings)
  -- e.g. ["anthropic","google"] — perplexity excluded for EU until gate lifted
  providers_used  JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Shareable report (public URL token; 30-day TTL per architecture §4)
  report_token      UUID        UNIQUE DEFAULT gen_random_uuid(),
  report_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- RLS
ALTER TABLE geo_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON geo_audit
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_audit_brand ON geo_audit (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geo_audit_tenant ON geo_audit (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_audit_report_token ON geo_audit (report_token)
  WHERE report_token IS NOT NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE ON geo_audit TO app_user;
GRANT SELECT ON geo_audit TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: geo_score
-- Time-series. One row per scoring event.
-- Indexed for trend queries: (brand_id, recorded_at DESC).
-- provider_breakdown: per-provider citation rates jsonb.
-- Retention: account life + 30-day grace.
-- Architecture §4: geo_score time-series.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_score (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  tenant_id         UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  audit_id          UUID        REFERENCES geo_audit (id) ON DELETE SET NULL,

  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  score_brand       SMALLINT    NOT NULL CHECK (score_brand BETWEEN 0 AND 100),
  score_performance SMALLINT    NOT NULL CHECK (score_performance BETWEEN 0 AND 100),
  score_ai          SMALLINT    NOT NULL CHECK (score_ai BETWEEN 0 AND 100),

  -- Per-provider citation rates: { "anthropic": 0.8, "google": 0.6, ... }
  provider_breakdown JSONB      NOT NULL DEFAULT '{}'::jsonb
);

-- RLS
ALTER TABLE geo_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_score FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON geo_score
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Primary time-series index
CREATE INDEX IF NOT EXISTS idx_geo_score_brand_time ON geo_score (brand_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_geo_score_tenant_time ON geo_score (tenant_id, recorded_at DESC);

-- Grants (append-only for scoring — no UPDATE/DELETE needed)
GRANT SELECT, INSERT ON geo_score TO app_user;
GRANT SELECT ON geo_score TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: citation_check
-- One row per probe-query execution.
-- query_text: stored temporarily, PURGED after 90 days (GDPR minimisation).
-- query_hash (SHA-256): retained permanently for deduplication.
-- Named-individual snippets from LLM responses are NEVER written here.
-- Retention: query_text 90-day rolling purge; aggregate fields: account life.
-- Architecture §4: citation_check definition.
-- Architecture §7: Cat 3 — brand probe queries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citation_check (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              UUID        REFERENCES geo_audit (id) ON DELETE SET NULL,
  brand_id              UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  tenant_id             UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,

  -- Provider that processed this probe query
  provider              TEXT        NOT NULL
                          CHECK (provider IN ('openai', 'anthropic', 'google', 'perplexity', 'dataforseo')),

  -- Query identity (query_text purged after 90 days; query_hash retained)
  query_hash            TEXT        NOT NULL,   -- SHA-256 hex of query_text
  query_text            TEXT,                   -- Purged to NULL after 90 days via pg_cron

  -- Citation outcome (populated by citation parser in worker)
  cited                 BOOLEAN     NOT NULL DEFAULT FALSE,
  citation_rank         SMALLINT,               -- 1-based position; NULL if not cited
  sentiment             TEXT        CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_model_version TEXT,

  processed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE citation_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_check FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON citation_check
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_citation_check_audit ON citation_check (audit_id);
CREATE INDEX IF NOT EXISTS idx_citation_check_brand_time ON citation_check (brand_id, processed_at DESC);
-- Partial index for efficient 90-day purge job scans
CREATE INDEX IF NOT EXISTS idx_citation_check_purge ON citation_check (processed_at)
  WHERE query_text IS NOT NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE ON citation_check TO app_user;
GRANT SELECT ON citation_check TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: ai_generation_log
-- Append-only AI inference log for GEO features. Covers GEO-1 through GEO-6.
-- REVOKE UPDATE, DELETE enforced at DB level (GEO-A6).
-- Stores only hashes — no raw prompt or response text ever written.
-- Retention: indefinite (compliance evidence per architecture §10).
--
-- NOTE: This is distinct from the existing generation_log table (social scheduling).
--       ai_generation_log covers GEO-specific AI features with the GEO-A6 schema.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_generation_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: compliance records must not be deleted even if tenant is removed.
  -- Admin must explicitly handle these rows via DSR fulfillment procedure.

  -- Which GEO AI feature generated this row (GEO-1 through GEO-6)
  feature_id    TEXT        NOT NULL
                  CHECK (feature_id IN ('GEO-1', 'GEO-2', 'GEO-3', 'GEO-4', 'GEO-5', 'GEO-6')),

  -- Audit hashes (no raw text stored — architecture §9 in-use policy)
  input_hash    TEXT        NOT NULL,   -- SHA-256 hex of concatenated prompt inputs
  output_hash   TEXT        NOT NULL,   -- SHA-256 hex of raw output text

  -- Provider identity
  provider      TEXT        NOT NULL
                  CHECK (provider IN ('openai', 'anthropic', 'google', 'perplexity', 'dataforseo', 'internal')),
  model_version TEXT        NOT NULL,   -- provider-reported model identifier

  -- Compliance fields (GEO-A6)
  zdr_confirmed BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Performance telemetry
  latency_ms    INT         NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),

  -- Timestamp (quoted to avoid reserved word conflict)
  "timestamp"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE ai_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_generation_log
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Append-only enforcement (GEO-A6): REVOKE UPDATE, DELETE from app_user
REVOKE UPDATE, DELETE ON ai_generation_log FROM app_user;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_gen_log_tenant_time ON ai_generation_log (tenant_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_log_feature ON ai_generation_log (feature_id, "timestamp" DESC);
-- Alert index: zdr_confirmed = FALSE rows are anomalies requiring observability alert
CREATE INDEX IF NOT EXISTS idx_ai_gen_log_zdr_false ON ai_generation_log ("timestamp" DESC)
  WHERE zdr_confirmed = FALSE;

-- Grants (INSERT-only for app_user; no UPDATE/DELETE ever)
GRANT SELECT, INSERT ON ai_generation_log TO app_user;
GRANT SELECT ON ai_generation_log TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- 90-day query_text purge (Architecture review RE-RUN Issue 1)
-- Implements GDPR data minimisation for citation_check.query_text.
-- pg_cron runs daily at 02:00 UTC to NULL out query_text older than 90 days.
-- The query_hash is preserved permanently (deduplication key).
-- Named-individual snippets are never written, so nothing else needs purging here.
--
-- The DO block is idempotent: checks for existing job by name before scheduling.
-- Graceful fallback: if pg_cron is unavailable (local dev), logs a NOTICE.
-- The worker cron in apps/worker provides a fallback purge mechanism.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_job_exists BOOLEAN;
BEGIN
  -- Check if pg_cron schema is available before attempting to use it
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    SELECT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'citation_check_query_text_purge_90d'
    ) INTO v_job_exists;

    IF NOT v_job_exists THEN
      PERFORM cron.schedule(
        'citation_check_query_text_purge_90d',
        '0 2 * * *',
        $cron$
          UPDATE citation_check
          SET query_text = NULL
          WHERE query_text IS NOT NULL
            AND processed_at < NOW() - INTERVAL '90 days'
        $cron$
      );
      RAISE NOTICE 'Scheduled pg_cron job: citation_check_query_text_purge_90d (daily 02:00 UTC)';
    ELSE
      RAISE NOTICE 'pg_cron job citation_check_query_text_purge_90d already exists — skipping.';
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron schema not available — citation_check.query_text purge handled by worker cron fallback (apps/worker/src/jobs/purge-citation-text.ts).';
  END IF;
END
$$;
