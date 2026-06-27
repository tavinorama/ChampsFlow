-- =============================================================================
-- Migration: 20260627000003_citation_confidence
-- Capability: GEO gateway confidence signals — persist the multi-run metrics
-- that the gateway already computes but does not yet store.
--
-- Adds to citation_check:
--   mention_rate      NUMERIC(4,3) — fraction of probe runs that mentioned the
--                     brand (0.000–1.000). NULL on legacy rows (single run,
--                     unknown repetition count).
--   runs_count        SMALLINT     — number of probe repetitions that produced
--                     this row. NULL on legacy rows (assumed 1 by callers).
--   raw_text_snippet  TEXT         — first 2 000 chars of the engine's answer.
--                     NULL when not recorded (old audits or free tier).
--                     Snippet truncation is enforced in the worker, not here.
--
-- All three columns are nullable for full backward compatibility with the
-- existing 22 migrations' worth of rows. No new indexes are needed — the
-- existing idx_citation_check_audit covers all breakdown queries that filter
-- on (audit_id, provider, cited). RLS and GRANTs are already in place.
--
-- raw_text_snippet is a synthetic LLM-generated answer, not user-submitted
-- content, so it is not PII and requires no encryption annotation.
-- Retention: inherits the citation_check 90-day purge policy (ROPA §GEO-01).
-- =============================================================================

ALTER TABLE citation_check
  ADD COLUMN IF NOT EXISTS mention_rate     NUMERIC(4,3)
    CHECK (mention_rate BETWEEN 0 AND 1),                  -- 0.000–1.000; NULL = legacy single-run row
  ADD COLUMN IF NOT EXISTS runs_count       SMALLINT
    CHECK (runs_count > 0),                                -- probe repetition count; NULL = legacy (treat as 1)
  ADD COLUMN IF NOT EXISTS raw_text_snippet TEXT;          -- up to 2 000 chars of engine answer; NULL = not captured
