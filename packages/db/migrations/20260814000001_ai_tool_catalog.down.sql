-- Reverse 20260814000001_ai_tool_catalog. Additive migration; dropping the
-- table is safe — the engine falls back to the in-code SEED_CATALOG, so the
-- product keeps working without this table.
DROP TABLE IF EXISTS ai_tool;
