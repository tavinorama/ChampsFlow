-- credit_ledger: let the worker record the debit it already tries to record.
--
-- WHAT BROKE
-- 2026-08-10 06:03:42, first real audit on the post-#438 worker:
--   "permission denied for table credit_ledger"
-- The #423 debit (charge on audit completion) runs inside the worker's
-- tenant-scoped RLS session — role app_user — and the ledger migration
-- (20260805000001) deliberately granted app_user SELECT only, with a
-- read-only policy: "a compromised tenant session cannot mint credits".
-- Both decisions were right; they had simply never met, because the worker
-- ran a pre-#423 build until 2026-08-07 (the 12-deploy outage).
--
-- THE RECONCILIATION
-- The security property worth keeping is "cannot MINT credits" — minting is
-- a POSITIVE delta. The debit is a NEGATIVE delta on the session's own
-- tenant. So the write permission is opened exactly that far and no further:
--
--   INSERT only  ·  own tenant only  ·  delta <= 0 only
--
-- A compromised tenant session can now, at worst, charge itself. Positive
-- rows (monthly grants, pack purchases) remain the platform's alone —
-- written by privileged roles (Stripe webhook, grant paths), which RLS does
-- not constrain here.
GRANT INSERT ON credit_ledger TO app_user;

CREATE POLICY tenant_debit_own ON credit_ledger
  FOR INSERT TO app_user
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    AND delta <= 0
  );
