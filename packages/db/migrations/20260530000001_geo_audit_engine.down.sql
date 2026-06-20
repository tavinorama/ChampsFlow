-- =============================================================================
-- Migration Down: 20260530000001_geo_audit_engine
-- Reverts all GEO Audit Engine schema changes.
-- WARNING: Drops all GEO data. Only run in development/staging.
-- =============================================================================

-- Remove pg_cron job (best-effort — ignore if not present)
DO $$
BEGIN
  PERFORM cron.unschedule('citation_check_query_text_purge_90d');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron job not found or pg_cron not available — skipping unschedule.';
END
$$;

-- Drop GEO tables (order matters for FK constraints)
DROP TABLE IF EXISTS ai_generation_log CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS citation_check CASCADE;
DROP TABLE IF EXISTS geo_score CASCADE;
DROP TABLE IF EXISTS geo_audit CASCADE;
DROP TABLE IF EXISTS brands CASCADE;

-- Remove GEO columns from tenants (added by this migration)
ALTER TABLE tenants DROP COLUMN IF EXISTS region;
ALTER TABLE tenants DROP COLUMN IF EXISTS geo_plan_tier;
