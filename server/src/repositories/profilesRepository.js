// @ts-check
/**
 * `profiles` table queries (see gamesRepository for the return convention).
 */

/** Rating and stats columns used by the matchmaking queue (C3: server-side rating). */
const MATCHMAKING_COLUMNS = 'id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, games_played';

/** Columns read when a game ends; rating_rd/rating_vol may not exist on older schemas. */
const RATING_COLUMNS =
    'id, rating_rapid, rating_blitz, rating_bullet, rating_classical, rating_rd, rating_vol, games_played, wins, losses, draws';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createProfilesRepository(supabase) {
    return {
        /**
         * `{ username }` of the profile with this username (`.single()`).
         * @param {string} username
         */
        findUsernameByUsername: (username) =>
            supabase.from('profiles').select('username').eq('username', username).single(),

        /**
         * Ratings and games played for the matchmaking queue, or null.
         * @param {string} id
         */
        findForMatchmaking: (id) => supabase.from('profiles').select(MATCHMAKING_COLUMNS).eq('id', id).maybeSingle(),

        /**
         * Ratings and stats of several profiles.
         * @param {string[]} ids
         */
        findRatingsByIds: (ids) => supabase.from('profiles').select(RATING_COLUMNS).in('id', ids),

        /**
         * Update one profile by id.
         * @param {string} id
         * @param {object} fields
         */
        updateById: (id, fields) => supabase.from('profiles').update(fields).eq('id', id),
    };
}

module.exports = { createProfilesRepository };
