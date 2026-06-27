-- Rollback: 20260627000006_google_attribution
-- Reverts Attribution v1 (#86) schema changes.
-- WARNING: All Google OAuth connection records and metric cache rows will be
--          permanently lost. Only run in development/staging unless you have a
--          confirmed data-preservation plan. Encrypted token bytes cannot be
--          recovered once these rows are dropped.

-- Drop in reverse dependency order:
--   google_metric_cache references google_connection (ON DELETE CASCADE),
--   so it must be dropped first.
DROP TABLE IF EXISTS google_metric_cache;
DROP TABLE IF EXISTS google_connection;
