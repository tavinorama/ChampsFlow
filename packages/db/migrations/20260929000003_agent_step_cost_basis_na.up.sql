-- D7 (Codex N16, 28/09/2026): a fourth cost state, `not_applicable`, for steps
-- that call no model (wait, approval, publish, harvest, read). On 28/09 there
-- were 151 steps with basis `unknown` and 109 with NULL; the 109 were not
-- missing a cost, they had none. The CHECK is replaced, not the data.
-- Worker and api run migrations at boot: merging applies this.
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'ops' AND rel.relname = 'agent_step' AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%cost_basis%'
  LOOP
    EXECUTE format('ALTER TABLE ops.agent_step DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE ops.agent_step
    ADD CONSTRAINT agent_step_cost_basis_check
    CHECK (cost_basis IS NULL OR cost_basis IN ('measured', 'estimated', 'unknown', 'not_applicable'));
END $$;
