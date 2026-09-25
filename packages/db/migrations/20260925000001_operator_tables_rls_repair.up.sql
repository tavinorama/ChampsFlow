-- =============================================================================
-- Migration: 20260925000001_operator_tables_rls_repair
-- B14 (Codex D20, 23/09/2026) — re-apply, idempotently, the RLS that
-- 20260728000001_operator_tables_rls declared.
--
-- What was found (production, read-only, 25/09/2026 ~11:00 UTC):
--   schema_migrations says 20260728000001_operator_tables_rls was applied on
--   2026-07-30, and the file has not changed since 28/07. Yet pg_class shows
--   relrowsecurity = FALSE and zero policies on waitlist, lead_capture,
--   kit_order, nurture_enrollment, nurture_send_log, pages_order and
--   crm_contact, while app_user still holds INSERT/SELECT/UPDATE grants on
--   kit_order, lead_capture, nurture_enrollment, nurture_send_log and
--   waitlist. Two of those tables hold e-mail addresses. CI passes because it
--   migrates a fresh database; production drifted after the fact.
--
-- This migration is the repair: every statement is guarded, so it is safe on
-- a database where the original DID take, and it restores the exact policies
-- of 20260728000001 where it did not. Nothing is dropped; nothing is
-- re-granted.
--
-- Run only by the founder (production migration). Verify afterwards with
-- packages/db/scripts/check-rls.sql (expected: 0 rows).
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['waitlist','lead_capture','kit_order','nurture_enrollment','nurture_send_log','pages_order','crm_contact'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'service_only') THEN
      EXECUTE format('CREATE POLICY service_only ON %I FOR ALL TO postgres USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;

  -- The two pre-account tables a tenant may read back once claimed
  -- (GET /api/account/claimed-history). Same policy as 20260728000001.
  FOREACH t IN ARRAY ARRAY['lead_capture','kit_order'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_claimed_read') THEN
      EXECUTE format(
        'CREATE POLICY tenant_claimed_read ON %I FOR SELECT TO app_user USING (claimed_by_tenant_id = current_setting(''app.current_tenant_id'', TRUE)::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- schema_migrations: ENABLE only (never FORCE — the owner must bypass so the
-- migration tool can never lock itself out), same as 20260728000001.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schema_migrations' AND policyname = 'service_only') THEN
    CREATE POLICY service_only ON schema_migrations FOR ALL TO postgres USING (true) WITH CHECK (true);
  END IF;
END $$;
