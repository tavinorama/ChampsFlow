-- =============================================================================
-- Migration DOWN: 20260626000002_brand_model_settings
-- Reverts: tracked_models and tracking_frequency columns from brands table.
-- =============================================================================

ALTER TABLE brands DROP COLUMN IF EXISTS tracked_models;
ALTER TABLE brands DROP COLUMN IF EXISTS tracking_frequency;
