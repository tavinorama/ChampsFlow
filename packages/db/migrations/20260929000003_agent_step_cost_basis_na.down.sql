-- Reverse: back to three states. Rows written as not_applicable become NULL
-- first, or the narrower CHECK could not be added.
UPDATE ops.agent_step SET cost_basis = NULL WHERE cost_basis = 'not_applicable';
ALTER TABLE ops.agent_step DROP CONSTRAINT IF EXISTS agent_step_cost_basis_check;
ALTER TABLE ops.agent_step
  ADD CONSTRAINT agent_step_cost_basis_check
  CHECK (cost_basis IS NULL OR cost_basis IN ('measured', 'estimated', 'unknown'));
