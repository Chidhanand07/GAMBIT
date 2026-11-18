-- B1 item 5 (F-124; NODE-16): how a game ended is stored with its result.
--
-- Before: the finalizer knew the reason (Verdict.reason: checkmate, resignation, time, ...) and
-- sent it to the players in `game_end`, but the games row kept only the result. The profile's
-- "How games end" card had nothing to count.
--
-- After: games.end_reason, a code from a fixed list (CHECK). The game server writes it in the same
-- guarded UPDATE that writes the result (gameFinalizer finishedRow, also replayed by the result
-- outbox); the web app writes 'abandonment' when it closes a game that outlived a server restart.
--
-- Privileges: since F-120 service_role writes games column by column; it gets INSERT/UPDATE on
-- end_reason. The browser roles have no write privilege on games (F-120) and get none here.
--
-- Old games: an aborted game is 'aborted' and a game the web app abandoned ('abandoned' result) is
-- 'abandonment'; for every other finished game the reason was never stored and stays NULL (shown
-- as "Not recorded").
--
-- Deploy order: this migration first, then the game server and web app that write the column (an
-- older server keeps working: it simply does not write it).
--
-- Rollback: ALTER TABLE public.games DROP COLUMN end_reason;

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS end_reason text;

ALTER TABLE public.games
  ADD CONSTRAINT games_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN (
    'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule',
    'resignation', 'timeout', 'abandonment', 'aborted'
  ));

COMMENT ON COLUMN public.games.end_reason IS
  'F-124: how the game ended (server verdict). Written by the game server''s finalizer with the result; NULL for games finished before F-124.';

GRANT INSERT (end_reason), UPDATE (end_reason) ON TABLE public.games TO service_role;

UPDATE public.games SET end_reason = 'aborted'
WHERE end_reason IS NULL AND status = 'aborted';
UPDATE public.games SET end_reason = 'abandonment'
WHERE end_reason IS NULL AND result = 'abandoned';
