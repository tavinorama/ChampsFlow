-- =============================================================================
-- Migration: 20260511000001_waitlist — ROLLBACK
-- Date: 2026-05-11
--
-- Drops the waitlist table and associated objects.
-- WARNING: This permanently deletes all waitlist signup data.
--          Ensure data has been exported before running in production.
-- =============================================================================

DROP TABLE IF EXISTS waitlist;

-- Note: citext extension is NOT dropped — it may be used by other tables.
-- DROP EXTENSION IF EXISTS citext;
