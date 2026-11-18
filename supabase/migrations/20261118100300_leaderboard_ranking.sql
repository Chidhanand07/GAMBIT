-- B1 item 6 (F-125; SEC-04, NODE-10): a real "All" leaderboard and a rank for every player.
--
-- Before: the "All" tab ranked by the rapid rating, and a player outside the top 50 had no rank.
--
-- After:
--   1. profiles.rated_games_{bullet,blitz,rapid,classical}: rated games per pool, incremented by
--      public.apply_game_result in the transaction that rates the game (it is the only writer:
--      the browser roles have no UPDATE on these columns, service_role has no UPDATE on profiles
--      at all since F-086). Backfilled from the finished, applied, rated games, with the pool
--      read from games.time_control exactly like server/src/domain/timeControl.js does
--      ("M" or "M+S", minutes 1..1440, increment 0..180, anything else is the 10-minute default;
--      bullet <= 2, blitz <= 5, rapid <= 29 minutes, classical above).
--   2. profiles.rating_all, a stored generated column: the highest rating among the pools in which
--      the player has at least one rated game (RULE, ADR F-125). NULL until the first rated game,
--      so untouched 1200 defaults never count and new players are not ranked on "All".
--   3. Indexes (rating, username) for every board: the list is ordered by rating desc, username
--      asc, and a rank is two range counts on the same index.
--   4. public.leaderboard_rank(profile, board): 1 + the players ahead on that board (higher rating,
--      or the same rating and an earlier username: the list's order). NULL when the player has no
--      rating on the board. STABLE, security invoker; service_role only (the web app's server).
--
-- Deploy order: this migration, then the web app. The game server is unchanged (same function
-- signature). Rollback: drop the function, the indexes and the columns (rating_all first), and
-- re-create apply_game_result from 20261118100000_game_rating_snapshots.sql.

-- 1. Rated games per pool ----------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rated_games_bullet    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rated_games_blitz     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rated_games_rapid     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rated_games_classical integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_rated_games_nonnegative CHECK (
    rated_games_bullet >= 0 AND rated_games_blitz >= 0 AND rated_games_rapid >= 0 AND rated_games_classical >= 0
  );

WITH rated AS (
  SELECT g.white_id AS player_id, g.time_control
  FROM public.games g
  WHERE g.status = 'completed' AND g.is_rated IS TRUE AND g.rated_at IS NOT NULL
    AND g.result IN ('white', 'black', 'draw') AND g.white_id IS NOT NULL
  UNION ALL
  SELECT g.black_id, g.time_control
  FROM public.games g
  WHERE g.status = 'completed' AND g.is_rated IS TRUE AND g.rated_at IS NOT NULL
    AND g.result IN ('white', 'black', 'draw') AND g.black_id IS NOT NULL
),
parsed AS (
  SELECT r.player_id, regexp_match(r.time_control, '^(\d{1,4})(?:\+(\d{1,3}))?$') AS parts
  FROM rated r
),
minutes AS (
  SELECT p.player_id,
         CASE WHEN p.parts IS NOT NULL
                   AND p.parts[1]::integer BETWEEN 1 AND 1440
                   AND coalesce(p.parts[2]::integer, 0) <= 180
              THEN p.parts[1]::integer ELSE 10 END AS m
  FROM parsed p
),
counts AS (
  SELECT m.player_id,
         count(*) FILTER (WHERE m.m <= 2)                AS bullet,
         count(*) FILTER (WHERE m.m > 2 AND m.m <= 5)    AS blitz,
         count(*) FILTER (WHERE m.m > 5 AND m.m <= 29)   AS rapid,
         count(*) FILTER (WHERE m.m > 29)                AS classical
  FROM minutes m
  GROUP BY m.player_id
)
UPDATE public.profiles p
SET rated_games_bullet = c.bullet, rated_games_blitz = c.blitz,
    rated_games_rapid = c.rapid, rated_games_classical = c.classical
FROM counts c
WHERE p.id = c.player_id;

-- 2. The "All" rating ----------------------------------------------------------------------------
-- greatest() ignores NULLs: a pool counts only once the player has a rated game in it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating_all numeric(7,2) GENERATED ALWAYS AS (
    greatest(
      CASE WHEN rated_games_bullet    >= 1 THEN rating_bullet    END,
      CASE WHEN rated_games_blitz     >= 1 THEN rating_blitz     END,
      CASE WHEN rated_games_rapid     >= 1 THEN rating_rapid     END,
      CASE WHEN rated_games_classical >= 1 THEN rating_classical END
    )
  ) STORED;

COMMENT ON COLUMN public.profiles.rating_all IS
  'F-125: the "All" leaderboard rating: the highest rating among the pools with at least one rated game; NULL before the first rated game.';

-- 3. Indexes: the list order (rating desc, username asc) and the rank counts ----------------------
CREATE INDEX IF NOT EXISTS idx_profiles_board_bullet    ON public.profiles (rating_bullet, username);
CREATE INDEX IF NOT EXISTS idx_profiles_board_blitz     ON public.profiles (rating_blitz, username);
CREATE INDEX IF NOT EXISTS idx_profiles_board_rapid     ON public.profiles (rating_rapid, username);
CREATE INDEX IF NOT EXISTS idx_profiles_board_classical ON public.profiles (rating_classical, username);
CREATE INDEX IF NOT EXISTS idx_profiles_board_all       ON public.profiles (rating_all, username)
  WHERE rating_all IS NOT NULL;

-- 4. The rank of one player on one board ---------------------------------------------------------
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

  EXECUTE format('SELECT p.%I, p.username FROM public.profiles p WHERE p.id = $1', v_column)
    INTO v_rating, v_username
    USING p_profile_id;
  IF v_rating IS NULL THEN
    RETURN NULL;
  END IF;

  -- Two range counts on (rating, username): strictly higher, then equal with an earlier username.
  EXECUTE format(
    'SELECT (SELECT count(*) FROM public.profiles p WHERE p.%1$I > $1)
          + (SELECT count(*) FROM public.profiles p WHERE p.%1$I = $1 AND p.username < $2)',
    v_column)
    INTO v_ahead
    USING v_rating, v_username;
  RETURN v_ahead + 1;
END;
$$;

COMMENT ON FUNCTION public.leaderboard_rank(uuid, text) IS
  'F-125: 1 + players ahead of p_profile_id on a board (all | bullet | blitz | rapid | classical), ordered by rating desc then username; NULL without a rating there.';

REVOKE ALL ON FUNCTION public.leaderboard_rank(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_rank(uuid, text) TO service_role;

-- 5. apply_game_result also counts the rated game in its pool (same signature) -------------------
CREATE OR REPLACE FUNCTION public.apply_game_result(
  p_game_id      uuid,
  p_white_id     uuid,
  p_black_id     uuid,
  p_result       text,
  p_rating_field text  DEFAULT NULL,
  p_white        jsonb DEFAULT NULL,
  p_black        jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game  record;
  v_white record;
  v_black record;
  v_rated boolean := p_rating_field IS NOT NULL;
BEGIN
  -- Arguments ---------------------------------------------------------------
  IF p_game_id IS NULL OR p_white_id IS NULL OR p_black_id IS NULL THEN
    RAISE EXCEPTION 'apply_game_result: game id and player ids are required' USING ERRCODE = '22023';
  END IF;
  IF p_white_id = p_black_id THEN
    RAISE EXCEPTION 'apply_game_result: a player cannot play themselves' USING ERRCODE = '22023';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('white', 'black', 'draw') THEN
    RAISE EXCEPTION 'apply_game_result: result must be white, black or draw' USING ERRCODE = '22023';
  END IF;
  IF v_rated THEN
    IF p_rating_field NOT IN ('rating_bullet', 'rating_blitz', 'rating_rapid', 'rating_classical') THEN
      RAISE EXCEPTION 'apply_game_result: unknown rating field %', p_rating_field USING ERRCODE = '22023';
    END IF;
    IF p_white IS NULL OR p_black IS NULL
       OR p_white ->> 'new_rating' IS NULL OR p_white ->> 'new_rd' IS NULL OR p_white ->> 'new_vol' IS NULL
       OR p_black ->> 'new_rating' IS NULL OR p_black ->> 'new_rd' IS NULL OR p_black ->> 'new_vol' IS NULL THEN
      RAISE EXCEPTION 'apply_game_result: a rated game needs new rating, rd and vol for both players'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 1. The game, locked: a second call for the same game waits here, then sees rated_at.
  SELECT g.status, g.result, g.white_id, g.black_id, g.is_rated, g.rated_at
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_game_result: game % not found', p_game_id USING ERRCODE = 'P0002';
  END IF;
  -- An aborted game was never played; an active one is not over.
  IF v_game.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'apply_game_result: game % is %, not completed', p_game_id, v_game.status
      USING ERRCODE = '55000';
  END IF;
  IF v_game.white_id IS DISTINCT FROM p_white_id OR v_game.black_id IS DISTINCT FROM p_black_id THEN
    RAISE EXCEPTION 'apply_game_result: players do not match game %', p_game_id USING ERRCODE = '22023';
  END IF;
  IF v_game.result IS DISTINCT FROM p_result THEN
    RAISE EXCEPTION 'apply_game_result: result does not match game %', p_game_id USING ERRCODE = '22023';
  END IF;
  IF v_rated AND v_game.is_rated IS NOT TRUE THEN
    RAISE EXCEPTION 'apply_game_result: game % is not rated', p_game_id USING ERRCODE = '22023';
  END IF;
  IF v_game.rated_at IS NOT NULL THEN
    RETURN 'already_applied';
  END IF;

  -- 2. Both profiles, locked in id order so two games never wait on each other in a cycle.
  PERFORM 1 FROM public.profiles p WHERE p.id = least(p_white_id, p_black_id) FOR UPDATE;
  PERFORM 1 FROM public.profiles p WHERE p.id = greatest(p_white_id, p_black_id) FOR UPDATE;

  SELECT p.games_played, p.rating_rd, p.rating_vol,
         CASE p_rating_field
           WHEN 'rating_bullet'    THEN p.rating_bullet
           WHEN 'rating_blitz'     THEN p.rating_blitz
           WHEN 'rating_rapid'     THEN p.rating_rapid
           WHEN 'rating_classical' THEN p.rating_classical
         END AS rating
  INTO v_white
  FROM public.profiles p
  WHERE p.id = p_white_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_game_result: profile % not found', p_white_id USING ERRCODE = 'P0002';
  END IF;

  SELECT p.games_played, p.rating_rd, p.rating_vol,
         CASE p_rating_field
           WHEN 'rating_bullet'    THEN p.rating_bullet
           WHEN 'rating_blitz'     THEN p.rating_blitz
           WHEN 'rating_rapid'     THEN p.rating_rapid
           WHEN 'rating_classical' THEN p.rating_classical
         END AS rating
  INTO v_black
  FROM public.profiles p
  WHERE p.id = p_black_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_game_result: profile % not found', p_black_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Compare-and-set: the new ratings are valid only for the values they were computed from.
  IF v_rated AND (
       v_white.rating       IS DISTINCT FROM (p_white ->> 'old_rating')::numeric
    OR v_white.rating_rd    IS DISTINCT FROM (p_white ->> 'old_rd')::double precision
    OR v_white.rating_vol   IS DISTINCT FROM (p_white ->> 'old_vol')::double precision
    OR v_white.games_played IS DISTINCT FROM (p_white ->> 'old_games_played')::integer
    OR v_black.rating       IS DISTINCT FROM (p_black ->> 'old_rating')::numeric
    OR v_black.rating_rd    IS DISTINCT FROM (p_black ->> 'old_rd')::double precision
    OR v_black.rating_vol   IS DISTINCT FROM (p_black ->> 'old_vol')::double precision
    OR v_black.games_played IS DISTINCT FROM (p_black ->> 'old_games_played')::integer
  ) THEN
    RETURN 'stale';
  END IF;

  -- 4. Statistics always; rating, RD, volatility and the pool's rated-game counter (F-125) only
  --    for a rated game.
  UPDATE public.profiles p
  SET games_played = coalesce(p.games_played, 0) + 1,
      wins   = coalesce(p.wins, 0)   + CASE WHEN p_result = v.color THEN 1 ELSE 0 END,
      losses = coalesce(p.losses, 0) + CASE WHEN p_result NOT IN (v.color, 'draw') THEN 1 ELSE 0 END,
      draws  = coalesce(p.draws, 0)  + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      rating_bullet    = CASE WHEN p_rating_field = 'rating_bullet'    THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_bullet END,
      rating_blitz     = CASE WHEN p_rating_field = 'rating_blitz'     THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_blitz END,
      rating_rapid     = CASE WHEN p_rating_field = 'rating_rapid'     THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_rapid END,
      rating_classical = CASE WHEN p_rating_field = 'rating_classical' THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_classical END,
      rated_games_bullet    = p.rated_games_bullet    + CASE WHEN p_rating_field = 'rating_bullet'    THEN 1 ELSE 0 END,
      rated_games_blitz     = p.rated_games_blitz     + CASE WHEN p_rating_field = 'rating_blitz'     THEN 1 ELSE 0 END,
      rated_games_rapid     = p.rated_games_rapid     + CASE WHEN p_rating_field = 'rating_rapid'     THEN 1 ELSE 0 END,
      rated_games_classical = p.rated_games_classical + CASE WHEN p_rating_field = 'rating_classical' THEN 1 ELSE 0 END,
      rating_rd  = CASE WHEN v_rated THEN (v.vals ->> 'new_rd')::double precision  ELSE p.rating_rd END,
      rating_vol = CASE WHEN v_rated THEN (v.vals ->> 'new_vol')::double precision ELSE p.rating_vol END
  FROM (VALUES (p_white_id, 'white', p_white), (p_black_id, 'black', p_black)) AS v (id, color, vals)
  WHERE p.id = v.id;

  -- 5. The game: applied, and (rated only) the rating category and both players' ratings
  -- before and after it. The "before" values are the stored ones the compare-and-set just
  -- checked, the "after" values the ones written to the profiles above.
  UPDATE public.games g
  SET rated_at            = now(),
      rating_category     = CASE WHEN v_rated THEN substr(p_rating_field, length('rating_') + 1) END,
      white_rating_before = CASE WHEN v_rated THEN v_white.rating END,
      white_rating_after  = CASE WHEN v_rated THEN (p_white ->> 'new_rating')::numeric END,
      black_rating_before = CASE WHEN v_rated THEN v_black.rating END,
      black_rating_after  = CASE WHEN v_rated THEN (p_black ->> 'new_rating')::numeric END
  WHERE g.id = p_game_id;
  RETURN 'applied';
END;
$$;

COMMENT ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb) IS
  'RATING-ATOMIC + F-120 + F-125: apply a completed game to both profiles once (stats; rating and the '
  'pool''s rated-game counter if p_rating_field is set) and record the rating snapshot on the game. '
  'Returns applied | already_applied | stale. Service role only.';

REVOKE ALL ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;
