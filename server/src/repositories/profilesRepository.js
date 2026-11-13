// @ts-check
/**
 * `profiles` table queries (see gamesRepository for the return convention).
 */

/** Rating and stats columns used by the matchmaking queue (C3: server-side rating). */
const MATCHMAKING_COLUMNS = 'id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, games_played';

/**
 * Columns read when a rated game ends. Ratings and statistics are written only
 * by `apply_game_result` (gameResultsRepository, RATING-ATOMIC, SEC-04).
 */
const RATING_COLUMNS =
    'id, rating_rapid, rating_blitz, rating_bullet, rating_classical, rating_rd, rating_vol, games_played, wins, losses, draws';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createProfilesRepository(supabase) {
    return {
        /**
         * `{ username }` of the profile with this username, or null. `maybeSingle()`:
         * "no such profile" is a normal answer, so an `error` here is a real failure.
         * @param {string} username
         */
        findUsernameByUsername: (username) =>
            supabase.from('profiles').select('username').eq('username', username).maybeSingle(),

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
    };
}

module.exports = { createProfilesRepository };
