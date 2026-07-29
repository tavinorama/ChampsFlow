-- Rollback: 20260729000001_engine_drift_check
-- Drops the B4 anti-drift control history.
-- WARNING: the drift series is the only record of how each engine behaved on a
-- given day — once dropped, past scores can no longer be defended against
-- "was it us or was it the engine?". Export before rolling back if the history
-- matters. Readers tolerate the table being absent (fail-open, no pausing).

DROP POLICY IF EXISTS engine_drift_check_all ON engine_drift_check;
DROP INDEX IF EXISTS idx_engine_drift_check_engine_checked;
DROP TABLE IF EXISTS engine_drift_check;
