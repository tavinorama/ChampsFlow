-- Rollback: 20260711000001_repair_landing_jsonb
-- This is a one-way DATA repair (double-encoded jsonb string scalars -> real
-- jsonb objects/arrays). Re-introducing the corruption would be actively
-- harmful and serves no purpose, so the rollback is an intentional no-op.
SELECT 1;
