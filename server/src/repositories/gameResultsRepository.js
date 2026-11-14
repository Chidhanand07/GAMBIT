// @ts-check
/**
 * The database function that applies a finished game to both profiles
 * (supabase/migrations/20261113100000_rating_atomic.sql, RATING-ATOMIC).
 * Returns the `rpc` query un-awaited, like the other repositories.
 */

/**
 * @typedef {object} RatingSide values for one player of a rated game
 * @property {number | null} old_rating the stored rating the new one was computed from
 * @property {number | null} old_rd
 * @property {number | null} old_vol
 * @property {number | null} old_games_played
 * @property {number} new_rating
 * @property {number} new_rd
 * @property {number} new_vol
 */

/**
 * @typedef {object} GameResultArgs
 * @property {string} gameId
 * @property {string} whiteId
 * @property {string} blackId
 * @property {'white' | 'black' | 'draw'} result
 * @property {string | null} ratingField the rating column for a rated game; null for an unrated one
 * @property {RatingSide | null} white
 * @property {RatingSide | null} black
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createGameResultsRepository(supabase) {
    return {
        /**
         * Apply a completed game once, atomically. `data` is 'applied',
         * 'already_applied' or 'stale' (the profiles changed since they were
         * read: nothing was written). A refused call (game not completed,
         * players or result not matching, …) comes back as `error`.
         * @param {GameResultArgs} args
         */
        applyGameResult: ({ gameId, whiteId, blackId, result, ratingField, white, black }) =>
            supabase.rpc('apply_game_result', {
                p_game_id: gameId,
                p_white_id: whiteId,
                p_black_id: blackId,
                p_result: result,
                p_rating_field: ratingField,
                p_white: white,
                p_black: black,
            }),
    };
}

module.exports = { createGameResultsRepository };
