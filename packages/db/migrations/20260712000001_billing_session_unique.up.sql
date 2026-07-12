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
-- NULL session id and must NOT collide. Pre-launch there are no paid orders, so
-- no duplicate-session cleanup is needed; if a duplicate ever existed the index
-- build fails loudly (the desired outcome — investigate, don't silently ship).
-- =============================================================================

-- kit_order: replace the plain lookup index with a UNIQUE partial index.
DROP INDEX IF EXISTS idx_kit_order_session;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_order_session
  ON kit_order (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- pages_order: same one-session-one-order invariant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pages_order_session
  ON pages_order (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
