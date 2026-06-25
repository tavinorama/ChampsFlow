-- Rollback: 20260625000001_nurture_sequence
-- Drop in reverse dependency order: send_log first (FK → enrollment), then enrollment.
-- The marketing_consent column is dropped last (it is on a pre-existing table).
DROP TABLE IF EXISTS nurture_send_log;
DROP TABLE IF EXISTS nurture_enrollment;
ALTER TABLE lead_capture DROP COLUMN IF EXISTS marketing_consent;
