-- SCHEMA-CLEANUP (ADR F-070, SEC-08): drop the legacy clock columns
-- public.games.white_time_ms / black_time_ms.
--
-- Since M2 (F-028, CLOCK) the game server stores clocks only in white_clock_ms /
-- black_clock_ms, and the web app neither selects nor reads *_time_ms (G2, G22).
-- Nothing in server/, frontend/, chess-engine/, the SQL functions, policies or
-- views of this repository names them (pinned by scripts/legacy-clock-columns.test.js).
--
-- ROLLOUT: apply only after every game-server replica AND the web app run the M2
-- release or later. A pre-M2 game server still writes white_time_ms on a
-- disconnect, and that update would fail once the column is gone; a pre-M2 web app
-- selects it in the stale-game check.
--
-- Rollback (data is not restorable, the values were unused):
--   ALTER TABLE public.games ADD COLUMN white_time_ms INTEGER, ADD COLUMN black_time_ms INTEGER;

-- Guard: refuse to drop while a function, policy or view in schema public still
-- names a column. Views and policies would also block the DROP below (no CASCADE);
-- function bodies are not tracked as dependencies, so they are checked by text.
DO $$
DECLARE
  users text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name)
  INTO users
  FROM (
    SELECT format('function %I.%I', n.nspname, p.proname) AS name
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc ~ '(white|black)_time_ms'
    UNION ALL
    SELECT format('policy %I on %I.%I', policyname, schemaname, tablename)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ '(white|black)_time_ms' OR coalesce(with_check, '') ~ '(white|black)_time_ms')
    UNION ALL
    SELECT format('view %I.%I', schemaname, viewname)
    FROM pg_catalog.pg_views
    WHERE schemaname = 'public' AND definition ~ '(white|black)_time_ms'
  ) AS readers;

  IF users IS NOT NULL THEN
    RAISE EXCEPTION 'games.white_time_ms / black_time_ms are still used by: %', users
      USING HINT = 'Move those objects to white_clock_ms / black_clock_ms in a migration first.';
  END IF;
END;
$$;

ALTER TABLE public.games
  DROP COLUMN IF EXISTS white_time_ms,
  DROP COLUMN IF EXISTS black_time_ms;
