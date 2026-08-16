-- Rollback: 20260815000001_api_spend_measured
-- Drops the measured columns; est_cost_cents rows are untouched. The code
-- writer falls back to the legacy INSERT (op, est_cost_cents) on 42703.
DROP INDEX IF EXISTS idx_api_spend_engine_created;

ALTER TABLE api_spend
  DROP COLUMN IF EXISTS ref,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS measured_cost_cents,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS engine;
