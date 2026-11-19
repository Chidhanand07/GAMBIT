-- SETTINGS-PREFS (ADR F-140; SEC-03, SEC-08): one row of preferences per user.
--
-- design/Settings.dc.html shows play preferences ("Board & pieces", "Gameplay"),
-- "Notifications", "Privacy" and the "Email me on new sign-ins" switch. Until now the
-- play preferences lived only in the browser (localStorage) and the rest had nowhere to
-- live at all. This table holds all of them, one row per user, created the first time
-- the user saves (no row = the defaults below).
--
-- Who reads and writes it:
--   * the user, through the web app's route handlers on their OWN session client
--     (role `authenticated`): RLS limits them to their row, column grants to the
--     preference columns (never user_id on UPDATE, never created_at/updated_at);
--   * the game server and the web app's privacy filters, with the secret key
--     (`service_role`): SELECT only. They enforce "who can challenge me", "allow
--     spectators" and the notification switches; they never write preferences;
--   * account deletion (public.delete_account, a later migration) removes the row.
--
-- `play` is the board/gameplay object the web app already parses defensively
-- (features/settings/model.ts parseSettings): unknown keys are dropped and bad
-- values replaced by defaults on every read, so only its type and size are checked
-- here. The columns the servers enforce are typed and constrained.
--
-- Rollout: additive. Apply before deploying the web app and game server that read it
-- (both treat a missing row as the defaults, and fail closed when the read errors).
-- Rollback: DROP VIEW public.leaderboard_profiles; DROP TABLE public.user_preferences;
--           DROP FUNCTION public.user_preferences_touch();

-- 1. Table -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id                uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  play                   jsonb   NOT NULL DEFAULT '{}'::jsonb,
  notify_challenges      boolean NOT NULL DEFAULT true,
  notify_friend_requests boolean NOT NULL DEFAULT true,
  notify_game_results    boolean NOT NULL DEFAULT true,
  notify_your_turn       boolean NOT NULL DEFAULT true,
  notify_email_digest    boolean NOT NULL DEFAULT false,
  notify_browser         boolean NOT NULL DEFAULT false,
  show_online            boolean NOT NULL DEFAULT true,
  challenge_policy       text    NOT NULL DEFAULT 'everyone',
  appear_in_search       boolean NOT NULL DEFAULT true,
  show_on_leaderboard    boolean NOT NULL DEFAULT true,
  allow_spectators       boolean NOT NULL DEFAULT true,
  email_on_new_sign_in   boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_play_is_object CHECK (jsonb_typeof(play) = 'object'),
  -- The real object is ~300 bytes; the bound only stops the row being used as storage.
  CONSTRAINT user_preferences_play_size CHECK (octet_length(play::text) <= 4096),
  CONSTRAINT user_preferences_challenge_policy CHECK (challenge_policy IN ('everyone', 'friends', 'nobody'))
);

COMMENT ON TABLE public.user_preferences IS
  'SETTINGS-PREFS (F-140): play, notification, privacy and sign-in preferences; one row per user, no row = defaults.';

-- The privacy filters look up the (few) users who opted out.
CREATE INDEX IF NOT EXISTS idx_user_preferences_hidden_from_leaderboard
  ON public.user_preferences (user_id) WHERE NOT show_on_leaderboard;

-- 2. updated_at --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_preferences_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_preferences_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_preferences_touch ON public.user_preferences;
CREATE TRIGGER user_preferences_touch
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.user_preferences_touch();

-- 3. Privileges (least privilege) -------------------------------------------------
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_preferences FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.user_preferences TO authenticated;
GRANT INSERT (
  user_id, play,
  notify_challenges, notify_friend_requests, notify_game_results, notify_your_turn,
  notify_email_digest, notify_browser,
  show_online, challenge_policy, appear_in_search, show_on_leaderboard, allow_spectators,
  email_on_new_sign_in
) ON TABLE public.user_preferences TO authenticated;
GRANT UPDATE (
  play,
  notify_challenges, notify_friend_requests, notify_game_results, notify_your_turn,
  notify_email_digest, notify_browser,
  show_online, challenge_policy, appear_in_search, show_on_leaderboard, allow_spectators,
  email_on_new_sign_in
) ON TABLE public.user_preferences TO authenticated;

-- The servers only read preferences to enforce them.
GRANT SELECT ON TABLE public.user_preferences TO service_role;

-- 4. Policies: owner only; no DELETE policy (account deletion is a definer function).
DROP POLICY IF EXISTS user_preferences_select_own ON public.user_preferences;
CREATE POLICY user_preferences_select_own ON public.user_preferences
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
CREATE POLICY user_preferences_insert_own ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
CREATE POLICY user_preferences_update_own ON public.user_preferences
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 5. Leaderboard without the players who opted out ("Show on leaderboard") -------------
-- security_invoker: the caller's own privileges and RLS apply. Only the web app's
-- service-role client reads it (GET /api/leaderboard), so only service_role may.
CREATE OR REPLACE VIEW public.leaderboard_profiles
WITH (security_invoker = true) AS
SELECT p.id, p.username, p.display_name, p.avatar_url,
       p.rating_bullet, p.rating_blitz, p.rating_rapid, p.rating_classical,
       p.games_played, p.wins, p.losses, p.draws, p.created_at
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_preferences up
  WHERE up.user_id = p.id AND NOT up.show_on_leaderboard
);

COMMENT ON VIEW public.leaderboard_profiles IS
  'SETTINGS-PREFS (F-140): profiles that appear on the public leaderboard (no "Show on leaderboard" opt-out).';

REVOKE ALL ON TABLE public.leaderboard_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard_profiles TO service_role;
