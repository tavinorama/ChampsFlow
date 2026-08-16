-- Migration: 20260815000001_api_spend_measured
-- #152 — api_spend goes from ESTIMATE to MEASURE.
--
-- Until now every row was (op, est_cost_cents): one number per operation,
-- computed from a per-engine RATE × call count (rates from the 2026-08-05
-- experiment). The LLM clients already receive real token usage on every
-- response and dropped it before it reached this table. These columns keep
-- it: which engine/model, how many tokens, what those tokens cost at list
-- price, and how the number was obtained.
--
-- All new columns are NULLABLE and est_cost_cents stays NOT NULL, so:
--   * the legacy INSERT (op, est_cost_cents) keeps working unchanged;
--   * a code writer that predates this migration is not broken by it, and a
--     code writer that postdates it degrades to the legacy INSERT on 42703
--     until this file is applied (see packages/shared/src/api-spend.ts).
--
-- source:
--   'measured' — model + tokens known, measured_cost_cents = tokens × list price
--   'rate'     — no tokens; est_cost_cents = calls × measured per-call rate
--   'flat'     — a fixed per-operation number (env override / legacy)
--
-- Still a global, PII-free ledger: no tenant column, no prompt text.
-- `ref` is an opaque correlation id (audit_id / job id) for reconciliation.

ALTER TABLE api_spend
  ADD COLUMN IF NOT EXISTS engine              TEXT,
  ADD COLUMN IF NOT EXISTS model               TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens        INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens       INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS measured_cost_cents NUMERIC(10,4) CHECK (measured_cost_cents IS NULL OR measured_cost_cents >= 0),
  ADD COLUMN IF NOT EXISTS source              TEXT CHECK (source IS NULL OR source IN ('measured', 'rate', 'flat')),
  ADD COLUMN IF NOT EXISTS ref                 TEXT;

-- Per-engine time series is the question this ledger now answers
-- ("what did anthropic cost us this month, measured?").
CREATE INDEX IF NOT EXISTS idx_api_spend_engine_created ON api_spend (engine, created_at);

-- Grants and RLS policy from 20260627000001 already cover the new columns
-- (column-agnostic SELECT/INSERT on the table). Nothing to re-grant.
