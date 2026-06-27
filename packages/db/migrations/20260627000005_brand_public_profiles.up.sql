-- =============================================================================
-- Migration: 20260627000005_brand_public_profiles
-- Capability: #79 — Per-brand public profile URLs
-- Date: 2026-06-27
-- Jurisdiction: Brazil (LGPD) + EU (GDPR) + US (CCPA/CPRA)
--
-- Changes:
--   1. brands — ADD COLUMN (×7) public profile URL fields
--      linkedin_url, reddit_url, wikipedia_url, g2_url, trustpilot_url,
--      crunchbase_url, youtube_url — all nullable TEXT.
--
--      These fields hold publicly visible URLs that describe where a brand
--      appears across third-party platforms.  They are not personal data in
--      isolation (they refer to brand/company pages), but may indirectly
--      identify individuals on small accounts; treat under the brands table
--      retention policy: account life + 30-day grace (ROPA §G2).
--
--      URL format validation and SSRF-safety checks (allowlist of expected
--      hostnames per field) are enforced exclusively at the application layer.
--      No CHECK constraints are added here to keep back-compat flexible and
--      avoid migration-time pain when platform URL patterns change.
--
--      No new RLS/GRANTs are needed — brands already has RLS ENABLED+FORCED
--      and app_user GRANTs from 20260530000001_geo_audit_engine.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Change 1: public profile URL columns on brands
-- All columns are nullable TEXT with DEFAULT NULL so existing rows are
-- unaffected and no backfill is required.
-- Retention: inherits brands retention — account life + 30-day grace (ROPA §G2).
-- URL format / SSRF validation enforced at the application layer, not here.
-- ---------------------------------------------------------------------------
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS linkedin_url    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reddit_url      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wikipedia_url   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS g2_url          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trustpilot_url  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS crunchbase_url  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS youtube_url     TEXT DEFAULT NULL;
