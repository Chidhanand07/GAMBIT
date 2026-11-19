// @ts-check
/**
 * The players' stored gameplay switches, as the game actions need them (ADR F-166):
 * "Allow takeback requests" (`user_preferences.allow_takebacks`) and "Premoves"
 * (`user_preferences.premoves`), read on the server through the preferences port
 * (B3, F-146). Nothing a client sends decides them.
 *
 * The port fails closed: a player whose preferences cannot be read has both switches off.
 * Without a port (unit tests that wire no preferences) every switch is on, as B3 does
 * for spectators (F-140); the production server always passes one.
 */
const { opponentColor } = require('../domain/result');

/**
 * @typedef {{ premoves: boolean, allowTakebacks: boolean }} GameplaySwitches
 * @typedef {{ gameplayOf: (userIds: string[]) => Promise<Map<string, GameplaySwitches>> }} GameplayPort
 * @typedef {'white' | 'black'} Color
 */

/** @type {Readonly<GameplaySwitches>} */
const UNWIRED = Object.freeze({ premoves: true, allowTakebacks: true });

/**
 * @param {Partial<GameplayPort> | undefined} preferences
 * @param {string} userId
 * @returns {Promise<GameplaySwitches>}
 */
async function switchesOf(preferences, userId) {
    if (!preferences?.gameplayOf) return UNWIRED;
    return (await preferences.gameplayOf([userId])).get(userId) ?? { premoves: false, allowTakebacks: false };
}

/**
 * Whether each player of `game` lets the opponent ask for takebacks: `{ white, black }`.
 * @param {Partial<GameplayPort> | undefined} preferences
 * @param {{ whiteId?: string | null, blackId?: string | null }} game
 * @returns {Promise<Record<Color, boolean>>}
 */
async function takebackPrefsOf(preferences, game) {
    const ids = [game.whiteId, game.blackId].filter((id) => typeof id === 'string');
    if (!preferences?.gameplayOf) return { white: true, black: true };
    const prefs = await preferences.gameplayOf(/** @type {string[]} */ (ids));
    const allows = (/** @type {string | null | undefined} */ id) => Boolean(id && prefs.get(id)?.allowTakebacks);
    return { white: allows(game.whiteId), black: allows(game.blackId) };
}

/**
 * Does the opponent of `color` in `game` allow takeback requests?
 * @param {Partial<GameplayPort> | undefined} preferences
 * @param {{ whiteId?: string | null, blackId?: string | null }} game
 * @param {Color} color the asking side
 */
async function opponentAllowsTakebacks(preferences, game, color) {
    return (await takebackPrefsOf(preferences, game))[opponentColor(color)];
}

/**
 * The players' takeback switches for a (re)joining client's `game_state_sync`: only for an active
 * game, and only when preferences are wired (otherwise the sync carries none).
 * @param {Partial<GameplayPort> | undefined} preferences
 * @param {{ status?: string, whiteId?: string | null, blackId?: string | null }} game
 * @returns {Promise<Record<Color, boolean> | undefined>}
 */
async function syncedTakebackPrefs(preferences, game) {
    if (!preferences?.gameplayOf || game.status !== 'active') return undefined;
    return takebackPrefsOf(preferences, game);
}

module.exports = { switchesOf, takebackPrefsOf, opponentAllowsTakebacks, syncedTakebackPrefs };
