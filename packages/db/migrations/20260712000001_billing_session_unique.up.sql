-- =============================================================================
-- Migration: 20260712000001_billing_session_unique
-- Capability: bind a Stripe Checkout Session to at most ONE order (issue #262).
--
-- Security (CRITICAL / payment-bypass backstop): the Kit delivery path now
-- verifies session metadata names the specific order before crediting, but the
-- database is the last line of defense. A partial UNIQUE index guarantees a
-- given stripe_session_id can never be recorded against two different orders —
-- so one paid session can unlock at most one Kit / one Pages credit even if the
-- application check were ever bypassed.
--
-- Partial (WHERE stripe_session_id IS NOT NULL) because unpaid orders share a
-- NULL session id and must NOT collide.
-- =============================================================================

-- Preflight (Hermes #263): explicitly detect any pre-existing duplicate session
-- binding and abort with a clear, actionable message BEFORE attempting the index
-- build — a duplicate is a real integrity incident (a session already unlocked
-- two orders) that must be reconciled by hand, never silently. Raises rather than
-- letting CREATE UNIQUE INDEX fail with an opaque error.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT 'kit_order' AS tbl, stripe_session_id, COUNT(*) AS n
      FROM kit_order WHERE stripe_session_id IS NOT NULL
      GROUP BY stripe_session_id HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'pages_order' AS tbl, stripe_session_id, COUNT(*) AS n
      FROM pages_order WHERE stripe_session_id IS NOT NULL
      GROUP BY stripe_session_id HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION
      'Duplicate stripe_session_id in %: % rows share session %. Reconcile (refund/void the extra order) before applying the UNIQUE index.',
      dup.tbl, dup.n, dup.stripe_session_id;
  END LOOP;
END $$;

-- kit_order: replace the plain lookup index with a UNIQUE partial index.
DROP INDEX IF EXISTS idx_kit_order_session;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_order_session
  ON kit_order (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- pages_order: same one-session-one-order invariant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pages_order_session
  ON pages_order (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
