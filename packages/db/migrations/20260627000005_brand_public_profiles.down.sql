-- Rollback: 20260627000005_brand_public_profiles
-- Reverts all per-brand public profile URL columns from brands.
-- WARNING: Any data stored in these columns will be permanently lost.
--          Only run in development/staging unless you have a confirmed
--          data-preservation plan.

-- Drop columns in reverse order for readability.
ALTER TABLE brands
  DROP COLUMN IF EXISTS youtube_url,
  DROP COLUMN IF EXISTS crunchbase_url,
  DROP COLUMN IF EXISTS trustpilot_url,
  DROP COLUMN IF EXISTS g2_url,
  DROP COLUMN IF EXISTS wikipedia_url,
  DROP COLUMN IF EXISTS reddit_url,
  DROP COLUMN IF EXISTS linkedin_url;
