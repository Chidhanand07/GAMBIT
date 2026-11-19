-- SETTINGS-PREFS (ADR F-146; SEC-03, SEC-08): the Gameplay switches the game server will enforce.
--
-- Settings.dc.html "Gameplay" shows "Premoves" and "Allow takeback requests" (both off by
-- default). The game-actions track builds those features; its server must read the player's
-- choice, so the choice is stored here as typed columns rather than inside the client-only
-- `play` object. Same privileges as the other preference columns: the owner inserts/updates
-- them through RLS, service_role only reads.
--
-- Rollout: additive. Rollback:
--   ALTER TABLE public.user_preferences DROP COLUMN premoves, DROP COLUMN allow_takebacks;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS premoves        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_takebacks boolean NOT NULL DEFAULT false;

GRANT INSERT (premoves, allow_takebacks), UPDATE (premoves, allow_takebacks)
  ON TABLE public.user_preferences TO authenticated;
