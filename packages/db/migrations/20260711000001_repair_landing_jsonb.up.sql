-- =============================================================================
-- Migration: 20260711000001_repair_landing_jsonb
-- Capability: Ozvor Pages — heal DOUBLE-JSON-ENCODED jsonb rows at rest.
--
-- Root cause: the API's db.query wrapper runs on postgres.js
-- `sql.unsafe(text, params)`, which JSON-encodes any parameter bound to a
-- jsonb column based on its JS type. Route code passed a *pre-stringified*
-- JSON string (`JSON.stringify(obj)`), so postgres.js encoded it a SECOND
-- time and stored a jsonb STRING SCALAR — `"{\"name\":\"Ozvor\"...}"` —
-- instead of a jsonb OBJECT. Effect: `business->>'name'` returns NULL, the
-- Pages generator skipped every affected site ("no_business_name",
-- pages_written=0). The write paths are fixed forward (jsonbParam) in the
-- same PR; this migration repairs rows already written.
--
-- Repair: for each jsonb column that should hold an object/array, if it is a
-- string scalar (the double-encode signature), extract the inner text with
-- `#>> '{}'` and re-parse it to real jsonb. Guarded by jsonb_typeof = 'string'
-- so legitimate objects/arrays are untouched, and idempotent (re-running is a
-- no-op once healed). Additive data fix — no schema/RLS change.
-- =============================================================================

UPDATE landing_sites
   SET business = (business #>> '{}')::jsonb
 WHERE jsonb_typeof(business) = 'string';

UPDATE landing_sites
   SET theme = (theme #>> '{}')::jsonb
 WHERE jsonb_typeof(theme) = 'string';

UPDATE landing_sites
   SET review_themes = (review_themes #>> '{}')::jsonb
 WHERE jsonb_typeof(review_themes) = 'string';

UPDATE landing_pages
   SET sections = (sections #>> '{}')::jsonb
 WHERE jsonb_typeof(sections) = 'string';

UPDATE landing_pages
   SET seo = (seo #>> '{}')::jsonb
 WHERE jsonb_typeof(seo) = 'string';

UPDATE landing_pages
   SET ai_readiness = (ai_readiness #>> '{}')::jsonb
 WHERE ai_readiness IS NOT NULL AND jsonb_typeof(ai_readiness) = 'string';

UPDATE landing_page_versions
   SET sections = (sections #>> '{}')::jsonb
 WHERE jsonb_typeof(sections) = 'string';

UPDATE landing_page_versions
   SET seo = (seo #>> '{}')::jsonb
 WHERE jsonb_typeof(seo) = 'string';
