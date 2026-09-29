-- Reverse 20260929000002: the state read in production on 28/09.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_run','agent_step','agent_outcome','memory_lesson','prompt_override','proof_run'] LOOP
    IF to_regclass(format('ops.%I', t)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS service_only ON ops.%I', t);
    EXECUTE format('ALTER TABLE ops.%I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE ops.%I DISABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      EXECUTE format('GRANT SELECT, INSERT ON ops.%I TO app_user', t);
      IF t IN ('agent_run', 'agent_step') THEN
        EXECUTE format('GRANT UPDATE ON ops.%I TO app_user', t);
      END IF;
    END IF;
  END LOOP;
END $$;
