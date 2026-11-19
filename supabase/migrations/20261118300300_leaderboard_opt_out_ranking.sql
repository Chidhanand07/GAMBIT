-- STACK-d (ADR F-163; SEC-03, SEC-04, NODE-10): the leaderboard list, its count and the rank
-- function agree on who is on the leaderboard.
--
-- Before: B1 (F-125) ranked every profile with public.leaderboard_rank and read rating_all and
-- the per-pool rated-game counters from public.profiles; B3 (F-140) made the list read
-- public.leaderboard_profiles, a view without the players who turned "Show on leaderboard" off,
-- but the view had none of B1's columns and the rank function still counted the hidden players.
--
-- After:
--   1. public.leaderboard_profiles also exposes rating_all and rated_games_{bullet,blitz,rapid,
--      classical} (appended, so CREATE OR REPLACE keeps the existing columns and grants). The
--      filter is unchanged: no user_preferences row, or show_on_leaderboard = true.
--   2. public.leaderboard_rank counts only players in that view, and answers NULL for a player who
--      is not in it (opted out): their place is hidden from them and from everyone else. Same
--      signature, still STABLE, SECURITY INVOKER and service_role only; service_role already reads
--      the view and user_preferences.
--
-- Rollout: apply before the web app of this stack (it reads the new view columns). The game
-- server does not use either object.
-- Rollback: re-create the view from 20261118300000_user_preferences.sql (DROP VIEW first, since
-- columns cannot be removed by CREATE OR REPLACE, then re-grant) and leaderboard_rank from
-- 20261118100300_leaderboard_ranking.sql.

-- 1. The view: every column the leaderboard reads -------------------------------------------
CREATE OR REPLACE VIEW public.leaderboard_profiles
WITH (security_invoker = true) AS
SELECT p.id, p.username, p.display_name, p.avatar_url,
       p.rating_bullet, p.rating_blitz, p.rating_rapid, p.rating_classical,
       p.games_played, p.wins, p.losses, p.draws, p.created_at,
       p.rating_all,
       p.rated_games_bullet, p.rated_games_blitz, p.rated_games_rapid, p.rated_games_classical
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_preferences up
  WHERE up.user_id = p.id AND NOT up.show_on_leaderboard
);

COMMENT ON VIEW public.leaderboard_profiles IS
  'SETTINGS-PREFS (F-140) + F-163: profiles on the public leaderboard (no "Show on leaderboard" opt-out), '
  'with every column the leaderboard reads (ratings per pool and All, rated games per pool).';

REVOKE ALL ON TABLE public.leaderboard_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard_profiles TO service_role;

-- 2. The rank: only among the players on the leaderboard -------------------------------------
CREATE OR REPLACE FUNCTION public.leaderboard_rank(p_profile_id uuid, p_board text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_column   text;
  v_rating   numeric;
  v_username text;
  v_ahead    bigint;
BEGIN
  v_column := CASE p_board
    WHEN 'all'       THEN 'rating_all'
    WHEN 'bullet'    THEN 'rating_bullet'
    WHEN 'blitz'     THEN 'rating_blitz'
    WHEN 'rapid'     THEN 'rating_rapid'
    WHEN 'classical' THEN 'rating_classical'
  END;
  IF v_column IS NULL THEN
    RAISE EXCEPTION 'leaderboard_rank: unknown board %', p_board USING ERRCODE = '22023';
  END IF;

  -- Not in the view (opted out, or no such profile): no rank.
  EXECUTE format('SELECT p.%I, p.username FROM public.leaderboard_profiles p WHERE p.id = $1', v_column)
    INTO v_rating, v_username
    USING p_profile_id;
  IF v_rating IS NULL THEN
    RETURN NULL;
  END IF;

  -- The list's order: strictly higher, then equal with an earlier username; hidden players skipped.
  EXECUTE format(
    'SELECT (SELECT count(*) FROM public.leaderboard_profiles p WHERE p.%1$I > $1)
          + (SELECT count(*) FROM public.leaderboard_profiles p WHERE p.%1$I = $1 AND p.username < $2)',
    v_column)
    INTO v_ahead
    USING v_rating, v_username;
  RETURN v_ahead + 1;
END;
$$;

COMMENT ON FUNCTION public.leaderboard_rank(uuid, text) IS
  'F-125 + F-163: 1 + players on the leaderboard (public.leaderboard_profiles) ahead of p_profile_id on a board '
  '(all | bullet | blitz | rapid | classical), by rating desc then username; NULL without a rating there or when '
  'the player opted out of the leaderboard.';

REVOKE ALL ON FUNCTION public.leaderboard_rank(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_rank(uuid, text) TO service_role;
