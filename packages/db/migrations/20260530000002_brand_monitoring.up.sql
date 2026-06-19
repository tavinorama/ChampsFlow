-- =============================================================================
-- Migration: 20260530000002_brand_monitoring
-- Capability: C2 — Citation Monitor (TrustIndex AI flywheel)
--
-- Adds the monitoring_enabled flag to brands. When true, a BullMQ repeatable
-- job re-runs the AI Visibility Audit weekly so the TrustIndex Score time
-- series in geo_score keeps growing (the never-ending flywheel).
-- =============================================================================

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_brands_monitoring
  ON brands (monitoring_enabled)
  WHERE monitoring_enabled = TRUE;
