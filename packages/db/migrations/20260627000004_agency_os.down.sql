-- Rollback: 20260627000004_agency_os
-- Reverts all Agency OS v1 schema changes.
-- WARNING: Any data stored in report_share, white_label, and brands.client_label
--          will be permanently lost. Only run in development/staging.

-- Drop tables in dependency order (report_share references brands; white_label references tenants)
DROP TABLE IF EXISTS report_share;
DROP TABLE IF EXISTS white_label;

-- Remove client_label from brands
ALTER TABLE brands
  DROP COLUMN IF EXISTS client_label;
