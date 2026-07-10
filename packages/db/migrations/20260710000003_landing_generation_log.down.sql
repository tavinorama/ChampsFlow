-- Rollback: 20260710000003_landing_generation_log
-- Reverts feature_id to GEO-1..GEO-6. Will fail if any 'GEO-7' rows exist
-- (ai_generation_log is append-only compliance evidence and is never pruned
-- by this migration) — delete/migrate those rows first if rolling back.

ALTER TABLE ai_generation_log DROP CONSTRAINT IF EXISTS ai_generation_log_feature_id_check;

ALTER TABLE ai_generation_log ADD CONSTRAINT ai_generation_log_feature_id_check
  CHECK (feature_id IN ('GEO-1', 'GEO-2', 'GEO-3', 'GEO-4', 'GEO-5', 'GEO-6'));
