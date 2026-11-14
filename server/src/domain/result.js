// @ts-check
/**
 * Game outcomes. An outcome is 'white' | 'black' | 'draw' (the winner's colour,
 * or draw); a result label is the human string sent in `game_end` events.
 * Outcomes are always computed by the server; nothing here parses client text.
 */

/**
 * 'white' → 'White wins', 'black' → 'Black wins', 'aborted' → 'Aborted',
 * anything else → 'Draw'.
 * @param {unknown} outcome
 * @returns {'White wins' | 'Black wins' | 'Aborted' | 'Draw'}
 */
function resultLabel(outcome) {
    if (outcome === 'white') return 'White wins';
    if (outcome === 'black') return 'Black wins';
    if (outcome === 'aborted') return 'Aborted';
    return 'Draw';
}

/**
 * 'white' → 'black', anything else → 'white'.
 * @param {unknown} color
 * @returns {'white' | 'black'}
 */
function opponentColor(color) {
    return color === 'white' ? 'black' : 'white';
}

/**
 * Board side ('w'/'b') to colour: 'w' → 'white', anything else → 'black'.
 * @param {unknown} side
 * @returns {'white' | 'black'}
 */
function sideToColor(side) {
    return side === 'w' ? 'white' : 'black';
}

/**
 * Colour a player has in a game: the white player is 'white', anyone else 'black'.
 * @param {unknown} playerId
 * @param {unknown} whiteId
 * @returns {'white' | 'black'}
 */
function colorOfPlayer(playerId, whiteId) {
    return playerId === whiteId ? 'white' : 'black';
}

/**
 * Player id for a colour: 'white' → whiteId, anything else → blackId.
 * @template T
 * @param {unknown} color
 * @param {{ whiteId: T, blackId: T }} players
 * @returns {T}
 */
function playerIdOf(color, { whiteId, blackId }) {
    return color === 'white' ? whiteId : blackId;
}

/**
 * Winner id for an outcome; null for a draw (or any unknown outcome).
 * @template T
 * @param {unknown} outcome
 * @param {{ whiteId: T, blackId: T }} players
 * @returns {T | null}
 */
function winnerIdFor(outcome, { whiteId, blackId }) {
    if (outcome === 'white') return whiteId;
    if (outcome === 'black') return blackId;
    return null;
}

const OUTCOMES = ['white', 'black', 'draw'];

/**
 * Outcome of a finished `games` row. Rows written since the server decides
 * results carry it in `result`; older decisive rows have `result` null and
 * only `winner_id`, so the winner column is the fallback. No winner → draw.
 * An aborted row (`status = 'aborted'`) is its own outcome, not a draw.
 * @param {{ status?: unknown, result?: unknown, winner_id?: unknown, white_id?: unknown, black_id?: unknown }} row
 * @returns {'white' | 'black' | 'draw' | 'aborted'}
 */
function outcomeOfRow(row) {
    if (row.status === 'aborted') return 'aborted';
    if (OUTCOMES.includes(/** @type {string} */ (row.result))) {
        return /** @type {'white' | 'black' | 'draw'} */ (row.result);
    }
    if (row.winner_id && row.winner_id === row.white_id) return 'white';
    if (row.winner_id && row.winner_id === row.black_id) return 'black';
    return 'draw';
}

module.exports = {
    resultLabel,
    opponentColor,
    sideToColor,
    colorOfPlayer,
    playerIdOf,
    winnerIdFor,
    outcomeOfRow,
};
