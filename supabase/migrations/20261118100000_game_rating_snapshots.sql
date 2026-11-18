-- B1 item 1 (F-120; SEC-04, NODE-16, NX-07): every rated game keeps both players' ratings
-- before and after it, written by the server only.
--
-- Before: a game row did not record what it did to the ratings. The profile page could show
-- the current rating only: no rating history, no rating change per game, no "best win".
--
-- After:
--   * games.rating_category ('bullet' | 'blitz' | 'rapid' | 'classical') and
--     games.{white,black}_rating_{before,after} (numeric(7,2), like the profile columns).
--   * public.apply_game_result (still security definer, compare-and-set, idempotent through
--     rated_at) fills them in the same transaction that writes the profiles. Unrated games
--     leave them null.
--   * Nobody else can write them: the API roles lose INSERT/UPDATE on games altogether (they
--     never had a policy that allowed a write), and service_role keeps INSERT/UPDATE on every
--     other column but not on these, nor on rated_at. The function runs as its owner, so the
--     REVOKE does not affect it.
--
-- Old games: the values were never recorded and cannot be recomputed (Glicko-2 depends on the
-- RD and volatility each player had at that moment), so they stay NULL. The UI says that
-- rating history starts with the first game rated after this migration.
--
-- Deploy order: apply this migration, then deploy the web app that reads the columns. The game
-- server needs no change (it calls the same function with the same arguments). A service-role
-- write that names one of the protected columns now fails with 42501; nothing does that today.
--
-- Rollback:
--   GRANT INSERT, UPDATE ON TABLE public.games TO service_role;
--   (and re-create apply_game_result from 20261113100000_rating_atomic.sql; the columns can stay)

-- 1. Columns ---------------------------------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS rating_category     text,
  ADD COLUMN IF NOT EXISTS white_rating_before numeric(7,2),
  ADD COLUMN IF NOT EXISTS white_rating_after  numeric(7,2),
  ADD COLUMN IF NOT EXISTS black_rating_before numeric(7,2),
  ADD COLUMN IF NOT EXISTS black_rating_after  numeric(7,2);

ALTER TABLE public.games
  ADD CONSTRAINT games_rating_category_check
  CHECK (rating_category IS NULL OR rating_category IN ('bullet', 'blitz', 'rapid', 'classical'));

COMMENT ON COLUMN public.games.rating_category IS
  'F-120: the rating pool a rated game was applied to. Set only by public.apply_game_result.';
COMMENT ON COLUMN public.games.white_rating_before IS
  'F-120: White''s rating in rating_category before this game. Set only by public.apply_game_result; NULL for unrated games and games rated before F-120.';
COMMENT ON COLUMN public.games.white_rating_after IS
  'F-120: White''s rating in rating_category after this game. Set only by public.apply_game_result.';
COMMENT ON COLUMN public.games.black_rating_before IS
  'F-120: Black''s rating in rating_category before this game. Set only by public.apply_game_result.';
COMMENT ON COLUMN public.games.black_rating_after IS
  'F-120: Black''s rating in rating_category after this game. Set only by public.apply_game_result.';

-- A player's rated games in one pool, oldest first (the rating history chart).
CREATE INDEX IF NOT EXISTS idx_games_white_rated ON public.games (white_id, rating_category, ended_at)
  WHERE rating_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_black_rated ON public.games (black_id, rating_category, ended_at)
  WHERE rating_category IS NOT NULL;

-- 2. Privileges ------------------------------------------------------------------------------
-- The browser roles never write games (no INSERT/UPDATE policy exists); take the privilege too.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.games FROM anon, authenticated;

-- service_role (game server, web app server, engine): INSERT/UPDATE on every column except the
-- ones only apply_game_result may write. A table-level grant would cover every column, so the
-- table-level privileges go and column-level ones come back for the rest.
REVOKE INSERT, UPDATE ON TABLE public.games FROM service_role;
DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.games'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname NOT IN ('rated_at', 'rating_category', 'white_rating_before', 'white_rating_after',
                          'black_rating_before', 'black_rating_after');
  EXECUTE format('GRANT INSERT (%1$s), UPDATE (%1$s) ON TABLE public.games TO service_role', v_columns);
END;
$$;

-- 3. The function (same signature, arguments and return values) --------------------------
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
  'RATING-ATOMIC + F-120: apply a completed game to both profiles once (stats; rating if p_rating_field is set) '
  'and record the rating category and both ratings before/after on the game. '
  'Returns applied | already_applied | stale. Service role only.';

REVOKE ALL ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;
