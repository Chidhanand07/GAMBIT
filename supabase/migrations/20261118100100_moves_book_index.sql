-- B1 item 4 (F-123; SEC-03): the profile reads the first moves of a player's games to name their
-- openings, so `moves` needs an index for "the first N plies of these games", and its contents
-- must stay server-written.
--
-- 1. Index: GET /api/profile/[username]/{stats,games} select
--      game_id, move_number, san FROM moves WHERE game_id IN (...) AND move_number <= 11
--    (lib/server/openings.ts). Without an index on game_id that is a sequential scan of every move
--    ever played. (game_id, move_number) also serves the "newest move of a game" lookup
--    (lib/server/games.ts findLastMove orders by created_at, which stays as it is).
-- 2. Privileges: only the game server (service_role) writes moves. The browser roles never had a
--    policy that allowed a write; their INSERT/UPDATE/DELETE/TRUNCATE privileges go too, so a
--    fabricated move cannot rename someone's opening even if a policy were added by mistake.
--    SELECT (and the "Moves are viewable by everyone." policy) is unchanged.
--
-- Rollback: DROP INDEX public.idx_moves_game_ply;
--           GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.moves TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_moves_game_ply ON public.moves (game_id, move_number);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.moves FROM anon, authenticated;
