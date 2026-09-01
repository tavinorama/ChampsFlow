-- Rollback 5.F.1's durable memory store. Dropping the table returns the
-- feature to its fail-soft OFF state: the worker's activeMemoryLessons reads
-- null (no [__memory__] injected), storeMemoryLessons reports the missing
-- table, and the monthly cron declares the feature OFF instead of starting
-- runs. Nothing else depends on this table.

DROP TABLE IF EXISTS ops.memory_lesson;
