-- =============================================================================
-- Migration: 20260710000005_landing_sites_place
-- Capability: Google Places (New) integration — "paste your Google Maps
-- link" wizard prefill + embedded map on published Ozvor Pages sites
-- (issue #208 PR-9; design confirmed in #217 comment 8, 2026-07-10).
--
-- Additive only — landing_sites already carries RLS (ENABLE + FORCE +
-- tenant_isolation policy + GRANT) from 20260710000001_ozvor_pages_schema;
-- adding columns needs no RLS change and no check-rls.sql update.
--
-- place_id     — Google's stable Place ID. Per Google Places API ToS this is
--                 the ONE field storable indefinitely (all other
--                 Places-derived facts merged into `business` JSONB are
--                 cached <=30 days and must be refreshed-or-dropped on read
--                 past that window — enforced app-side, not by this schema).
-- google_synced_at — when the Places-derived facts were last fetched from
--                 Google; the 30-day cache-staleness clock referenced above.
-- =============================================================================

ALTER TABLE landing_sites ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE landing_sites ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;
