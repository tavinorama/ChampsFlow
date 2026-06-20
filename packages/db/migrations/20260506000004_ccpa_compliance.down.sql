-- =============================================================================
-- Migration: 20260506000004_ccpa_compliance — DOWN
-- Purpose:   Reverse CI-2 CCPA/CPRA Privacy Controls schema changes
--
-- Drops in reverse order of creation.
-- WARNING: Dropping ccpa_requests is destructive — all submitted requests lost.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove users columns (reverse of ALTER TABLE users ADD COLUMN)
-- ---------------------------------------------------------------------------

ALTER TABLE users
  DROP COLUMN IF EXISTS limit_sensitive_pi_set_at,
  DROP COLUMN IF EXISTS limit_sensitive_pi;

-- ---------------------------------------------------------------------------
-- 2. Drop ccpa_requests table (indexes dropped automatically)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS ccpa_requests;
