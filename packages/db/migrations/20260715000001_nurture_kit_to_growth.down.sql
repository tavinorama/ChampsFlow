-- Revert: restore the original two-value CHECK. Any 'kit_to_growth' rows must be
-- removed or reassigned before this runs, or the ADD CONSTRAINT will fail.
ALTER TABLE nurture_enrollment DROP CONSTRAINT IF EXISTS nurture_enrollment_sequence_check;
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT nurture_enrollment_sequence_check
  CHECK (sequence IN ('free_to_kit', 'kit_to_dfy'));
