-- =============================================================================
-- Rollback: 20260712000002_order_refund_status
--
-- WARNING (money): restoring the original CHECK requires remapping rows that
-- hold the new statuses. There is no original status that is safe for a
-- refunded order — 'paid'/'delivered'/'credited' would RE-GRANT access to a
-- refunded buyer — so refunded/failed both map to 'pending' (grants nothing
-- anywhere). Only roll this back together with the webhook code that writes
-- these statuses; reconcile remapped orders by hand afterwards (refunded_at
-- is dropped with the column).
-- =============================================================================

UPDATE kit_order   SET status = 'pending' WHERE status IN ('refunded', 'failed');
UPDATE pages_order SET status = 'pending' WHERE status IN ('refunded', 'failed');

ALTER TABLE kit_order
  DROP CONSTRAINT IF EXISTS kit_order_status_check;
ALTER TABLE kit_order
  ADD CONSTRAINT kit_order_status_check
  CHECK (status IN ('pending', 'paid', 'delivered'));
ALTER TABLE kit_order DROP COLUMN IF EXISTS refunded_at;

ALTER TABLE pages_order
  DROP CONSTRAINT IF EXISTS pages_order_status_check;
ALTER TABLE pages_order
  ADD CONSTRAINT pages_order_status_check
  CHECK (status IN ('pending', 'paid', 'credited'));
ALTER TABLE pages_order DROP COLUMN IF EXISTS refunded_at;
