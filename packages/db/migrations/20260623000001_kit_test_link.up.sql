-- =============================================================================
-- Migration: 20260623000001_kit_test_link
-- Capability: connect the $29 Get-Cited Kit to the free AI Invisibility Test.
--
-- The Kit is the paid continuation of the free test (the funnel is
-- Test → Kit → Plans). When a buyer arrives from the free test we now carry the
-- originating lead_capture row id so the Kit's Part 1 ("your complete AI
-- Visibility Audit") can be framed as the deepened version of the teaser they
-- already saw, instead of an unrelated fresh run.
--
-- ON DELETE SET NULL: a lead_capture row can be erased (DSR/LGPD) independently;
-- the paid kit_order and its stored deliverable must survive, just unlinked.
-- The new column inherits kit_order's existing app_user grants (SELECT/INSERT/
-- UPDATE) — no new grant needed.
-- =============================================================================

ALTER TABLE kit_order
  ADD COLUMN IF NOT EXISTS lead_capture_id UUID
    REFERENCES lead_capture (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kit_order_lead_capture ON kit_order (lead_capture_id);
