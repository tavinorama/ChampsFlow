-- Rollback: 20260728000001_intent_sampling
-- Removes the B1 intent/formulation classification + methodology version marker.
-- WARNING: Any data stored in these columns will be lost.

ALTER TABLE geo_audit
  DROP COLUMN IF EXISTS methodology_version;

ALTER TABLE citation_check
  DROP COLUMN IF EXISTS methodology_version,
  DROP COLUMN IF EXISTS formulation_ix,
  DROP COLUMN IF EXISTS intent_id;

ALTER TABLE audit_prompt
  DROP COLUMN IF EXISTS formulation_ix,
  DROP COLUMN IF EXISTS intent_id;
