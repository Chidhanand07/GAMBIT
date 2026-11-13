-- RATING-ATOMIC (SEC-04, SEC-06, NODE-18): rate a finished game once, atomically.
--
-- Before: the game server read both profiles, computed Glicko-2 in Node and
-- wrote each profile with its own UPDATE through the secret key. Two games of
-- the same player finishing at the same time both read the same old values,
-- and the second write overwrote the first (lost update: one game's rating
-- change and one games_played increment vanished). Nothing recorded that a
-- game had been rated, so a retried call rated it twice.
--
-- After: the server still computes Glicko-2 in Node (one implementation,
-- server/src/domain/rating/glicko.js), then calls public.apply_game_result,
-- which in ONE transaction:
--   1. locks the games row and refuses a game that is not 'completed', whose
--      players or result differ from the call, or (for a rating) that is not
--      rated; returns 'already_applied' if games.rated_at is set;
--   2. locks both profiles in id order (no deadlock between two games);
--   3. for a rated game, compares the stored rating / RD / volatility /
--      games_played with the values the server computed from and returns
--      'stale' (writing nothing) if any changed: the server re-reads and
--      recomputes, a bounded number of times;
--   4. increments games_played / wins / losses / draws (rated and unrated),
--      writes the new rating, RD and volatility (rated only), sets
--      games.rated_at, and returns 'applied'.
--
-- Deploy order: apply this file BEFORE deploying the server that calls the
-- function. It only adds things, so the server that is live today keeps
-- working (it still writes profiles directly with the secret key).

-- 1. games.rated_at --------------------------------------------------------
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS rated_at timestamptz;

COMMENT ON COLUMN public.games.rated_at IS
  'When the result of this game was applied to both profiles (statistics, and the rating if rated). '
  'Set only by public.apply_game_result; non-null means a second call is a no-op.';

-- Every game finished before this migration was already applied to the
-- profiles by the old code path: mark it, so nothing can apply it again.
UPDATE public.games
SET rated_at = coalesce(ended_at, now())
WHERE status = 'completed' AND rated_at IS NULL;

-- 2. The function ------------------------------------------------------------
-- p_white / p_black (rated games only):
--   { "old_rating", "old_rd", "old_vol", "old_games_played",   -- as read, null allowed
--     "new_rating", "new_rd", "new_vol" }                      -- required
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

  -- 4. Statistics always; rating, RD and volatility only for a rated game.
  UPDATE public.profiles p
  SET games_played = coalesce(p.games_played, 0) + 1,
      wins   = coalesce(p.wins, 0)   + CASE WHEN p_result = v.color THEN 1 ELSE 0 END,
      losses = coalesce(p.losses, 0) + CASE WHEN p_result NOT IN (v.color, 'draw') THEN 1 ELSE 0 END,
      draws  = coalesce(p.draws, 0)  + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      rating_bullet    = CASE WHEN p_rating_field = 'rating_bullet'    THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_bullet END,
      rating_blitz     = CASE WHEN p_rating_field = 'rating_blitz'     THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_blitz END,
      rating_rapid     = CASE WHEN p_rating_field = 'rating_rapid'     THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_rapid END,
      rating_classical = CASE WHEN p_rating_field = 'rating_classical' THEN (v.vals ->> 'new_rating')::numeric ELSE p.rating_classical END,
      rating_rd  = CASE WHEN v_rated THEN (v.vals ->> 'new_rd')::double precision  ELSE p.rating_rd END,
      rating_vol = CASE WHEN v_rated THEN (v.vals ->> 'new_vol')::double precision ELSE p.rating_vol END
  FROM (VALUES (p_white_id, 'white', p_white), (p_black_id, 'black', p_black)) AS v (id, color, vals)
  WHERE p.id = v.id;

  UPDATE public.games g SET rated_at = now() WHERE g.id = p_game_id;
  RETURN 'applied';
END;
$$;

COMMENT ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb) IS
  'RATING-ATOMIC: apply a completed game to both profiles once (stats; rating if p_rating_field is set). '
  'Returns applied | already_applied | stale. Service role only.';

-- 3. Only the game server (service role) may call it (SEC-04, SEC-06). Supabase's
-- default privileges grant EXECUTE on new public functions to anon and
-- authenticated, so revoke explicitly.
REVOKE ALL ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;
