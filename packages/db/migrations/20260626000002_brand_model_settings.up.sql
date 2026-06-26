-- =============================================================================
-- Migration: 20260626000002_brand_model_settings
-- Capability: Competitor-parity — Choose AI Models + Tracking Frequency
-- Date: 2026-06-26
-- Jurisdiction: EU + US + BR (LGPD)
--
-- Alters brands table (add two columns only — no new tables, no RLS changes,
-- no new grants; all already applied at table creation).
--
-- tracked_models: JSONB array of provider keys the brand wants tracked.
--   Default = all 5 supported engines (backward-compatible for existing brands).
--   Valid keys: "openai", "anthropic", "perplexity", "gemini", "serp".
--   A CHECK constraint would require a custom function; use application-level
--   validation in the API instead (simpler, maintainable).
--
-- tracking_frequency: 'weekly' (default, current behavior) or 'daily'.
--   'daily' is Agency-plan only — enforced at the API layer (not DB constraint)
--   to keep the DB schema clean and avoid coupling plan logic to the DB.
--
-- No personal data stored. No ENCRYPTED annotation required.
-- Retention: same as brands table (account life + 30-day grace, ROPA G2).
-- =============================================================================

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS tracked_models JSONB NOT NULL DEFAULT '["openai","anthropic","perplexity","gemini","serp"]';

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS tracking_frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (tracking_frequency IN ('weekly', 'daily'));
