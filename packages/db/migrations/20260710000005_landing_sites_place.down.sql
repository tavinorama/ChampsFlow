-- Rollback: 20260710000005_landing_sites_place
ALTER TABLE landing_sites DROP COLUMN IF EXISTS google_synced_at;
ALTER TABLE landing_sites DROP COLUMN IF EXISTS place_id;
