-- =============================================================================
-- Migration: 20260728000001_intent_sampling
-- Capability: B1 — statistical sampling with Wilson intervals (intent concept)
-- Date: 2026-07-28
-- Jurisdiction: EU + US + BR (LGPD)
--
-- Adds the INTENT/FORMULATION classification and a METHODOLOGY VERSION marker:
--
--   audit_prompt.intent_id        TEXT      — named buyer intent this prompt
--                                             formulates (e.g. 'local_best',
--                                             'trust_review'). NULL on legacy
--                                             and unclassified custom prompts.
--   audit_prompt.formulation_ix   SMALLINT  — 0-based formulation index within
--                                             the intent. NULL on legacy rows.
--
--   citation_check.intent_id      TEXT      — intent of the probed prompt at
--                                             audit time (denormalised so the
--                                             evidence row is self-contained).
--   citation_check.formulation_ix SMALLINT  — formulation index at audit time.
--   citation_check.methodology_version TEXT NOT NULL DEFAULT '1.0'
--                                           — sampling protocol that produced
--                                             the row. '1.0' = legacy flat
--                                             repeat; '2.0' = intent portfolio
--                                             + sequential Wilson sampling.
--
--   geo_audit.methodology_version TEXT NOT NULL DEFAULT '1.0'
--                                           — protocol version of the whole
--                                             audit (report comparability).
--
-- All intent columns are NULLABLE → fully backward-compatible with existing
-- rows and with worker/API builds that predate B1. methodology_version uses
-- NOT NULL DEFAULT '1.0' so every legacy row is truthfully labelled as the
-- old protocol without a backfill.
--
-- No new PII: intent ids are fixed vocabulary strings; formulation_ix is an
-- integer; methodology_version is a protocol label. RLS, grants, retention
-- policies of the three tables are unchanged and inherited.
-- No new indexes: breakdown queries keep filtering on (audit_id, provider),
-- covered by existing idx_citation_check_audit.
-- =============================================================================

ALTER TABLE audit_prompt
  ADD COLUMN IF NOT EXISTS intent_id      TEXT,
  ADD COLUMN IF NOT EXISTS formulation_ix SMALLINT;

ALTER TABLE citation_check
  ADD COLUMN IF NOT EXISTS intent_id           TEXT,
  ADD COLUMN IF NOT EXISTS formulation_ix      SMALLINT,
  ADD COLUMN IF NOT EXISTS methodology_version TEXT NOT NULL DEFAULT '1.0';

ALTER TABLE geo_audit
  ADD COLUMN IF NOT EXISTS methodology_version TEXT NOT NULL DEFAULT '1.0';
