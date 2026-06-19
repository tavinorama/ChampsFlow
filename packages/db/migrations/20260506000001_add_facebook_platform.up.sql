-- =============================================================================
-- Migration: 20260506000001_add_facebook_platform
-- Description: Extends social_accounts.platform CHECK constraint to include
--              'facebook' for C4-extension (founder decision 2026-05-05).
--
-- Approach:
--  1. Dynamically find and drop any existing CHECK constraint on
--     social_accounts.platform (handles both auto-named and explicitly-named
--     variants across Postgres versions and initial schema states).
--  2. Add new CHECK constraint with an explicit name, allowing
--     'linkedin', 'instagram', 'facebook'.
--
-- RLS: No table structure changes; existing tenant_isolation policy is unchanged.
--      check-rls.sh must still pass after this migration (verified at review step).
--
-- Safety:
--  - This migration is additive only — it relaxes a constraint, does not tighten it.
--  - The down migration re-adds the 2-platform constraint and fails if any
--    facebook rows exist (protecting against accidental rollback with live data).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Dynamically find and drop the existing platform CHECK constraint.
-- Postgres auto-names inline CHECK constraints as <table>_<col>_check, but
-- we use pg_constraint to find the exact name to be safe across versions.
-- We drop ANY CHECK constraint on social_accounts that references the
-- 'platform' column (there should be exactly one from the initial schema).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'social_accounts'
      AND nsp.nspname = current_schema()
      AND con.contype = 'c'                          -- CHECK constraint
      AND pg_get_constraintdef(con.oid) LIKE '%platform IN%'
    LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE social_accounts DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No existing platform CHECK constraint found — proceeding to add new one.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Add the expanded CHECK constraint (3 platforms) with explicit name.
-- The explicit name makes it reliable for the down migration to drop by name.
-- Drop by the known name first (idempotent) — the heuristic detection above
-- can miss a constraint whose definition uses `= ANY (ARRAY[...])` formatting,
-- which would otherwise cause "constraint already exists" on a clean apply.
-- ---------------------------------------------------------------------------
ALTER TABLE social_accounts
  DROP CONSTRAINT IF EXISTS social_accounts_platform_check;

ALTER TABLE social_accounts
  ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'facebook'));

-- ---------------------------------------------------------------------------
-- Confirmation comment
-- RLS: social_accounts already has ENABLE + FORCE ROW LEVEL SECURITY +
--      tenant_isolation policy from 20260501000001_initial_schema.up.sql.
--      This migration does not change any RLS configuration.
--      Run check-rls.sh after applying this migration to confirm
--      pg_class.relrowsecurity = true for social_accounts.
-- C4-extension: Facebook platform now accepted in social_accounts.platform.
-- ---------------------------------------------------------------------------
