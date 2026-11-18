// @ts-check
/**
 * `friendships` reads for the game server (see gamesRepository for the return
 * convention). Ids reach the filter only after the socket schemas or the
 * token verifier: their charset has no meaning in a PostgREST filter.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createFriendshipsRepository(supabase) {
    return {
        /**
         * The accepted friendship between two users, in either direction (`[]` when none).
         * @param {string} a
         * @param {string} b
         */
        findAcceptedBetween: (a, b) =>
            supabase
                .from('friendships')
                .select('id')
                .eq('status', 'accepted')
                .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
                .limit(1),
    };
}

module.exports = { createFriendshipsRepository };
