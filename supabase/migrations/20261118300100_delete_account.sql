-- DELETE-ACCOUNT (ADR F-145; SEC-03, SEC-04, SEC-08): remove a user's data in ONE transaction.
--
-- Called only by the web app's POST /api/account/delete with the secret key, after it has
-- re-authenticated the user (password, or a fresh sign-in, plus AAL2 when two-factor is on) and
-- the user typed their username. The auth user itself is deleted afterwards with the Auth admin
-- API (auth.users is Supabase Auth's table; the route bans the user first so nobody can sign in
-- while this runs, and stays banned if the admin call fails).
--
-- What happens to each table that references public.profiles:
--   games (white_id, black_id, winner_id; no ON DELETE action)
--       finished games are KEPT for the opponents' history: the deleted player's side becomes
--       NULL ("deleted player"); the result column still says who won. Games that never started
--       (status 'waiting', i.e. an open private invite) are deleted with their moves, chat and
--       invite (ON DELETE CASCADE). An ACTIVE game blocks the deletion (SQLSTATE 55000,
--       'active_game'): the user finishes or resigns it first, so no live game loses a player.
--   messages.user_id (no action)            the user's chat lines are deleted (their words).
--   friendships (ON DELETE CASCADE)         deleted (explicitly, so the count is reported).
--   notifications.user_id (CASCADE)         the user's own; plus other users' notifications
--                                           whose payload names the user (challenges, requests).
--   user_preferences.user_id (CASCADE)      deleted.
--   profiles                                deleted.
--
-- Rollout: additive (a new function). Apply before deploying the web app that calls it.
-- Rollback: DROP FUNCTION public.delete_account(uuid);

CREATE OR REPLACE FUNCTION public.delete_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_games_anonymised integer;
  v_games_deleted    integer;
  v_messages         integer;
  v_friendships      integer;
  v_notifications    integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_account: user id is required' USING ERRCODE = '22023';
  END IF;

  -- Lock the profile: a concurrent call for the same user waits, then finds nothing.
  PERFORM 1 FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_account: profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.status = 'active' AND (g.white_id = p_user_id OR g.black_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'active_game' USING ERRCODE = '55000',
      HINT = 'Finish or resign the active game, then delete the account.';
  END IF;

  DELETE FROM public.games g
  WHERE g.status = 'waiting' AND (g.white_id = p_user_id OR g.black_id = p_user_id);
  GET DIAGNOSTICS v_games_deleted = ROW_COUNT;

  DELETE FROM public.messages m WHERE m.user_id = p_user_id;
  GET DIAGNOSTICS v_messages = ROW_COUNT;

  UPDATE public.games g
  SET white_id  = CASE WHEN g.white_id  = p_user_id THEN NULL ELSE g.white_id END,
      black_id  = CASE WHEN g.black_id  = p_user_id THEN NULL ELSE g.black_id END,
      winner_id = CASE WHEN g.winner_id = p_user_id THEN NULL ELSE g.winner_id END
  WHERE g.white_id = p_user_id OR g.black_id = p_user_id OR g.winner_id = p_user_id;
  GET DIAGNOSTICS v_games_anonymised = ROW_COUNT;

  DELETE FROM public.friendships f WHERE f.requester_id = p_user_id OR f.addressee_id = p_user_id;
  GET DIAGNOSTICS v_friendships = ROW_COUNT;

  DELETE FROM public.notifications n
  WHERE n.user_id = p_user_id OR n.payload ->> 'from_user_id' = p_user_id::text;
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  DELETE FROM public.user_preferences up WHERE up.user_id = p_user_id;
  DELETE FROM public.profiles p WHERE p.id = p_user_id;

  RETURN jsonb_build_object(
    'games_anonymised', v_games_anonymised,
    'games_deleted', v_games_deleted,
    'messages_deleted', v_messages,
    'friendships_deleted', v_friendships,
    'notifications_deleted', v_notifications
  );
END;
$$;

COMMENT ON FUNCTION public.delete_account(uuid) IS
  'DELETE-ACCOUNT (F-145): anonymise the user''s finished games, delete their data and profile, atomically. '
  'Refuses while they play an active game (55000). Service role only; the auth user is deleted by the caller.';

-- Only the web app's secret key may call it (Supabase grants EXECUTE on new public functions to
-- anon and authenticated by default, so revoke explicitly).
REVOKE ALL ON FUNCTION public.delete_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account(uuid) TO service_role;
