-- Revert 20260623000001_kit_test_link
DROP INDEX IF EXISTS idx_kit_order_lead_capture;

ALTER TABLE kit_order
  DROP COLUMN IF EXISTS lead_capture_id;
