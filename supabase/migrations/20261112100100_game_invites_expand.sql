-- INV-TOKEN, step (a) EXPAND: move invite tokens out of public.games.
--
-- public.games is readable by everyone ("Games are viewable by everyone",
-- USING (true)), and it carried invite_token / invite_expires_at. Anyone with
-- the public API key could therefore list the invite tokens of every waiting
-- private game and join them.
--
-- This migration only ADDS things, so the code that is live today keeps
-- working. Deploy order:
--   (a) apply this file
--   (-) deploy the server + frontend that read/write public.game_invites
--   (b) apply 20261112100300_game_invites_contract.sql (drops the old columns)

CREATE TABLE IF NOT EXISTS public.game_invites (
  game_id    uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS on with NO policies: the API roles can see and change nothing. Only the
-- service role (which bypasses RLS) uses this table.
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.game_invites TO service_role;

-- Backfill every invite that exists today.
INSERT INTO public.game_invites (game_id, token, expires_at)
SELECT id, invite_token, invite_expires_at
FROM public.games
WHERE invite_token IS NOT NULL
ON CONFLICT (game_id) DO NOTHING;

-- Until step (b), the code that is still deployed keeps writing
-- games.invite_token. Mirror those writes so an invite created between (a) and
-- the new deploy is not lost. The trigger and function are dropped in step (b).
CREATE OR REPLACE FUNCTION public.sync_game_invite_from_games()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.invite_token IS NOT NULL THEN
    INSERT INTO public.game_invites (game_id, token, expires_at)
    VALUES (NEW.id, NEW.invite_token, NEW.invite_expires_at)
    ON CONFLICT (game_id) DO UPDATE
      SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_game_invite_from_games() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS games_sync_invite ON public.games;
CREATE TRIGGER games_sync_invite
  AFTER INSERT OR UPDATE OF invite_token, invite_expires_at ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_game_invite_from_games();
