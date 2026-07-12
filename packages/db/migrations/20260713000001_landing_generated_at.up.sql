-- landing_sites.generated_at — un-resettable "this site already had its free
-- initial generation" stamp (task #121, launch-eve QA audit 2026-07-12).
--
-- WHY: the regeneration quota treated "no page carries generated content
-- (sections <> '[]')" as the FREE initial generation. That signal is
-- resettable: PATCHing every page's sections to [] (or deleting the pages,
-- which cascades their landing_page_versions away) makes the next run look
-- initial again — unlimited free regenerations. This column is written ONLY
-- by the worker on a successful generation (never by any PATCH route), so it
-- cannot be reset from the API surface. NULL = the site has never generated.
ALTER TABLE landing_sites
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

COMMENT ON COLUMN landing_sites.generated_at IS
  'First successful generation (worker-stamped, COALESCE-once). Quota gate: NULL + zero content pages = free initial generation; anything else is a quota-checked regeneration (#121).';
