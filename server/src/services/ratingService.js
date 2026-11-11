// @ts-check
/**
 * Rating updates after a game (Glicko-2 policy in domain/rating/glicko).
 * Moved from `server/services/rating.js`, which is now the singleton facade.
 */
const { ratingField } = require('../domain/timeControl');
const glicko = require('../domain/rating/glicko');

/**
 * @typedef {{ oldRating: number, newRating: number, change: number }} RatingChange
 * @typedef {{ white: RatingChange, black: RatingChange }} RatingChanges
 */

/**
 * @typedef {object} RatingProfilesPort
 * @property {(ids: string[]) => PromiseLike<{ data: any[] | null }>} findRatingsByIds
 * @property {(id: string, fields: object) => PromiseLike<{ error: { message: string } | null }>} updateById
 */

/**
 * Both players' profiles, or null unless both were found.
 * @param {RatingProfilesPort} profilesRepo
 * @param {string} whiteId
 * @param {string} blackId
 */
async function findPair(profilesRepo, whiteId, blackId) {
    // Select base columns only; rating_rd/vol are optional and may not exist yet
    const { data: profiles } = await profilesRepo.findRatingsByIds([whiteId, blackId]);
    if (!profiles || profiles.length < 2) return null;

    const wp = profiles.find((p) => p.id === whiteId);
    const bp = profiles.find((p) => p.id === blackId);
    if (!wp || !bp) return null;
    return { wp, bp };
}

/**
 * Compute capped ratings and write rating, RD and volatility into the update rows.
 * @param {{ calculateNewRatings: typeof glicko.calculateNewRatings }} service
 * @param {{ field: string, wp: any, bp: any, whiteOld: number, blackOld: number, result: string,
 *   whiteUpdate: Record<string, number>, blackUpdate: Record<string, number> }} p
 */
function applyRatings(service, { field, wp, bp, whiteOld, blackOld, result, whiteUpdate, blackUpdate }) {
    const newRatings = service.calculateNewRatings(
        glicko.glickoInputs({
            whiteRating: whiteOld,
            whiteProfile: wp,
            blackRating: blackOld,
            blackProfile: bp,
            outcome: result,
        }),
    );
    whiteUpdate[field] = glicko.cappedRating(whiteOld, newRatings.white.rating);
    blackUpdate[field] = glicko.cappedRating(blackOld, newRatings.black.rating);
    newRatings.white.rating = whiteUpdate[field];
    newRatings.black.rating = blackUpdate[field];
    whiteUpdate.rating_rd = newRatings.white.rd;
    whiteUpdate.rating_vol = newRatings.white.vol;
    blackUpdate.rating_rd = newRatings.black.rd;
    blackUpdate.rating_vol = newRatings.black.vol;
    return newRatings;
}

/**
 * @param {number} oldRating
 * @param {number} newRating
 * @returns {RatingChange}
 */
const changeOf = (oldRating, newRating) => ({ oldRating, newRating, change: newRating - oldRating });

/**
 * Write stats (always) and ratings (rated games only) for both players.
 * @param {RatingProfilesPort} profilesRepo
 * @param {{ calculateNewRatings: typeof glicko.calculateNewRatings, _ratingField: (tc: unknown) => string }} service
 * @param {{ whiteId: string, blackId: string, result: string, timeControl: unknown, isRated: boolean }} game
 * @returns {Promise<RatingChanges | null>}
 */
async function updateProfiles(profilesRepo, service, { whiteId, blackId, result, timeControl, isRated }) {
    const pair = await findPair(profilesRepo, whiteId, blackId);
    if (!pair) return null;
    const { wp, bp } = pair;

    const field = service._ratingField(timeControl);
    // Stats always update (rated and unrated)
    const whiteUpdate = /** @type {Record<string, number>} */ (glicko.statsAfterGame(wp, result, 'white'));
    const blackUpdate = /** @type {Record<string, number>} */ (glicko.statsAfterGame(bp, result, 'black'));
    const whiteOld = wp[field] ?? glicko.DEFAULT_RATING;
    const blackOld = bp[field] ?? glicko.DEFAULT_RATING;
    // Rating column only updates for rated games
    const newRatings = isRated
        ? applyRatings(service, { field, wp, bp, whiteOld, blackOld, result, whiteUpdate, blackUpdate })
        : null;

    const [wRes, bRes] = await Promise.all([
        profilesRepo.updateById(whiteId, whiteUpdate),
        profilesRepo.updateById(blackId, blackUpdate),
    ]);
    if (wRes.error) console.error('[rating] white update error:', wRes.error.message);
    if (bRes.error) console.error('[rating] black update error:', bRes.error.message);

    if (!isRated || !newRatings) return null;
    return {
        white: changeOf(whiteOld, newRatings.white.rating),
        black: changeOf(blackOld, newRatings.black.rating),
    };
}

/**
 * @param {object} deps
 * @param {RatingProfilesPort} deps.profilesRepo
 */
function createRatingService({ profilesRepo }) {
    const service = {
        /**
         * One Glicko-2 period for a single game (see domain/rating/glicko).
         * @param {Parameters<typeof glicko.calculateNewRatings>[0]} params
         */
        calculateNewRatings(params) {
            return glicko.calculateNewRatings(params);
        },

        /**
         * Record a finished game: stats always, the rating column only when rated.
         * Never throws; errors are logged and yield null.
         * @param {string} gameId unused, kept for the public signature
         * @param {string} whiteId
         * @param {string} blackId
         * @param {'white' | 'black' | 'draw'} result
         * @param {unknown} timeControl
         * @param {boolean} [isRated]
         * @returns {Promise<RatingChanges | null>} changes for rated games, null otherwise
         */
        // eslint-disable-next-line max-params -- public signature pinned by rating/clock/socket tests
        async processGameEnd(gameId, whiteId, blackId, result, timeControl, isRated = true) {
            try {
                return await updateProfiles(profilesRepo, service, { whiteId, blackId, result, timeControl, isRated });
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
