-- =============================================================================
-- CI Assertion: check-rls.sql
-- Purpose: every table in the public schema must have Row Level Security
--          enabled. This query MUST return 0 rows. Any row = CI FAIL.
--
-- 10.B.10 (2026-09-02): the list is now DERIVED from pg_tables instead of a
-- hand-maintained IN (...) — the old list silently missed 11 tables (including
-- smartlead_event, which holds lead PII). A new table now fails this check by
-- DEFAULT; the author either adds RLS in the same migration or consciously
-- adds the table to the allowlist below with a written reason.
--
-- Allowlist (deliberate, reviewed exceptions ONLY):
--   ai_tool          — platform-global AI-tool catalog, PII-free, read-only
--                      reference data (AI Audit Stack); no tenant dimension.
--   source_registry  — platform-global grounding-source registry, PII-free
--                      reference data; no tenant dimension.
--   smartlead_event  — TEMPORARY GAP (holds lead PII!): RLS lands in
--                      migration 20260902000001_smartlead_event_rls via PR
--                      `feat/smartlead-event-rls-migration` (founder merges
--                      migrations). TODO: remove this entry the moment that
--                      migration is merged — this line is the ONLY thing
--                      keeping CI green over the gap.
--
-- Note: the ops.* schema is intentionally out of scope here — it is
-- GRANT-gated company-operations data with no PostgREST exposure and no
-- tenant rows (see 20260806000002_ops_agent_substrate).
--
-- Run: psql $DATABASE_URL -t -A -f packages/db/scripts/check-rls.sql
-- =============================================================================

SELECT c.relname AS table_missing_rls
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND c.relname NOT IN (
    'ai_tool',
    'source_registry',
    -- TODO(feat/smartlead-event-rls-migration): remove once
    -- 20260902000001_smartlead_event_rls is merged and applied.
    'smartlead_event'
  );

-- Expected result: 0 rows.
-- If any rows are returned, a table is missing RLS: enable it (plus FORCE and
-- an explicit policy — see 20260728000001_operator_tables_rls for the
-- service_only pattern) or add a justified allowlist entry above.
