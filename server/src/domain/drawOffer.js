// @ts-check
/**
 * Draw offers (design/DRAW-OFFER-PROPOSAL.md, ADR F-151). Pure: decided from the
 * stored game state and the caller's colour only.
 *
 * State, inside the Redis game JSON:
 * - `drawOffer: { by, at, ply } | null`: the one standing offer (`ply` = moves played when made);
 * - `lastDrawOfferPly: { white?: number, black?: number }`: when each side last offered.
 */

/** Ack codes of the draw-offer events. */
const DRAW_REJECTION = Object.freeze({
    PENDING: 'draw_offer_pending',
    TOO_SOON: 'draw_offer_too_soon',
    NO_PENDING_REQUEST: 'no_pending_request',
});

/** No offer before each side has made a move (the first-move rule aborts those games anyway). */
const PLIES_BEFORE_FIRST_OFFER = 2;
/** A side may offer again only after this many moves of its own since its last offer. */
const OWN_MOVES_BETWEEN_OFFERS = 2;

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {{ by: Color, at: number, ply: number }} DrawOffer
 * @typedef {{ moveLog?: unknown[] | null, drawOffer?: DrawOffer | null,
 *   lastDrawOfferPly?: Partial<Record<Color, number>> | null }} DrawState
 */

/**
 * Moves played so far (plies).
 * @param {DrawState} game
 * @returns {number}
 */
const pliesOf = (game) => game.moveLog?.length ?? 0;

/**
 * How many moves `color` made in plies [fromPly, toPly). White plays the even plies.
 * @param {Color} color
 * @param {number} fromPly
 * @param {number} toPly
 * @returns {number}
 */
function ownMovesBetween(color, fromPly, toPly) {
    const parity = color === 'white' ? 0 : 1;
    let count = 0;
    for (let ply = fromPly; ply < toPly; ply++) if (ply % 2 === parity) count++;
    return count;
}

/**
 * Why `color` may not offer a draw now; null when it may.
 * @param {DrawState} game an active game (the caller checks status and participation)
 * @param {Color} color the caller's colour
 * @returns {string | null}
 */
function drawOfferRejection(game, color) {
    if (game.drawOffer) return DRAW_REJECTION.PENDING;
    const plies = pliesOf(game);
    if (plies < PLIES_BEFORE_FIRST_OFFER) return DRAW_REJECTION.TOO_SOON;
    const last = game.lastDrawOfferPly?.[color];
    if (typeof last === 'number' && ownMovesBetween(color, last, plies) < OWN_MOVES_BETWEEN_OFFERS) {
        return DRAW_REJECTION.TOO_SOON;
    }
    return null;
}

/**
 * True when `color` may offer a draw in `game` now.
 * @param {DrawState} game
 * @param {Color} color
 * @returns {boolean}
 */
const canOfferDraw = (game, color) => drawOfferRejection(game, color) === null;

/**
 * Fields to store for a new offer by `color` at `at`.
 * @param {DrawState} game
 * @param {Color} color
 * @param {number} at
 */
function withDrawOffer(game, color, at) {
    const ply = pliesOf(game);
    return {
        drawOffer: { by: color, at, ply },
        lastDrawOfferPly: { ...(game.lastDrawOfferPly ?? {}), [color]: ply },
    };
}

/**
 * True when the standing offer was made by the opponent of `color` (so `color` may answer it).
 * @param {DrawState} game
 * @param {Color} color
 * @returns {boolean}
 */
const hasOfferFor = (game, color) => Boolean(game.drawOffer) && game.drawOffer?.by !== color;

module.exports = {
    DRAW_REJECTION,
    OWN_MOVES_BETWEEN_OFFERS,
    drawOfferRejection,
    canOfferDraw,
    withDrawOffer,
    hasOfferFor,
};
