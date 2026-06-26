-- =============================================================================
-- Migration Down: 20260626000001_audit_prompt
-- Reverts audit_prompt table creation.
-- WARNING: Drops all prompt library data. Only run in development/staging.
-- =============================================================================

-- Drop audit_prompt (CASCADE removes dependent indexes, policies automatically)
DROP TABLE IF EXISTS audit_prompt CASCADE;
