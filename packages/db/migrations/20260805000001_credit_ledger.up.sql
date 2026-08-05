-- =============================================================================
-- Migration: 20260805000001_credit_ledger
-- Capability: B5 — the credit ledger (#144).
--
-- WHAT A CREDIT IS, AND WHY IT IS NOT "AN AUDIT"
-- The first design priced one audit at 1,000 credits. That breaks the moment
-- plans have different depths: after the 2026-08-05 calibration a Growth audit
-- runs 20 prompts and an Agency audit 12, so the same 1,000 credits would have
-- bought 67% more platform cost on one plan than the other, and one tier would
-- quietly subsidise the other.
--
-- The unit here is therefore the PROMPT-AUDIT — one prompt, asked across the
-- engine panel, once. 50 credits each. That makes a credit a unit of COST
-- ($0.142 / 50 ≈ $0.00284), so overage pricing stays honest no matter how the
-- plans are reshaped later. See apps/api/src/lib/credits.ts, where the grants
-- are DERIVED from PLAN_LIMITS rather than restated — a hardcoded balance is
-- exactly the kind of number that drifts from its source and is discovered a
-- month later.
--
-- APPEND-ONLY, ON PURPOSE
-- Every row is an event: a grant, a spend, a purchase, an adjustment. Nothing
-- is ever updated or deleted, so the balance is a fold over history and any
-- disputed number can be walked back to the row that caused it. balance_after
-- is stored alongside for cheap reads and human audit, but SUM(delta) is the
-- authority — if the two ever disagree, the sum is right and the cache is the
-- bug.
--
-- THE TWO IDEMPOTENCIES THAT MAKE IT TRUSTWORTHY
--   1. uniq_credit_monthly_grant — one grant per tenant per period. The grant
--      is lazy (first read of the month issues it), so without this a burst of
--      concurrent requests would each hand out a fresh month's credits.
--   2. uniq_credit_ref — one debit per (tenant, ref_type, ref_id). A BullMQ job
--      that retries after a partial failure must not charge the customer twice
--      for the same audit.
-- Both are enforced by the DATABASE, not by a read-then-write check in code,
-- because the check-then-act window is exactly where double-spend lives.
-- =============================================================================

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,

  -- Positive = credits in (monthly grant, purchase, goodwill).
  -- Negative = credits out (an audit ran).
  -- Never zero: a ledger row that changes nothing is noise in an audit trail.
  delta         INTEGER     NOT NULL CHECK (delta <> 0),

  reason        TEXT        NOT NULL
                  CHECK (reason IN ('monthly_grant', 'audit', 'purchase', 'adjustment')),

  -- What the movement points at, for grants NULL. ref_id is the geo_audit id on
  -- a debit, which is what makes the retry guard below possible.
  ref_type      TEXT,
  ref_id        UUID,

  -- Month bucket for monthly_grant rows (first of the month, UTC). NULL for
  -- everything else.
  period        DATE,

  -- Running balance at the moment this row was written. A convenience for
  -- reads and for a human reading the trail — SUM(delta) remains the truth.
  balance_after INTEGER     NOT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One monthly grant per tenant per period. Partial index: only grant rows
-- participate, so debits are free to repeat within the same month.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_monthly_grant
  ON credit_ledger (tenant_id, period)
  WHERE reason = 'monthly_grant';

-- One debit per referenced object. Partial so rows without a ref (grants,
-- manual adjustments) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_ref
  ON credit_ledger (tenant_id, ref_type, ref_id)
  WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;

-- Balance reads are always tenant-scoped and newest-first.
CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant
  ON credit_ledger (tenant_id, created_at DESC);

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger FORCE ROW LEVEL SECURITY;

-- Tenants may READ their own ledger — the balance and its history are the
-- customer's own data, and showing the movements is the point of the feature.
-- They may NOT write: every row is issued by the platform (grant on read,
-- debit on audit completion, purchase via Stripe webhook). No INSERT/UPDATE/
-- DELETE grant to app_user means a compromised tenant session cannot mint
-- credits, which is the whole attack surface of a currency table.
CREATE POLICY tenant_read_own ON credit_ledger
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

GRANT SELECT ON credit_ledger TO app_user;
