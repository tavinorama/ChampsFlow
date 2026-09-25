-- C17 / P15 (25/09/2026): the cost STATE of a step, next to its cents.
--   measured  — the engine returned a cost
--   estimated — flat-fee engine with an operator-set per-task allocation
--   unknown   — nothing to go on; cost_cents stays NULL (never 0)
-- Nullable, no backfill: rows before this migration simply have no basis.
-- Founder applies. The worker writes the column when present and falls back
-- (warning once) when it is not.
ALTER TABLE ops.agent_step
  ADD COLUMN IF NOT EXISTS cost_basis TEXT
    CHECK (cost_basis IS NULL OR cost_basis IN ('measured', 'estimated', 'unknown'));
