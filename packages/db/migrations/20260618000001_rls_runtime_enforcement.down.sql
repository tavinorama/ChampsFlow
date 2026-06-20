-- 20260618000001_rls_runtime_enforcement.down.sql
-- Reverse the runtime RLS enforcement grants.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'op') THEN
    EXECUTE 'REVOKE app_user FROM op';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'REVOKE app_user FROM postgres';
  END IF;
END $$;

REVOKE app_user FROM CURRENT_USER;

REVOKE SELECT, INSERT ON ccpa_requests FROM app_user;
