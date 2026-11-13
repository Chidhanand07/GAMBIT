// @ts-check
/**
 * Rating updates after a game (Glicko-2 policy in domain/rating/glicko).
 * Moved from `server/services/rating.js`, which is now the singleton facade.
 *
 * Glicko-2 is computed here; the database function `apply_game_result`
 * writes the result under row locks, only if the profiles still hold the
 * values it was computed from, and only once per game (games.rated_at).
 */
const { ratingField } = require('../domain/timeControl');
const glicko = require('../domain/rating/glicko');

/**
 * @typedef {{ oldRating: number, newRating: number, change: number }} RatingChange
 * @typedef {{ white: RatingChange, black: RatingChange }} RatingChanges
 */

/** How often a rated game is recomputed when the profiles changed under it. */
const APPLY_ATTEMPTS = 5;

/**
 * @typedef {import('../repositories/gameResultsRepository').GameResultArgs} GameResultArgs
 * @typedef {import('../repositories/gameResultsRepository').RatingSide} RatingSide
 */

/**
 * @typedef {object} RatingProfilesPort
 * @property {(ids: string[]) => PromiseLike<{ data: any[] | null }>} findRatingsByIds
 */

/**
 * @typedef {object} GameResultsPort
 * @property {(args: GameResultArgs) => PromiseLike<{ data: unknown, error: { message: string } | null }>} applyGameResult
 */

/**
 * Both players' profiles, or null unless both were found.
 * @param {RatingProfilesPort} profilesRepo
 * @param {string} whiteId
 * @param {string} blackId
 */
async function findPair(profilesRepo, whiteId, blackId) {
    const { data: profiles } = await profilesRepo.findRatingsByIds([whiteId, blackId]);
    if (!profiles || profiles.length < 2) return null;

    const wp = profiles.find((p) => p.id === whiteId);
    const bp = profiles.find((p) => p.id === blackId);
    if (!wp || !bp) return null;
    return { wp, bp };
}

/**
 * @param {number} oldRating
 * @param {number} newRating
 * @returns {RatingChange}
 */
const changeOf = (oldRating, newRating) => ({ oldRating, newRating, change: newRating - oldRating });

/**
 * One side of the call: the stored values the new ones were computed from
 * (the function compares them before writing) and the new values.
 * @param {any} profile as read
 * @param {string} field
 * @param {{ rating: number, rd: number, vol: number }} next
 * @returns {RatingSide}
 */
const sideOf = (profile, field, next) => ({
    old_rating: profile[field] ?? null,
    old_rd: profile.rating_rd ?? null,
    old_vol: profile.rating_vol ?? null,
    old_games_played: profile.games_played ?? null,
    new_rating: next.rating,
    new_rd: next.rd,
    new_vol: next.vol,
});

/**
 * Glicko-2 for one game from the profiles as read: the call arguments and the
 * changes to report if it is applied.
 * @param {{ calculateNewRatings: typeof glicko.calculateNewRatings }} service
 * @param {{ field: string, wp: any, bp: any, result: string }} p
 */
function computeRatings(service, { field, wp, bp, result }) {
    const whiteOld = wp[field] ?? glicko.DEFAULT_RATING;
    const blackOld = bp[field] ?? glicko.DEFAULT_RATING;
    const next = service.calculateNewRatings(
        glicko.glickoInputs({
            whiteRating: whiteOld,
            whiteProfile: wp,
            blackRating: blackOld,
            blackProfile: bp,
            outcome: result,
        }),
    );
    next.white.rating = glicko.cappedRating(whiteOld, next.white.rating);
    next.black.rating = glicko.cappedRating(blackOld, next.black.rating);
    return {
        white: sideOf(wp, field, next.white),
        black: sideOf(bp, field, next.black),
        /** @type {RatingChanges} */
        changes: {
            white: changeOf(whiteOld, next.white.rating),
            black: changeOf(blackOld, next.black.rating),
        },
    };
}

/**
 * Call the database function; its status, or null when it refused (logged).
 * @param {GameResultsPort} gameResultsRepo
 * @param {GameResultArgs} args
 * @returns {Promise<string | null>}
 */
async function apply(gameResultsRepo, args) {
    const { data, error } = await gameResultsRepo.applyGameResult(args);
    if (error) {
        console.error(`[rating] game ${args.gameId}: not applied:`, error.message);
        return null;
    }
    return /** @type {string} */ (data);
}

/**
 * Rate a game: read, compute, apply under compare-and-set; recompute when the
 * profiles changed in between (another game of the same player finished).
 * @param {{ profilesRepo: RatingProfilesPort, gameResultsRepo: GameResultsPort }} repos
 * @param {{ calculateNewRatings: typeof glicko.calculateNewRatings }} service
 * @param {{ gameId: string, whiteId: string, blackId: string, result: any, field: string }} game
 * @returns {Promise<RatingChanges | null>}
 */
async function applyRated({ profilesRepo, gameResultsRepo }, service, { gameId, whiteId, blackId, result, field }) {
    for (let attempt = 0; attempt < APPLY_ATTEMPTS; attempt++) {
        const pair = await findPair(profilesRepo, whiteId, blackId);
        if (!pair) return null;
        const { white, black, changes } = computeRatings(service, { field, ...pair, result });
        const status = await apply(gameResultsRepo, {
            gameId,
            whiteId,
            blackId,
            result,
            ratingField: field,
            white,
            black,
        });
        if (status === 'applied') return changes;
        // 'already_applied' (rated before: its broadcast was sent then) or refused.
        if (status !== 'stale') return null;
    }
    console.error(`[rating] game ${gameId}: profiles kept changing, not rated after ${APPLY_ATTEMPTS} attempts`);
    return null;
}

/**
 * @param {object} deps
 * @param {RatingProfilesPort} deps.profilesRepo
 * @param {GameResultsPort} deps.gameResultsRepo
 */
function createRatingService({ profilesRepo, gameResultsRepo }) {
    const service = {
        /**
         * One Glicko-2 period for a single game (see domain/rating/glicko).
         * @param {Parameters<typeof glicko.calculateNewRatings>[0]} params
         */
        calculateNewRatings(params) {
            return glicko.calculateNewRatings(params);
        },

        /**
         * Record a finished game once (RATING-ATOMIC): stats always, the rating
         * column only when rated, both through `apply_game_result`, which
         * refuses a game that is not completed and ignores one already applied.
         * Never throws; errors are logged and yield null.
         * @param {string} gameId
         * @param {string} whiteId
         * @param {string} blackId
         * @param {'white' | 'black' | 'draw'} result
         * @param {unknown} timeControl
         * @param {boolean} [isRated]
         * @returns {Promise<RatingChanges | null>} changes when this call rated the game, null otherwise
         */
        // eslint-disable-next-line max-params -- public signature pinned by rating/clock/socket tests
        async processGameEnd(gameId, whiteId, blackId, result, timeControl, isRated = true) {
            try {
                if (!isRated) {
                    await apply(gameResultsRepo, {
                        gameId,
                        whiteId,
                        blackId,
                        result,
                        ratingField: null,
                        white: null,
                        black: null,
                    });
                    return null;
                }
                const field = service._ratingField(timeControl);
                return await applyRated({ profilesRepo, gameResultsRepo }, service, {
                    gameId,
                    whiteId,
                    blackId,
                    result,
                    field,
                });
            } catch (e) {
                console.error('[rating] processGameEnd error:', /** @type {Error} */ (e).message);
                return null;
            }
        },

        /**
         * The profiles rating column for a time control.
         * @param {unknown} timeControl
         */
        _ratingField(timeControl) {
            return ratingField(timeControl);
        },
    };
    return service;
}

module.exports = { createRatingService };
