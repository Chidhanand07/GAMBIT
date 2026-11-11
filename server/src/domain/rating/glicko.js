// @ts-check
/**
 * Glicko-2 rating maths plus GAMBIT's rating policy (per-game change cap,
 * rating floor, RD cap). Pure: no I/O.
 */
const glicko2 = require('glicko2');
const { opponentColor } = require('../result');

const DEFAULT_RATING = 1200;
const DEFAULT_RD = 350;
const DEFAULT_VOL = 0.06;
const GLICKO_SETTINGS = { tau: 0.5, rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL };

/** Largest rating change one game may cause, either direction. */
const MAX_CHANGE = 50;
/** Ratings never drop below this. */
const RATING_FLOOR = 100;
/** RD used when a profile has none stored. */
const DEFAULT_PROFILE_RD = 100;
/** Stored RD is capped at this before rating a game. */
const RD_CAP = 150;

const WIN_SCORE = 1;
const LOSS_SCORE = 0;
const DRAW_SCORE = 0.5;

/**
 * @typedef {{ rating: number, rd: number, vol: number }} GlickoPlayer
 * @typedef {{ white: GlickoPlayer, black: GlickoPlayer }} GlickoResult
 */

/**
 * One Glicko-2 rating period with a single game. `result` is White's score
 * (1 win, 0.5 draw, 0 loss). Ratings are rounded; RD and volatility are not.
 * @param {object} params
 * @param {number} [params.whiteRating]
 * @param {number} [params.whiteRD]
 * @param {number} [params.whiteVol]
 * @param {number} [params.blackRating]
 * @param {number} [params.blackRD]
 * @param {number} [params.blackVol]
 * @param {number} params.result
 * @returns {GlickoResult}
 */
function calculateNewRatings({
    whiteRating = DEFAULT_RATING,
    whiteRD = DEFAULT_RD,
    whiteVol = DEFAULT_VOL,
    blackRating = DEFAULT_RATING,
    blackRD = DEFAULT_RD,
    blackVol = DEFAULT_VOL,
    result,
}) {
    const ranking = new glicko2.Glicko2(GLICKO_SETTINGS);
    const white = ranking.makePlayer(whiteRating, whiteRD, whiteVol);
    const black = ranking.makePlayer(blackRating, blackRD, blackVol);
    ranking.updateRatings([[white, black, result]]);
    return {
        white: { rating: Math.round(white.getRating()), rd: white.getRd(), vol: white.getVol() },
        black: { rating: Math.round(black.getRating()), rd: black.getRd(), vol: black.getVol() },
    };
}

/**
 * White's Glicko score for an outcome: 'white' → 1, 'black' → 0, else 0.5.
 * @param {unknown} outcome
 * @returns {number}
 */
function whiteScore(outcome) {
    if (outcome === 'white') return WIN_SCORE;
    if (outcome === 'black') return LOSS_SCORE;
    return DRAW_SCORE;
}

/**
 * @typedef {object} RatingProfile
 * @property {number | null} [rating_rd]
 * @property {number | null} [rating_vol]
 * @property {number | null} [games_played]
 * @property {number | null} [wins]
 * @property {number | null} [losses]
 * @property {number | null} [draws]
 */

/**
 * Arguments for `calculateNewRatings` from two stored profiles: missing RD is
 * 100 and RD is capped at 150; missing volatility is 0.06.
 * @param {object} params
 * @param {number} params.whiteRating
 * @param {RatingProfile} params.whiteProfile
 * @param {number} params.blackRating
 * @param {RatingProfile} params.blackProfile
 * @param {unknown} params.outcome
 */
function glickoInputs({ whiteRating, whiteProfile, blackRating, blackProfile, outcome }) {
    return {
        whiteRating,
        whiteRD: Math.min(whiteProfile.rating_rd ?? DEFAULT_PROFILE_RD, RD_CAP),
        whiteVol: whiteProfile.rating_vol ?? DEFAULT_VOL,
        blackRating,
        blackRD: Math.min(blackProfile.rating_rd ?? DEFAULT_PROFILE_RD, RD_CAP),
        blackVol: blackProfile.rating_vol ?? DEFAULT_VOL,
        result: whiteScore(outcome),
    };
}

/**
 * The rating actually stored: the Glicko change clamped to ±50, then floored at 100.
 * @param {number} oldRating
 * @param {number} glickoRating
 * @returns {number}
 */
function cappedRating(oldRating, glickoRating) {
    const change = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, glickoRating - oldRating));
    return Math.max(RATING_FLOOR, Math.round(oldRating + change));
}

/**
 * Win/loss/draw counters after a game, for the player of `color`. Missing
 * counters count as 0. Applies to rated and unrated games alike.
 * @param {RatingProfile} profile
 * @param {unknown} outcome 'white' | 'black' | 'draw'
 * @param {'white' | 'black'} color
 * @returns {{ games_played: number, wins: number, losses: number, draws: number }}
 */
function statsAfterGame(profile, outcome, color) {
    return {
        games_played: (profile.games_played ?? 0) + 1,
        wins: (profile.wins ?? 0) + (outcome === color ? 1 : 0),
        losses: (profile.losses ?? 0) + (outcome === opponentColor(color) ? 1 : 0),
        draws: (profile.draws ?? 0) + (outcome === 'draw' ? 1 : 0),
    };
}

module.exports = {
    DEFAULT_RATING,
    MAX_CHANGE,
    RATING_FLOOR,
    RD_CAP,
    calculateNewRatings,
    whiteScore,
    glickoInputs,
    cappedRating,
    statsAfterGame,
};
