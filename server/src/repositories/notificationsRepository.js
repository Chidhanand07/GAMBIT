// @ts-check
/**
 * `notifications` table queries (see gamesRepository for the return convention).
 */

const RECENT_LIMIT = 30;

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

        /**
         * A user's 30 most recent notifications.
         * @param {string} userId
         */
        listRecent: (userId) =>
            supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(RECENT_LIMIT),

        /**
         * Mark all of a user's unread notifications read.
         * @param {string} userId
         */
        markAllRead: (userId) =>
            supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false),

        /**
         * Mark one of a user's notifications read.
         * @param {string} id
         * @param {string} userId
         */
        markRead: (id, userId) =>
            supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId),
    };
}

module.exports = { createNotificationsRepository };
