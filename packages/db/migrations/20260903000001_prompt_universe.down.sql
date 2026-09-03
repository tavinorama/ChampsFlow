-- =============================================================================
-- Rollback: 20260903000001_prompt_universe
--
-- Reverts the Prompt Universe v2 schema.
--
-- WARNING: this DESTROYS the prompt-universe audit trail (which prompts were
-- archived, by whom, and why) and the per-run comparability facts
-- (prompt_set_version / prompt_set_hash / engine_set). After this runs, a
-- trend line can no longer prove that two points were measured the same way.
--
-- Archived prompts themselves are NOT deleted: dropping archived_at simply
-- makes every archived row look live again. If you roll back after the Ozvor
-- workspace migration ran, re-archive before re-running any audit, or the
-- retired generic prompts re-enter the universe.
--
-- Development/staging only.
-- =============================================================================

DROP INDEX IF EXISTS idx_geo_audit_brand_comparability;

ALTER TABLE geo_audit
  DROP COLUMN IF EXISTS engine_set,
  DROP COLUMN IF EXISTS prompt_set_hash,
  DROP COLUMN IF EXISTS prompt_set_version;

-- CASCADE removes the table's policies and indexes with it.
DROP TABLE IF EXISTS prompt_universe_event CASCADE;

DROP INDEX IF EXISTS idx_audit_prompt_approved_by;
DROP INDEX IF EXISTS idx_audit_prompt_brand_live;

ALTER TABLE audit_prompt
  DROP CONSTRAINT IF EXISTS audit_prompt_archived_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_validity_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_demand_source_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_relevance_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_owner_type_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_funnel_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_intent_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_cohort_chk,
  DROP CONSTRAINT IF EXISTS audit_prompt_approved_by_fkey;

ALTER TABLE audit_prompt
  DROP COLUMN IF EXISTS archived_reason,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS owner_type,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS valid_until,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS expected_competitors,
  DROP COLUMN IF EXISTS branded,
  DROP COLUMN IF EXISTS relevance_score,
  DROP COLUMN IF EXISTS business_value,
  DROP COLUMN IF EXISTS demand_source,
  DROP COLUMN IF EXISTS demand_value,
  DROP COLUMN IF EXISTS funnel_stage,
  DROP COLUMN IF EXISTS locale,
  DROP COLUMN IF EXISTS market,
  DROP COLUMN IF EXISTS vertical,
  DROP COLUMN IF EXISTS intent,
  DROP COLUMN IF EXISTS cohort;
