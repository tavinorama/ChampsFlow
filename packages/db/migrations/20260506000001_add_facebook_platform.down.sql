-- =============================================================================
-- Down Migration: 20260506000001_add_facebook_platform
-- Description: Reverts the social_accounts.platform CHECK constraint to the
--              original 2-platform set ('linkedin', 'instagram').
--
-- SAFETY: This down migration FAILS if any rows with platform='facebook' exist.
--         This prevents silent data loss when rolling back with live Facebook
--         accounts in the database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Safety guard: refuse rollback if facebook rows exist
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM social_accounts WHERE platform = 'facebook' LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back 20260506000001_add_facebook_platform: '
      'rows with platform=''facebook'' exist in social_accounts. '
      'Delete or migrate these rows before rolling back.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Drop the 3-platform CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE social_accounts
  DROP CONSTRAINT IF EXISTS social_accounts_platform_check;

-- ---------------------------------------------------------------------------
-- Re-add the original 2-platform CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE social_accounts
  ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN ('linkedin', 'instagram'));
