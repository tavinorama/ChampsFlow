-- Migration: 20260817000001_api_spend_tenant
-- D8e — api_spend gains per-tenant attribution.
--
-- The ledger has been global (op, engine, tokens, cents, ref). Margin per
-- plan and the "Agency negative at 25 brands" alert need the spend tied to
-- the tenant it was incurred for. The code writer (packages/llm/src/api-spend.ts,
-- PR A) already passes tenant_id for audits and Ozvor Pages generation and
-- tolerates this column being ABSENT (42703 → retries without it, logs
-- `api_spend_tenant_column_absent` once). Applying this file simply starts
-- keeping the value.
--
-- NULLABLE by design: free_test / system spend has no tenant. No FK on
-- purpose — a deleted tenant (LGPD/GDPR erasure) must not cascade or block on
-- a cost ledger; the uuid stays as an opaque attribution key. No PII.

ALTER TABLE api_spend
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- "what did tenant X cost us this month?" — the per-plan margin question.
CREATE INDEX IF NOT EXISTS idx_api_spend_tenant_created ON api_spend (tenant_id, created_at);

-- Grants and RLS policy from 20260627000001 already cover the new column
-- (column-agnostic SELECT/INSERT on the table). Nothing to re-grant.
