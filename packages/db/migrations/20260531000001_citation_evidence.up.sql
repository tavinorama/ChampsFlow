-- =============================================================================
-- Migration: 20260531000001_citation_evidence
-- Capability: C1 explainability — store per-prompt audit evidence so the
-- TrustIndex Score AI vector can be broken down (which prompt, which engine,
-- cited?, position, which sources).
--
-- Adds:
--   citation_check.sources  jsonb  — cited source URLs/domains per probe
--   citation_check.query_text is already present (was being nulled); the worker
--     now stores it so the breakdown UI can show the actual buyer prompt.
--
-- query_text is the buyer prompt (NOT personal data — it is a synthetic
-- category question like "best CRM for SMBs"), so retaining it is safe and is
-- the core evidence of the audit. The 90-day purge still applies to keep the
-- table lean.
-- =============================================================================

ALTER TABLE citation_check
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;
