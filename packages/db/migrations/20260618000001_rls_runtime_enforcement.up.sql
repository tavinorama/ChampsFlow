-- 20260618000001_rls_runtime_enforcement.up.sql
--
-- Runtime RLS enforcement support (audit HIGH fix — "runtime RLS inert").
--
-- The API now drops privileges into the non-superuser `app_user` role per
-- request (via `set_config('role', …)` inside a transaction) so that
-- FORCE ROW LEVEL SECURITY actually applies — a superuser/owner connection
-- bypasses RLS entirely. Two grants make that switch correct:
--
-- 1. ccpa_requests was missing its base GRANT to app_user — only
--    `REVOKE UPDATE, DELETE` existed (20260506000004). Under the old superuser
--    connection this never surfaced; once the app runs as app_user,
--    authenticated CCPA reads/inserts would hit "permission denied". Grant
--    SELECT + INSERT to match the append-only intent (no UPDATE/DELETE).
--
-- 2. For deployments whose login role is NOT a superuser (managed Postgres /
--    Supabase), that login role must be a MEMBER of app_user for the runtime
--    `SET ROLE app_user` to be permitted. Superuser logins (local Docker / CI)
--    can SET ROLE unconditionally, so these grants are a harmless no-op there.

-- (1) Missing base grant on ccpa_requests.
GRANT SELECT, INSERT ON ccpa_requests TO app_user;

-- (2) Let the migration runner / app login role assume app_user.
GRANT app_user TO CURRENT_USER;

-- Best-effort membership for the conventional local/compose/managed login roles.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'op') THEN
    EXECUTE 'GRANT app_user TO op';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'GRANT app_user TO postgres';
  END IF;
END $$;
