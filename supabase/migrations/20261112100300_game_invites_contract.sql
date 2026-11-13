-- INV-TOKEN, step (b) CONTRACT: remove the invite columns from public.games.
--
-- APPLY ONLY AFTER the server and frontend that use public.game_invites are
-- deployed. The code that was live before reads games.invite_token and will
-- break once these columns are gone.

-- Catch any invite the mirror trigger did not see (belt and braces).
INSERT INTO public.game_invites (game_id, token, expires_at)
SELECT id, invite_token, invite_expires_at
FROM public.games
WHERE invite_token IS NOT NULL
ON CONFLICT (game_id) DO NOTHING;

DROP TRIGGER IF EXISTS games_sync_invite ON public.games;
DROP FUNCTION IF EXISTS public.sync_game_invite_from_games();

DROP INDEX IF EXISTS public.idx_games_invite_token;

ALTER TABLE public.games
  DROP COLUMN IF EXISTS invite_token,
  DROP COLUMN IF EXISTS invite_expires_at;
