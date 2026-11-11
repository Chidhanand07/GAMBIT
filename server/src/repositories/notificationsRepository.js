// @ts-check
/**
 * `notifications` table queries (see gamesRepository for the return convention).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createNotificationsRepository(supabase) {
    return {
        /**
         * Insert one notification row.
         * @param {object} row
         */
        insert: (row) => supabase.from('notifications').insert(row),
    };
}

module.exports = { createNotificationsRepository };
