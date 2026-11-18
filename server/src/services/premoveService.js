// @ts-check
/**
 * Premoves: `premove_set` and `premove_cancel` (ADR F-153). The handlers pass the
 * validated payload and the verified user id.
 *
 * The queued move is private to its owner: it is acked, never broadcast, and only the
 * owner's own `game_state_sync` carries it. It is stored through `mutateGame`'s
 * compare-and-set and played (or dropped) by the move recorder in the same transition
 * that applies the opponent's move, so it is correct across replicas.
 */
const { playerRejection } = require('../domain/moveAuthorization');
const { premoveRejection, withPremove } = require('../domain/premove');
const { colorOfPlayer } = require('../domain/result');

/**
 * @typedef {{ ok: boolean, error?: string }} AckResult
 * @typedef {{ game_id: string, from: string, to: string, promotion?: string }} PremoveRequest
 */

/**
 * @param {{ gameStore: { mutateGame: Function } }} deps
 */
function createPremoves({ gameStore }) {
    /**
     * `premove_set`: queue (or replace) the caller's move for when the opponent has moved.
     * @param {PremoveRequest} request
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function setPremove(request, userId) {
        /** @type {string | null} */
        let rejection = null;
        await gameStore.mutateGame(request.game_id, (/** @type {any} */ game) => {
            rejection = playerRejection(game, userId);
            if (rejection) return null;
            const color = colorOfPlayer(userId, game.whiteId);
            rejection = premoveRejection(game, color, request);
            return rejection ? null : { ...game, ...withPremove(color, request) };
        });
        return rejection ? { ok: false, error: rejection } : { ok: true };
    }

    /**
     * `premove_cancel`: drop the caller's queued move. Cancelling when none is queued is
     * not an error (the premove may just have been played or dropped).
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function cancelPremove({ game_id: gameId }, userId) {
        /** @type {string | null} */
        let rejection = null;
        await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
            rejection = playerRejection(game, userId);
            if (rejection || game.premove?.by !== colorOfPlayer(userId, game.whiteId)) return null;
            return { ...game, premove: null };
        });
        return rejection ? { ok: false, error: rejection } : { ok: true };
    }

    return { setPremove, cancelPremove };
}

module.exports = { createPremoves };
