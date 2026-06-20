-- Rollback: 20260530000002_brand_monitoring
DROP INDEX IF EXISTS idx_brands_monitoring;
ALTER TABLE brands DROP COLUMN IF EXISTS monitoring_enabled;
