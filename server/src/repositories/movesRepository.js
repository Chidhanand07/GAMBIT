// @ts-check
/**
 * `moves` table queries (see gamesRepository for the return convention).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createMovesRepository(supabase) {
    return {
        /**
         * Append one move row.
         * @param {object} row
         */
        insert: (row) => supabase.from('moves').insert(row),
        /**
         * Delete the rows of the plies after the first `keep` (a takeback, ADR F-152).
         * @param {string} gameId
         * @param {number} keep moves that stay
         */
        deleteAfter: (gameId, keep) => supabase.from('moves').delete().eq('game_id', gameId).gt('move_number', keep),
    };
}

module.exports = { createMovesRepository };
