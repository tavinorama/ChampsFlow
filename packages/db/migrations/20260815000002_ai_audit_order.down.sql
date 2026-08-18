-- Revert 20260815000002_ai_audit_order.
-- This migration never touched nurture_enrollment_sequence_check (see the .up),
-- so the revert only drops the table it created. The 9-sequence CHECK is owned
-- by 20260817000001_nurture_sequences_widen and its own .down.
DROP TABLE IF EXISTS ai_audit_order;
