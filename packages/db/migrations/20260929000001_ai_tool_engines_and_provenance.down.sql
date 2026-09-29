-- Reverse 20260929000001. Drops the columns; leaves the rows and their prices
-- (restoring August's estimates would re-introduce known-wrong numbers).
DROP INDEX IF EXISTS idx_ai_tool_engines;
ALTER TABLE ai_tool
  DROP COLUMN IF EXISTS price_note,
  DROP COLUMN IF EXISTS price_checked_at,
  DROP COLUMN IF EXISTS is_generic,
  DROP COLUMN IF EXISTS engines;
