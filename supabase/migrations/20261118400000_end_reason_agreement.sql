-- DRAW-OFFER (ADR F-151, F-165; SEC-08): an accepted draw offer is stored as end_reason 'agreement'.
--
-- Before: games.end_reason (B1, F-124) accepted the codes of every way a game could end when B1
-- shipped. B4's draw offers add one (adjudication REASON.AGREEMENT); the CHECK refused it, so the
-- finalizer's guarded games update for an agreed draw would fail.
--
-- After: the CHECK also accepts 'agreement'. The column, its grants (the game server's service_role
-- writes it, the browser roles cannot) and every existing value stay as they are.
--
-- Rollout: apply before the game server that offers draws. Rollback (only once no row says
-- 'agreement'): re-create the constraint from 20261118100200_game_end_reason.sql.

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_end_reason_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN (
    'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule',
    'resignation', 'timeout', 'abandonment', 'aborted', 'agreement'
  ));

COMMENT ON COLUMN public.games.end_reason IS
  'F-124 + F-165: how the game ended (checkmate | stalemate | insufficient_material | threefold_repetition | '
  'fifty_move_rule | resignation | timeout | abandonment | aborted | agreement). Written by the game server.';
