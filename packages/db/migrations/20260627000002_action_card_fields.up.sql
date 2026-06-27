-- Migration: 20260627000002_action_card_fields
-- Adds three context columns to plan_task to turn generic recommendations into
-- actionable "cards" the client can immediately act on:
--   evidence — the specific audit finding that triggered this card
--   metric    — the KPI to watch to confirm the action worked
--   owner     — who is responsible: 'you' | 'organicposts' | 'platform'
--
-- All columns are nullable / have defaults so existing rows are untouched.
-- RLS, GRANTs, and indexes are already in place from 20260531000004_strategy_plan.

ALTER TABLE plan_task
  ADD COLUMN IF NOT EXISTS evidence TEXT,
  ADD COLUMN IF NOT EXISTS metric   TEXT,
  ADD COLUMN IF NOT EXISTS owner    TEXT NOT NULL DEFAULT 'you'
    CHECK (owner IN ('you', 'organicposts', 'platform'));
