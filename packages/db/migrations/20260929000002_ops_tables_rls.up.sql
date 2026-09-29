-- =============================================================================
-- Migration: 20260929000002_ops_tables_rls
-- D9 (Codex N14, 28/09/2026; D20 remainder).
--
-- Six tables of the `ops` schema had Row Level Security OFF, no policy, and
-- grants to app_user (SELECT/INSERT, plus UPDATE on agent_run and agent_step).
-- They hold the company's own operation (graph runs, steps, outcomes, lessons,
-- prompt overrides, proof runs): no tenant column, no customer data by design,
-- but a step summary can name a prospect's company.
--
-- app_user is the role a TENANT-scoped request drops into. Read on 29/09:
--   - the application connects as `postgres` (owner, BYPASSRLS) through the
--     pooler; super-admin requests, operator-key requests, the Telegram
--     webhook, liveness and every worker job that touches ops.* run OUTSIDE a
--     tenant scope, i.e. as that privileged role;
--   - no file that queries ops.* enters a tenant scope
--     (tests/unit/ops-tables-privileged-only.test.ts pins this).
-- So the grants to app_user serve no code path. They are removed, and RLS is
-- turned on with the same service_only policy the operator tables carry.
--
-- NOTE: worker and api run migrations at boot. Merging this PR changes
-- production. HIGH by house rule.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_run','agent_step','agent_outcome','memory_lesson','prompt_override','proof_run'] LOOP
    IF to_regclass(format('ops.%I', t)) IS NULL THEN
      CONTINUE; -- a table that does not exist in this environment is not an error
    END IF;
    EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE ops.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'ops' AND tablename = t AND policyname = 'service_only') THEN
      EXECUTE format('CREATE POLICY service_only ON ops.%I FOR ALL TO postgres USING (true) WITH CHECK (true)', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      EXECUTE format('REVOKE ALL ON ops.%I FROM app_user', t);
    END IF;
  END LOOP;
END $$;
