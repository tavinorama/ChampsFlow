-- 20260708000001_identity_claim.down.sql
DROP INDEX IF EXISTS idx_lead_capture_claimed_by;
DROP INDEX IF EXISTS idx_kit_order_claimed_by;

ALTER TABLE lead_capture
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS claimed_by_tenant_id;

ALTER TABLE kit_order
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS claimed_by_tenant_id;
