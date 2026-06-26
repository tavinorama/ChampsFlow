-- Migration: 20260627000001_api_spend
-- Platform-wide API spend ledger for the monthly budget cap (founder's $100/mo
-- of AI/search spend on PLATFORM keys). Not tenant data — a global ledger of
-- estimated cost per costly operation (free test, audit). No PII.
--
-- Cap policy (enforced in code): the FREE TEST is hard-capped at the monthly
-- budget (it's the runaway-cost, unauthenticated surface). Audits RECORD spend
-- for visibility but are never hard-blocked (paying customers must not be cut off).

CREATE TABLE IF NOT EXISTS api_spend (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op             TEXT NOT NULL,                     -- 'free_test' | 'audit' | ...
  est_cost_cents INTEGER NOT NULL CHECK (est_cost_cents >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_spend_created ON api_spend (created_at);

-- RLS on (keeps the DB advisor clean) but the ledger is global, non-tenant,
-- PII-free — a permissive policy lets both the unscoped login role (free test)
-- and the scoped app_user (worker) read/write it.
ALTER TABLE api_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_spend FORCE ROW LEVEL SECURITY;
CREATE POLICY api_spend_all ON api_spend USING (TRUE) WITH CHECK (TRUE);
GRANT SELECT, INSERT ON api_spend TO app_user;
