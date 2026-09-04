-- Rollback P0-08's schema. This returns hosted generation to its fail-soft OFF
-- state: debitForContentDraft() gets a CHECK violation, classifies it as
-- `ledger_not_ready`, and the route answers 503 "hosted generation is not
-- switched on yet" instead of generating on our key without a meter. BYOK keeps
-- working throughout — it never touches any of this.
--
-- NOTHING HERE DELETES A CREDIT ROW. The ledger is append-only, and rolling a
-- migration back is not a licence to erase history: any 'content' rows already
-- written stay, which is why the CHECK is restored WITHOUT that reason only
-- when no such row exists. If one does, the constraint is left widened and the
-- rollback says so rather than destroying a customer's billing trail.

DROP TABLE IF EXISTS content_generation_failure;

DROP INDEX IF EXISTS uniq_content_generation_key;
ALTER TABLE content_piece DROP COLUMN IF EXISTS generation_key;

DO $$
DECLARE
  content_rows BIGINT;
BEGIN
  SELECT COUNT(*) INTO content_rows FROM credit_ledger WHERE reason = 'content';
  IF content_rows > 0 THEN
    RAISE WARNING
      'credit_ledger still holds % row(s) with reason=content; leaving the CHECK widened rather than orphaning billing history.',
      content_rows;
  ELSE
    ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;
    ALTER TABLE credit_ledger
      ADD CONSTRAINT credit_ledger_reason_check
      CHECK (reason IN ('monthly_grant', 'audit', 'purchase', 'adjustment'));
  END IF;
END $$;
