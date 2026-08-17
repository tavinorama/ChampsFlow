-- Revert to the three legacy names. Rows with newer names would violate the
-- CHECK: suppress them first so the constraint can be re-added.
UPDATE nurture_enrollment
   SET suppressed = TRUE, suppressed_at = NOW(), suppressed_reason = 'migration_rollback', updated_at = NOW()
 WHERE sequence NOT IN ('free_to_kit', 'kit_to_dfy', 'kit_to_growth') AND suppressed = FALSE;
DELETE FROM nurture_enrollment WHERE sequence NOT IN ('free_to_kit', 'kit_to_dfy', 'kit_to_growth');
ALTER TABLE nurture_enrollment DROP CONSTRAINT IF EXISTS nurture_enrollment_sequence_check;
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT nurture_enrollment_sequence_check
  CHECK (sequence IN ('free_to_kit', 'kit_to_dfy', 'kit_to_growth'));
