-- Rollback: 20260710000001_ozvor_pages_schema
ALTER TABLE plan_task DROP CONSTRAINT IF EXISTS plan_task_action_type_check;
DROP INDEX IF EXISTS idx_plan_task_landing_site;
ALTER TABLE plan_task DROP COLUMN IF EXISTS landing_page_id;
ALTER TABLE plan_task DROP COLUMN IF EXISTS landing_site_id;
ALTER TABLE plan_task DROP COLUMN IF EXISTS action_type;
ALTER TABLE tenants DROP COLUMN IF EXISTS extra_landing_sites;
DROP TABLE IF EXISTS landing_events;
DROP TABLE IF EXISTS landing_leads;
DROP TABLE IF EXISTS landing_testimonials;
DROP TABLE IF EXISTS landing_page_versions;
DROP TABLE IF EXISTS landing_pages;
DROP TABLE IF EXISTS landing_sites;
