-- =============================================================================
-- Rollback: 20260627000007_pending_subscription
-- Reverts the checkout-first pending_subscription table.
--
-- WARNING: All pending subscription rows — including unclaimed subscriptions
-- and claimed audit records — will be permanently deleted.
-- Only run in development or staging unless you have confirmed that no live
-- Stripe subscriptions are awaiting account creation (i.e., no unclaimed rows
-- exist) and that you have a separate audit record elsewhere.
--
-- The trigger function is dropped after the table (it has no dependents once
-- the table is gone).
-- =============================================================================

-- Drop the trigger function (no CASCADE needed; table drop removes the trigger).
DROP FUNCTION IF EXISTS trg_pending_subscription_updated_at();

-- Drop the table (indexes and policies are dropped automatically).
DROP TABLE IF EXISTS pending_subscription;
