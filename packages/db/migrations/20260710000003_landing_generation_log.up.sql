-- =============================================================================
-- Migration: 20260710000003_landing_generation_log
-- Capability: Ozvor Pages 5-page bundle generator (issue #208, PR-4).
--
-- ai_generation_log.feature_id was CHECK-constrained to GEO-1..GEO-6 (the six
-- documented GEO Audit Engine AI features, docs/03-architecture.md §12). The
-- Ozvor Pages generator (landing-generate worker job) is a seventh AI
-- inference surface and must append rows to the SAME append-only compliance
-- log (GEO-A6 convention) — so the allowed value set gains 'GEO-7'
-- ("Ozvor Pages generation": hero copy rewrite on the client's own key).
--
-- Additive only: existing rows/values are untouched; DROP+ADD is required
-- because Postgres has no ALTER CHECK ... ADD VALUE for a plain CHECK (only
-- ALTER TYPE for enums, which this column does not use).
-- =============================================================================

ALTER TABLE ai_generation_log DROP CONSTRAINT IF EXISTS ai_generation_log_feature_id_check;

ALTER TABLE ai_generation_log ADD CONSTRAINT ai_generation_log_feature_id_check
  CHECK (feature_id IN ('GEO-1', 'GEO-2', 'GEO-3', 'GEO-4', 'GEO-5', 'GEO-6', 'GEO-7'));
