-- Allow the new 'kit_to_growth' nurture sequence (the missing recurring-upsell
-- rung: Kit buyer → Growth $99/mo). Widens the CHECK on nurture_enrollment.sequence.
ALTER TABLE nurture_enrollment DROP CONSTRAINT IF EXISTS nurture_enrollment_sequence_check;
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT nurture_enrollment_sequence_check
  CHECK (sequence IN ('free_to_kit', 'kit_to_dfy', 'kit_to_growth'));
