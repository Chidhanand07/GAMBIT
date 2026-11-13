// @ts-check
/**
 * `game_invites` table queries (see gamesRepository for the return convention).
 *
 * Invite tokens live here, not on `games`: `games` is readable through the
 * public API key, `game_invites` has RLS enabled with no policies and no grants
 * to the API roles, so only this service-role client can see a token.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createGameInvitesRepository(supabase) {
    return {
        /**
         * Store the invite of a game.
         * @param {{ game_id: string, token: string, expires_at: string }} row
         */
        insert: (row) => supabase.from('game_invites').insert(row),

        /**
         * The game an invite token belongs to, and when the invite expires.
         * @param {string} token
         */
        findByToken: (token) =>
            supabase.from('game_invites').select('game_id, expires_at').eq('token', token).maybeSingle(),
    };
}

module.exports = { createGameInvitesRepository };
