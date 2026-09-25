-- C09 / P08 (25/09/2026): a brand may say WHICH market its customers search
-- from. Until now the Google AI Overview probe asked in English from the
-- tenant's region (EU → UK, US → US) for every brand. Both columns are
-- nullable and unused until set: no data changes, no default guessed.
--   market: ISO 3166-1 alpha-2 (US, GB, BR, PT, DE, ...) — see serp-market.ts
--   locale: BCP-47 language[-country] (pt-BR, en-US) — language wins over the
--           country's default language.
-- Founder applies (production migration). The worker tolerates the columns
-- being absent (logs brand_market_unavailable_migration_pending).
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS market TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT;
