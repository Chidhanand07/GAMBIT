// @ts-check
/**
 * The two halves of `make_move` after authorization: engine validation and
 * applying the move (Redis state, broadcast, fire-and-forget DB persist).
 * Split from gameService to keep each function small (SIZE-02).
 */
const { clocksAfterMove } = require('../domain/clock');
const { sideToColor } = require('../domain/result');
const { gameRoom } = require('./emitter');

/**
 * @param {Pick<import('./gameService').GameServiceDeps,
 *   'gameStore' | 'gamesRepo' | 'movesRepo' | 'engineClient' | 'emitter' | 'now'>} deps
 */
function createMoveRecorder({ gameStore, gamesRepo, movesRepo, engineClient, emitter, now = () => Date.now() }) {
    /**
     * Ask the engine whether `data.move` is legal from the stored FEN. On a
     * legal move `data.fen` becomes the engine's FEN. When the engine is
     * unreachable or answers non-ok the client FEN is kept (known bug).
     * @param {{ fen: string }} game
     * @param {Record<string, any>} data
     * @returns {Promise<boolean>} false only for a move the engine rejected
     */
    async function validate(game, data) {
        try {
            const validationRes = await engineClient.validateMove({ fen: game.fen, move: data.move });
            if (validationRes.ok) {
                const validation = await validationRes.json();
                if (!validation.valid) {
                    console.warn('[make_move] illegal move rejected:', data.move, 'from', game.fen);
                    return false;
                }
                data.fen = validation.new_fen;
            }
        } catch (e) {
            console.warn('[make_move] engine validation unavailable:', /** @type {Error} */ (e).message);
        }
        return true;
    }

    /**
     * Charge the mover's clock (plus increment), store the new state, broadcast
     * `move_made` with the clocks, then persist FEN and move without awaiting
     * (H10: clocks are flushed on game_end only).
     * @param {any} game
     * @param {Record<string, any>} data
     */
    async function apply(game, data) {
        const at = now();
        const movedSide = game.activeSide;
        // Charge elapsed time, then add increment to the player who just moved
        const { whiteMs: whiteClockMs, blackMs: blackClockMs, nextSide: newSide } = clocksAfterMove(game, at);
        const newMoveLog = [...(game.moveLog || []), { move: data.move, fen: data.fen, san: data.san }];

        await gameStore.updateGame(data.game_id, {
            fen: data.fen,
            whiteClockMs,
            blackClockMs,
            activeSide: newSide,
            lastMoveAt: at,
            moveLog: newMoveLog,
        });

        data.whiteMs = whiteClockMs;
        data.blackMs = blackClockMs;
        emitter.toRoom(gameRoom(data.game_id), 'move_made', data);

        const clockAfterMove = movedSide === 'w' ? Math.round(whiteClockMs) : Math.round(blackClockMs);
        persist(data, { moveNumber: newMoveLog.length, movedColor: sideToColor(movedSide), clockAfterMove });
    }

    /**
     * Fire-and-forget: update the games row FEN and append the move row.
     * @param {Record<string, any>} data
     * @param {{ moveNumber: number, movedColor: string, clockAfterMove: number }} move
     */
    function persist(data, { moveNumber, movedColor, clockAfterMove }) {
        Promise.all([
            gamesRepo.updateById(data.game_id, { fen: data.fen }),
            movesRepo.insert({
                game_id: data.game_id,
                move_number: moveNumber,
                color: movedColor,
                uci: data.move,
                san: data.san,
                fen_after: data.fen,
                clock_ms_remaining: clockAfterMove,
            }),
        ]).then(([gRes, mRes]) => {
            if (gRes.error) console.error('[make_move] game persist:', gRes.error.message);
            if (mRes.error) console.error('[make_move] move persist:', mRes.error.message);
        });
    }

    return { validate, apply };
}

module.exports = { createMoveRecorder };
