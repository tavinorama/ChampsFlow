-- Reverses 20260911000001_ops_proof_run. Dropping the table loses the audit
-- trail behind published posts, so this is a rollback path, not a cleanup one.
DROP TABLE IF EXISTS ops.proof_run;
