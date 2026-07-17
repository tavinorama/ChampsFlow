-- =============================================================================
-- Migration: 20260717000001_brand_social_profiles
-- Founder ask (2026-07-17): add X, Instagram, Facebook and TikTok to the
-- per-brand public profiles ("Your public profiles" + "connect your data").
--
-- Same contract as 20260627000005_brand_public_profiles: nullable TEXT URLs of
-- PUBLIC brand pages; URL/SSRF validation lives at the application layer; no
-- CHECK constraints. brands already has RLS ENABLED+FORCED and app_user GRANTs.
-- =============================================================================
ALTER TABLE brands ADD COLUMN IF NOT EXISTS x_url         TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS facebook_url  TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tiktok_url    TEXT;
