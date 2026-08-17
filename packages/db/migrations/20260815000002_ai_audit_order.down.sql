-- Revert 20260815000002_ai_audit_order.
-- Any 'ai_audit_to_full' nurture rows must be removed or reassigned before this
-- runs, or the ADD CONSTRAINT will fail (same caveat as 20260715000001.down).
ALTER TABLE nurture_enrollment DROP CONSTRAINT IF EXISTS nurture_enrollment_sequence_check;
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT nurture_enrollment_sequence_check
  CHECK (sequence IN ('free_to_kit', 'kit_to_dfy', 'kit_to_growth'));

DROP TABLE IF EXISTS ai_audit_order;
