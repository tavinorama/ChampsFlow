-- =============================================================================
-- Migration DOWN: 20260506000003_dpa_acknowledgments
-- Reverts: dpa_acknowledgments table + users.current_dpa_version column.
--
-- WARNING: Running this down migration destroys all DPA acknowledgment records.
-- This is irreversible for compliance purposes. Only run in development/test
-- environments or under explicit legal sign-off.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop dpa_acknowledgments table (cascade drops indexes + policies)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS dpa_acknowledgments CASCADE;

-- ---------------------------------------------------------------------------
-- Revert users.current_dpa_version column
-- ---------------------------------------------------------------------------
ALTER TABLE users
  DROP COLUMN IF EXISTS current_dpa_version;
