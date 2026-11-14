// @ts-check
/**
 * `games` table queries. Each function returns the Supabase query exactly as
 * the call sites built it (same columns, filters, filter order and terminal
 * call), un-awaited, so callers keep their own await / fire-and-forget and
 * `{ data, error }` handling.
 */

/** Columns needed to rebuild Redis state after a server restart (join_game). */
const RESTORE_COLUMNS =
    'id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms, result, winner_id';

/** A game with both players' profiles (invite page); whitespace kept as originally written. */
const WITH_PLAYERS_COLUMNS = `
                *,
                white:profiles!white_id(username, avatar_url),
                black:profiles!black_id(username, avatar_url)
            `;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createGamesRepository(supabase) {
    return {
        /**
         * Row used to restore an active game into Redis.
         * @param {string} gameId
         */
        findForRestore: (gameId) => supabase.from('games').select(RESTORE_COLUMNS).eq('id', gameId).maybeSingle(),

        /**
         * A game by id, with white/black profile joins (the invite page). The
         * invite token itself is in `game_invites` (gameInvitesRepository).
         * @param {string} gameId
         */
        findByIdWithPlayers: (gameId) =>
            supabase.from('games').select(WITH_PLAYERS_COLUMNS).eq('id', gameId).maybeSingle(),

        /**
         * Delete a game by id (used to undo a private game whose invite could not be stored).
         * @param {string} gameId
         */
        deleteById: (gameId) => supabase.from('games').delete().eq('id', gameId),

        /**
         * Insert one game and return the created row.
         * @param {object} row
         */
        insertReturning: (row) => supabase.from('games').insert(row).select().single(),

        /**
         * Update a game by id (no status guard).
         * @param {string} gameId
         * @param {object} fields
         */
        updateById: (gameId, fields) => supabase.from('games').update(fields).eq('id', gameId),

        /**
         * Update a game only while it is still active.
         * @param {string} gameId
         * @param {object} fields
         */
        updateIfActive: (gameId, fields) =>
            supabase.from('games').update(fields).eq('id', gameId).eq('status', 'active'),

        /**
         * Idempotent finalisation: update only while active; `data` is `{ id }`
         * when this call won, null when the game was already finalised.
         * @param {string} gameId
         * @param {object} fields
         */
        finishIfActive: (gameId, fields) =>
            supabase.from('games').update(fields).eq('id', gameId).eq('status', 'active').select('id').maybeSingle(),

        /**
         * Update a game only while it is still waiting; returns the updated row or null.
         * @param {string} gameId
         * @param {object} fields
         */
        startIfWaiting: (gameId, fields) =>
            supabase.from('games').update(fields).eq('id', gameId).eq('status', 'waiting').select().maybeSingle(),
    };
}

module.exports = { createGamesRepository };
