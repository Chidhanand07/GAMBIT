-- MATCHMAKING-QUEUE (SEC-03): public.matchmaking_queue was created in the
-- initial schema, never had RLS enabled, and is not referenced by any code
-- (matchmaking lives in the game server's memory). With RLS off and the default
-- grants, the public API key could read and write it freely.
DROP TABLE IF EXISTS public.matchmaking_queue;

-- Guard: from here on, no table in the exposed schema may be without RLS.
-- If this raises, enable RLS on the listed tables (or drop them) and re-run.
DO $$
DECLARE
  unprotected text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
  INTO unprotected
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Row level security is not enabled on: %', unprotected
      USING HINT = 'ALTER TABLE <table> ENABLE ROW LEVEL SECURITY; then add policies or keep it service-role only.';
  END IF;
END;
$$;
