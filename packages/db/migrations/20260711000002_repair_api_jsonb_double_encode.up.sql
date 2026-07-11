-- =============================================================================
-- Migration: 20260711000002_repair_api_jsonb_double_encode
-- Capability: API-wide follow-up to 20260711000001_repair_landing_jsonb — heal
--             DOUBLE-JSON-ENCODED jsonb rows written by API routes (and the
--             publish worker) outside the Ozvor Pages tables.
--
-- Root cause (identical to 20260711000001, proven again with real postgres.js
-- 3.4.4 + docker for this audit): the API's db.query wrapper — and the worker's
-- direct sql.unsafe — run on postgres.js `sql.unsafe(text, params)`, which
-- serializes a parameter bound to a jsonb column by its JS type. Route code
-- passed a *pre-stringified* JSON string (`JSON.stringify(obj)`), so postgres.js
-- encoded it a SECOND time and stored a jsonb STRING SCALAR —
-- `"{\"k\":\"v\"}"` — instead of a jsonb OBJECT/ARRAY. Effect: `col->>'k'`
-- returns NULL and any reader expecting an object/array gets a string.
--
-- IMPORTANT: the `$N::jsonb` cast some of those INSERTs used does NOT prevent
-- the double-encode — postgres.js still types the parameter as jsonb and
-- re-encodes the string. So casted and un-casted writes were equally affected.
-- The write paths are fixed forward in the same PR (jsonbParam); this migration
-- repairs the rows already written across every affected column.
--
-- Repair: for each jsonb column, if the value is a string scalar (the
-- double-encode signature), extract the inner text with `#>> '{}'` and re-parse
-- it to real jsonb. Guarded by jsonb_typeof = 'string' so legitimate
-- objects/arrays are untouched, and idempotent (re-running is a no-op once
-- healed). jsonb_typeof(NULL) is NULL, so nullable columns skip NULL rows
-- automatically. Additive data fix — no schema/RLS change.
--
-- Columns healed (all confirmed jsonb; readers assume object/array or already
-- compensate with a `typeof === 'string'` guard, so healing only restores
-- correctness):
--   audit_log.metadata            (append-only compliance log — no reader,
--                                  but healed for future queryability/integrity)
--   google_metric_cache.series    (attribution dashboard time-series)
--   brands.tracked_models         (per-brand model tracking selection)
--   strategy_plan.calendar        (4-week content calendar)
--   engagement.brand_snapshot     (OrganicPosts engagement snapshot)
--   nurture_enrollment.metadata   (drip personalization payload)
--   lead_capture.result           (free Invisibility Test scorecard)
-- =============================================================================

UPDATE audit_log
   SET metadata = (metadata #>> '{}')::jsonb
 WHERE jsonb_typeof(metadata) = 'string';

UPDATE google_metric_cache
   SET series = (series #>> '{}')::jsonb
 WHERE jsonb_typeof(series) = 'string';

UPDATE brands
   SET tracked_models = (tracked_models #>> '{}')::jsonb
 WHERE jsonb_typeof(tracked_models) = 'string';

UPDATE strategy_plan
   SET calendar = (calendar #>> '{}')::jsonb
 WHERE jsonb_typeof(calendar) = 'string';

UPDATE engagement
   SET brand_snapshot = (brand_snapshot #>> '{}')::jsonb
 WHERE jsonb_typeof(brand_snapshot) = 'string';

UPDATE nurture_enrollment
   SET metadata = (metadata #>> '{}')::jsonb
 WHERE jsonb_typeof(metadata) = 'string';

UPDATE lead_capture
   SET result = (result #>> '{}')::jsonb
 WHERE jsonb_typeof(result) = 'string';
