-- Nurture (PR feat/nurture-aggressive-cadences, 17/08/2026): widen the CHECK on
-- nurture_enrollment.sequence to every sequence in
-- packages/shared/src/nurture-cadence.ts. Until this is applied the API/worker
-- log nurture_sequence_not_allowed and skip the new names (never crash).
ALTER TABLE nurture_enrollment DROP CONSTRAINT IF EXISTS nurture_enrollment_sequence_check;
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT nurture_enrollment_sequence_check
  CHECK (sequence IN (
    'free_to_kit',
    'kit_to_dfy',
    'kit_to_growth',
    'credit_pack_bought',
    'ai_audit_bought',
    'pages_bought',
    'book_to_dfy',
    'subscriber_onboarding',
    'ai_audit_to_full'
  ));
