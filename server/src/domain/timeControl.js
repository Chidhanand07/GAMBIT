// @ts-check
/**
 * Time-control parsing. A time control is a string like "10" or "3+2"
 * (minutes, optional "+increment" in seconds). Numbers are accepted too,
 * because callers pass whatever arrived from the client or the DB.
 */

const DEFAULT_MINUTES = 10;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

const BULLET_MAX_MINUTES = 2;
const BLITZ_MAX_MINUTES = 5;
const RAPID_MAX_MINUTES = 60;

/**
 * Base minutes of a time control. Uses `parseInt(tc) || 10`, so "0", "", null,
 * undefined and non-numeric strings all fall back to 10.
 * @param {unknown} timeControl
 * @returns {number}
 */
function parseMinutes(timeControl) {
    return parseInt(/** @type {string} */ (timeControl)) || DEFAULT_MINUTES;
}

/**
 * Increment in milliseconds: the part after "+", in seconds. No "+" (or a
 * non-numeric increment) means 0.
 * @param {unknown} timeControl
 * @returns {number}
 */
function parseIncrementMs(timeControl) {
    const parts = String(timeControl || '0').split('+');
    return (parseInt(parts[1]) || 0) * MS_PER_SECOND;
}

/**
 * Each player's starting clock in milliseconds.
 * @param {unknown} timeControl
 * @returns {number}
 */
function initialClockMs(timeControl) {
    return parseMinutes(timeControl) * MS_PER_MINUTE;
}

/**
 * The profiles column that holds the rating for this time control.
 * @param {unknown} timeControl
 * @returns {'rating_bullet' | 'rating_blitz' | 'rating_rapid' | 'rating_classical'}
 */
function ratingField(timeControl) {
    const mins = parseMinutes(timeControl);
    if (mins <= BULLET_MAX_MINUTES) return 'rating_bullet';
    if (mins <= BLITZ_MAX_MINUTES) return 'rating_blitz';
    if (mins <= RAPID_MAX_MINUTES) return 'rating_rapid';
    return 'rating_classical';
}

module.exports = { parseMinutes, parseIncrementMs, initialClockMs, ratingField };
