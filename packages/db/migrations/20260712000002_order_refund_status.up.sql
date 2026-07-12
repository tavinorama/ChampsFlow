-- =============================================================================
-- Migration: 20260712000002_order_refund_status
-- Capability: refund/dispute revocation (launch-eve QA P1 — Stripe webhook).
--
-- The webhook now handles charge.refunded / charge.dispute.created by revoking
-- the entitlement the charge paid for. That requires two new terminal statuses
-- on the one-time-purchase order tables:
--
--   refunded — payment was refunded or disputed; the order no longer grants
--              anything. Every access/claim path already filters on
--              status IN ('pending','paid','delivered'/'credited'), so this
--              status revokes by construction — no gate needed to change.
--   failed   — checkout.session.async_payment_failed: a delayed payment method
--              (e.g. boleto) never settled. The order was never granted;
--              marking it keeps 'pending' meaning "checkout still in flight".
--
-- refunded_at records when revocation happened (support/audit trail — the
-- audit_log row only exists when a tenant is known; pre-account orders have
-- no tenant).
--
-- The original CHECKs were inline column constraints (auto-named
-- <table>_status_check). We drop by catalog lookup rather than by that assumed
-- name: a name mismatch under DROP IF EXISTS would silently leave the OLD
-- constraint in place and every revocation UPDATE would then fail in prod.
-- =============================================================================

ALTER TABLE kit_order
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE pages_order
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
      FROM pg_constraint
     WHERE conrelid IN ('kit_order'::regclass, 'pages_order'::regclass)
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE kit_order
  ADD CONSTRAINT kit_order_status_check
  CHECK (status IN ('pending', 'paid', 'delivered', 'refunded', 'failed'));

ALTER TABLE pages_order
  ADD CONSTRAINT pages_order_status_check
  CHECK (status IN ('pending', 'paid', 'credited', 'refunded', 'failed'));
