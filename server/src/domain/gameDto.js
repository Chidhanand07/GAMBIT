// @ts-check
/**
 * What a `games` row looks like to a browser (NX-04). Built from an allow-list
 * of keys, so the invite token, its expiry and any column added later stay on
 * the server unless they are listed here. Pure.
 */

/** Columns of `games` the join page and the `game_start` listeners read. */
const GAME_KEYS = Object.freeze([
    'id',
    'white_id',
    'black_id',
    'time_control',
    'increment',
    'status',
    'is_rated',
    'started_at',
    'created_at',
]);

/** What is shown of a player on the invite page. */
const PLAYER_KEYS = Object.freeze(['username', 'avatar_url']);

/**
 * @param {Record<string, unknown>} row
 * @param {readonly string[]} keys
 * @returns {Record<string, unknown>}
 */
function pick(row, keys) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of keys) {
        if (key in row) out[key] = row[key];
    }
    return out;
}

/** @param {unknown} player */
function playerSummary(player) {
    return player && typeof player === 'object'
        ? pick(/** @type {Record<string, unknown>} */ (player), PLAYER_KEYS)
        : player;
}

/**
 * The public view of a game row (optionally with embedded `white` / `black`
 * profiles). null / undefined are returned unchanged.
 * @template {Record<string, unknown> | null | undefined} T
 * @param {T} row
 * @returns {T extends null | undefined ? T : Record<string, unknown>}
 */
function toPublicGame(row) {
    if (!row) return /** @type {any} */ (row);
    const dto = pick(row, GAME_KEYS);
    if ('white' in row) dto.white = playerSummary(row.white);
    if ('black' in row) dto.black = playerSummary(row.black);
    return /** @type {any} */ (dto);
}

module.exports = { toPublicGame };
