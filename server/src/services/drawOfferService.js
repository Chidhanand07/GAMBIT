// @ts-check
/**
 * Draw offers: `draw_offer`, `draw_accept`, `draw_decline` (design/DRAW-OFFER-PROPOSAL.md,
 * ADR F-151). The handlers pass the validated payload and the verified user id.
 *
 * The offer lives in the Redis game state and is written only through `mutateGame`'s
 * compare-and-set, so it is correct across replicas. An accepted offer ends the game
 * through the single finalizer, in the same atomic transition that checks the offer
 * still stands: a move (which clears it), a mate or a flag fall that commits first wins.
 */
const { REASON } = require('../domain/adjudication');
const { drawOfferRejection, hasOfferFor, withDrawOffer, DRAW_REJECTION } = require('../domain/drawOffer');
const { playerRejection, REJECTION } = require('../domain/moveAuthorization');
const { colorOfPlayer } = require('../domain/result');
const { gameRoom } = require('./emitter');

/**
 * @typedef {{ ok: boolean, error?: string }} AckResult
 * @typedef {object} DrawOfferDeps
 * @property {{ getGame: Function, mutateGame: Function }} gameStore
 * @property {{ endGameIf: (gameId: string, decide: (game: any) => any) => Promise<boolean> }} finalizer
 * @property {import('./emitter').Emitter} emitter
 * @property {() => number} now
 */

/** @type {import('../domain/adjudication').Verdict} */
const AGREED_DRAW = Object.freeze({ winner: null, reason: REASON.AGREEMENT });

/**
 * Why `userId` may not answer an offer in `game`; null when they may.
 * @param {any} game
 * @param {string} userId
 * @returns {string | null}
 */
function answerRejection(game, userId) {
    const reason = playerRejection(game, userId);
    if (reason) return reason;
    return hasOfferFor(game, colorOfPlayer(userId, game.whiteId)) ? null : DRAW_REJECTION.NO_PENDING_REQUEST;
}

/**
 * @param {DrawOfferDeps} deps
 */
function createDrawOffers({ gameStore, finalizer, emitter, now }) {
    /**
     * `draw_offer`: store the caller's offer and tell the room.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function offerDraw({ game_id: gameId }, userId) {
        /** @type {string | null} */
        let rejection = null;
        /** @type {'white' | 'black'} */
        let color = 'white';
        const next = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
            rejection = playerRejection(game, userId);
            if (rejection) return null;
            color = colorOfPlayer(userId, game.whiteId);
            rejection = drawOfferRejection(game, color);
            return rejection ? null : { ...game, ...withDrawOffer(game, color, now()) };
        });
        if (!next) return { ok: false, error: rejection ?? REJECTION.GAME_NOT_FOUND };
        // `ply`: moves played when the offer was made (the client's own cadence check).
        emitter.toRoom(gameRoom(gameId), 'draw_offered', { game_id: gameId, by: color, ply: next.drawOffer.ply });
        return { ok: true };
    }

    /**
     * `draw_accept`: the opponent's standing offer ends the game as a draw by agreement.
     * The offer is checked again inside the finalizer's transition, so an offer that a
     * move cleared, or a game that a mate ended first, is never drawn.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function acceptDraw({ game_id: gameId }, userId) {
        const before = answerRejection(await gameStore.getGame(gameId), userId);
        if (before) return { ok: false, error: before };
        /** @type {string | null} */
        let rejection = REJECTION.GAME_NOT_ACTIVE;
        const ended = await finalizer.endGameIf(gameId, (game) => {
            rejection = answerRejection(game, userId);
            return rejection ? null : AGREED_DRAW;
        });
        return ended ? { ok: true } : { ok: false, error: rejection ?? REJECTION.GAME_NOT_ACTIVE };
    }

    /**
     * `draw_decline`: clear the opponent's standing offer and tell the room.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function declineDraw({ game_id: gameId }, userId) {
        /** @type {string | null} */
        let rejection = null;
        /** @type {'white' | 'black'} */
        let color = 'white';
        const next = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
            rejection = answerRejection(game, userId);
            if (rejection) return null;
            color = colorOfPlayer(userId, game.whiteId);
            return { ...game, drawOffer: null };
        });
        if (!next) return { ok: false, error: rejection ?? REJECTION.GAME_NOT_FOUND };
        emitter.toRoom(gameRoom(gameId), 'draw_declined', { game_id: gameId, by: color });
        return { ok: true };
    }

    return { offerDraw, acceptDraw, declineDraw };
}

module.exports = { createDrawOffers };
