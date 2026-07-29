-- =============================================================================
-- Migration: 20260729000001_engine_drift_check
-- Capability: B4 — daily anti-drift control battery for the 5 AI engines
-- Date: 2026-07-29
-- Jurisdiction: EU + US + BR (LGPD)
--
-- Why this table exists: the engines change on their own (retrain, policy
-- change, silent model swap, degraded API). When that happens EVERY customer's
-- score moves at once and today we cannot tell "the brand lost visibility" from
-- "the engine started answering differently". This table is the reference
-- measurement that separates the two.
--
-- One row per (engine × daily battery run):
--   positive_rate  — share of POSITIVE control runs where the dominant brand
--                    was named ("most used search engine" → Google). Healthy
--                    engines sit at ~1.00; expected floor is 0.90.
--   negative_rate  — share of NEGATIVE control runs where a FICTIONAL entity
--                    ("Zylthorix Analytics") was described as real. Healthy
--                    engines sit at 0.00; anything above is hallucination.
--   status         — healthy | degraded | failing, derived in code
--                    (packages/llm/src/drift-control.ts):
--                      degraded: positive < 0.75 OR negative > 0.10
--                      failing : positive < 0.50 OR negative > 0.25
--   detail         — PII-free jsonb: per-control breakdown (id, kind, runs,
--                    mentions, empty/error runs), reasons, battery version,
--                    thresholds in force at write time.
--   methodology_version — sampling/methodology marker (GEO_METHODOLOGY_VERSION),
--                    so rows produced under different protocols are never
--                    silently compared.
--
-- `engine` stores the GATEWAY provider id (anthropic | openai | gemini |
-- perplexity | serp), not the citation_check display mapping (google /
-- dataforseo): the pause check in apps/worker/src/jobs/audit-run.ts compares it
-- directly against the requested provider list, and a mapping in between is a
-- silent-failure surface we do not want on a safety control.
--
-- NO PII, EVER: the battery prompts are synthetic questions about public
-- companies and invented names. No tenant, no brand, no user, no email, no raw
-- answer text is stored here — only counts and rates. Nothing to minimise
-- because nothing personal is collected.
--
-- Platform-global table (no tenant_id) — same shape and same permissive-policy
-- treatment as api_spend (20260627000001): RLS on to keep the Supabase advisor
-- clean, one permissive policy so both the unscoped worker login role (writes)
-- and the RLS-scoped app_user (the audit job's pause check) can use it.
--
-- Reversible: the .down drops the table. Additive — every reader tolerates the
-- table being absent (42P01 → fail-open, no pausing), so this migration can
-- land before or after the app deploy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS engine_drift_check (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  engine              TEXT        NOT NULL
                        CHECK (engine IN ('anthropic', 'openai', 'gemini', 'perplexity', 'serp')),
  positive_rate       NUMERIC(5,4) NOT NULL
                        CHECK (positive_rate >= 0 AND positive_rate <= 1),
  negative_rate       NUMERIC(5,4) NOT NULL
                        CHECK (negative_rate >= 0 AND negative_rate <= 1),
  status              TEXT        NOT NULL
                        CHECK (status IN ('healthy', 'degraded', 'failing')),
  detail              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  methodology_version TEXT        NOT NULL DEFAULT '1.0'
);

-- Hot query: "the last N checks for this engine" (operator surface: last 7 per
-- engine; worker pause check: the single latest row per engine).
CREATE INDEX IF NOT EXISTS idx_engine_drift_check_engine_checked
  ON engine_drift_check (engine, checked_at DESC);

-- RLS on (advisor-clean) with a permissive policy: the ledger is global,
-- non-tenant and PII-free, and both runtime roles legitimately touch it.
ALTER TABLE engine_drift_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_drift_check FORCE ROW LEVEL SECURITY;
CREATE POLICY engine_drift_check_all ON engine_drift_check USING (TRUE) WITH CHECK (TRUE);

-- app_user reads it from inside the RLS-scoped audit job (engine pause check).
-- INSERT is granted for parity with api_spend; the writer is the worker's
-- unscoped client.
GRANT SELECT, INSERT ON engine_drift_check TO app_user;
