-- Rollback: 20260817000001_api_spend_tenant
-- Drops the tenant attribution column; the code writer degrades to the
-- tenant-less INSERT on 42703 (logged once). Rows are otherwise untouched.
DROP INDEX IF EXISTS idx_api_spend_tenant_created;

ALTER TABLE api_spend
  DROP COLUMN IF EXISTS tenant_id;
