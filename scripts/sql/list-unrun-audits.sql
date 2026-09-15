-- list-unrun-audits.sql — READ ONLY.
--
-- Audit rows that never reached a terminal state, plus the rows the worker
-- marked as deliberately un-run (2026-09-15, T0.1). Run before and after any
-- cleanup; the cleanup itself is a separate, founder-authorized UPDATE
-- (docs/change-notes/audit-unrun-rows-20260915.md).
--
-- A `running` row older than the queue's three attempts (~70 min) is a zombie:
-- the job that owned it is gone. Nothing here writes.

WITH stuck AS (
  SELECT id, brand_id, tenant_id, triggered_by, status, created_at,
         ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60.0)::int AS age_minutes
    FROM geo_audit
   WHERE status IN ('pending', 'running')
)
SELECT 'stuck'                                   AS kind,
       id, brand_id, triggered_by, status, created_at, age_minutes,
       CASE WHEN age_minutes > 90 THEN 'zombie (older than three attempts)'
            ELSE 'possibly still in flight' END  AS reading
  FROM stuck
UNION ALL
SELECT 'unrun_marked',
       id, brand_id, triggered_by, status, created_at,
       ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60.0)::int,
       split_part(error_message, ':', 1)
  FROM geo_audit
 WHERE status = 'failed'
   AND (error_message LIKE 'coverage_retry_skipped:%' OR error_message LIKE 'monthly_cap_reached:%')
 ORDER BY kind, created_at DESC;
