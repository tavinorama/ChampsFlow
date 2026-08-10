DROP POLICY IF EXISTS tenant_debit_own ON credit_ledger;
REVOKE INSERT ON credit_ledger FROM app_user;
