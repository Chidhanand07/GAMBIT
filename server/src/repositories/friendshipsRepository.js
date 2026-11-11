// @ts-check
/**
 * `friendships` table queries (see gamesRepository for the return convention).
 * User ids are interpolated into PostgREST `or` filters exactly as before.
 */

const FRIEND_LIST_COLUMNS =
    'id, requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(username,avatar_url,rating_rapid), addressee:profiles!friendships_addressee_id_fkey(username,avatar_url,rating_rapid)';

const PENDING_REQUEST_COLUMNS =
    'id, created_at, requester:profiles!friendships_requester_id_fkey(id,username,display_name,avatar_url,rating_rapid)';

/**
 * PostgREST filter: rows where `userId` is requester or addressee.
 * @param {string} userId
 */
const involving = (userId) => `requester_id.eq.${userId},addressee_id.eq.${userId}`;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createFriendshipsRepository(supabase) {
    return {
        /**
         * `{ status, requester_id }` of the friendship between two users (either direction), or null.
         * @param {string} userId
         * @param {string} otherId
         */
        findBetween: (userId, otherId) =>
            supabase
                .from('friendships')
                .select('status, requester_id')
                .or(
                    `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
                )
                .maybeSingle(),

        /**
         * Create a pending request.
         * @param {string} requesterId
         * @param {string} addresseeId
         */
        insertRequest: (requesterId, addresseeId) =>
            supabase.from('friendships').insert({ requester_id: requesterId, addressee_id: addresseeId }),

        /**
         * Accepted friendships of a user, with both profiles joined.
         * @param {string} userId
         */
        listAccepted: (userId) =>
            supabase.from('friendships').select(FRIEND_LIST_COLUMNS).or(involving(userId)).eq('status', 'accepted'),

        /**
         * Incoming pending requests, newest first.
         * @param {string} addresseeId
         */
        listPendingFor: (addresseeId) =>
            supabase
                .from('friendships')
                .select(PENDING_REQUEST_COLUMNS)
                .eq('addressee_id', addresseeId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false }),

        /**
         * Set the status of a request addressed to `addresseeId`.
         * @param {string} id
         * @param {string} addresseeId
         * @param {string} status
         */
        setStatusAsAddressee: (id, addresseeId, status) =>
            supabase.from('friendships').update({ status }).eq('id', id).eq('addressee_id', addresseeId),

        /**
         * Delete a friendship the user is part of.
         * @param {string} id
         * @param {string} userId
         */
        deleteInvolving: (id, userId) => supabase.from('friendships').delete().eq('id', id).or(involving(userId)),
    };
}

module.exports = { createFriendshipsRepository };
