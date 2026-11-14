-- S11 (SEC-03, SEC-04): users could rewrite their own rating and statistics.
--
-- RLS decides WHICH ROWS a role may touch, not which columns. The old
-- "profiles_update" policy (USING auth.uid() = id) therefore let a signed-in
-- user UPDATE every column of their own row through the public API key:
-- rating_rapid, wins, games_played, ... The old "profiles_insert" policy was
-- WITH CHECK (true): anyone could insert a profile row for any id.
--
-- Fix, in two layers:
--   1. Column privileges: the API roles lose INSERT/UPDATE (and DELETE/TRUNCATE)
--      on the table; `authenticated` gets UPDATE back on the cosmetic columns
--      the app actually edits, and nothing else.
--   2. Policies: named roles, ownership predicates on both USING and WITH CHECK,
--      and `(select auth.uid())` so the planner evaluates it once per statement.
--
-- Ratings and statistics are written only by the game server with the secret
-- (service-role) key, which is unaffected. Every profile INSERT in the app goes
-- through the service role as well (signup, OAuth callback, /api/profile/me),
-- so `authenticated` gets no INSERT privilege at all.

-- 1. Privileges -------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Reading profiles stays as it was (leaderboard, search, opponent cards).
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

-- The only columns a user may change on their own row (PATCH /api/profile/me
-- edits exactly these). Not here on purpose: every rating_*, games_played,
-- wins, losses, draws, accuracy_*, peak_*, total_moves_analysed, username, id.
GRANT UPDATE (display_name, bio, country, avatar_url) ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

-- 2. Policies ---------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
