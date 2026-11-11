// @ts-check
/**
 * Game outcomes. An outcome is 'white' | 'black' | 'draw' (the winner's colour,
 * or draw); a result label is the human string sent in `game_end` events.
 */

/**
 * 'white' → 'White wins', 'black' → 'Black wins', anything else → 'Draw'.
 * @param {unknown} outcome
 * @returns {'White wins' | 'Black wins' | 'Draw'}
 */
function resultLabel(outcome) {
    if (outcome === 'white') return 'White wins';
    if (outcome === 'black') return 'Black wins';
    return 'Draw';
}

/**
 * Outcome from a client-supplied result string: contains "white" (any case) →
 * 'white', else contains "black" → 'black', else 'draw'. A nullish input is a
 * draw; a non-string input throws, as the original inline code did.
 * @param {string | null | undefined} resultText
 * @returns {'white' | 'black' | 'draw'}
 */
function parseOutcome(resultText) {
    if (resultText?.toLowerCase().includes('white')) return 'white';
    if (resultText?.toLowerCase().includes('black')) return 'black';
    return 'draw';
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

module.exports = { resultLabel, parseOutcome, opponentColor, sideToColor, colorOfPlayer, playerIdOf, winnerIdFor };
