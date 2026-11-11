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
    };
}

module.exports = { createMovesRepository };
