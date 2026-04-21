-- H1 fix: rename clock columns to match server writes (white_time_ms / black_time_ms → keep as white_clock_ms / black_clock_ms)
-- Server has been updated to write white_clock_ms / black_clock_ms matching this schema.
-- No rename needed — existing columns are already correct. This migration is a no-op marker.
-- If migrating a DB that somehow has white_time_ms / black_time_ms columns, run:
-- ALTER TABLE public.games RENAME COLUMN white_time_ms TO white_clock_ms;
-- ALTER TABLE public.games RENAME COLUMN black_time_ms TO black_clock_ms;
SELECT 1; -- no-op
