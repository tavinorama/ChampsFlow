-- Reverse 20260925000001_operator_tables_rls_repair.
-- Intentionally a no-op: this migration only re-asserts what
-- 20260728000001_operator_tables_rls declared. Reversing it would mean
-- reversing that one (its .down does so). Recorded here so the migration
-- ledger stays symmetric.
SELECT 1;
