// @ts-check
/**
 * `messages` table queries (see gamesRepository for the return convention).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createMessagesRepository(supabase) {
    return {
        /**
         * Persist one chat message row.
         * @param {object} row
         */
        insert: (row) => supabase.from('messages').insert(row),
    };
}

module.exports = { createMessagesRepository };
