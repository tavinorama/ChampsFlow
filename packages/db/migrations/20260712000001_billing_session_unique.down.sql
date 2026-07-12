-- =============================================================================
-- Rollback: 20260712000001_billing_session_unique
-- Restores the non-unique kit_order session lookup index and drops the UNIQUE
-- partial indexes.
-- =============================================================================

DROP INDEX IF EXISTS uq_pages_order_session;
DROP INDEX IF EXISTS uq_kit_order_session;

CREATE INDEX IF NOT EXISTS idx_kit_order_session ON kit_order (stripe_session_id);
