// @ts-check
/**
 * The time-control model: base minutes + increment seconds, written "M+S"
 * (SOLID-03). Limits, category thresholds and lobby presets come from one
 * definition, `timeControl.data.json`, a copy of `shared/time-control.json`
 * that the web app carries too (see scripts/sync-shared.js).
 *
 * Two kinds of input, two functions:
 *  - `parseTimeControl` is strict, for values that arrive from a client. An
 *    invalid value is null; nothing is silently replaced by a default.
 *  - `timeControlOf` is for values the server stored itself (Redis, the games
 *    table). A legacy or damaged value still has to produce a playable clock,
 *    so it falls back to the default.
 */
const data = require('./timeControl.data.json');

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

const { minMinutes, maxMinutes, maxIncrementSeconds } = data.limits;

/**
 * @typedef {{ minutes: number, incrementSeconds: number }} TimeControl
 * @typedef {'bullet' | 'blitz' | 'rapid' | 'classical'} Category
 */

/** @type {TimeControl} */
const DEFAULT_TIME_CONTROL = Object.freeze({ minutes: data.defaultMinutes, incrementSeconds: 0 });

/** @type {Category[]} */
const CATEGORY_IDS = data.categories.map((c) => /** @type {Category} */ (c.id));

/** "M" or "M+S": digits only, no sign, no spaces, no decimals. */
const PATTERN = /^(\d{1,4})(?:\+(\d{1,3}))?$/;

/** @param {unknown} n */
const isMinutes = (n) =>
    Number.isInteger(n) && /** @type {number} */ (n) >= minMinutes && /** @type {number} */ (n) <= maxMinutes;
/** @param {unknown} n */
const isIncrement = (n) =>
    Number.isInteger(n) && /** @type {number} */ (n) >= 0 && /** @type {number} */ (n) <= maxIncrementSeconds;

/**
 * The text form's parts: [minutes, increment or undefined], or null.
 * @param {unknown} value
 * @returns {[number, number | undefined] | null}
 */
function readParts(value) {
    if (typeof value === 'number') return [value, undefined];
    if (typeof value !== 'string') return null;
    const match = PATTERN.exec(value);
    if (!match) return null;
    return [Number(match[1]), match[2] === undefined ? undefined : Number(match[2])];
}

/**
 * Strict parse of a client-supplied time control: "10", "5+3" or a number of
 * minutes, optionally with a separate increment (older clients send the
 * increment next to a bare "10"). The increment inside the string wins.
 * @param {unknown} value
 * @param {unknown} [increment] seconds; used only when `value` carries none
 * @returns {TimeControl | null} null when anything is malformed or out of range
 */
function parseTimeControl(value, increment) {
    const parts = readParts(value);
    if (!parts) return null;
    const [minutes, ownIncrement] = parts;
    const incrementSeconds = ownIncrement ?? increment ?? 0;
    if (!isMinutes(minutes) || !isIncrement(incrementSeconds)) return null;
    return { minutes, incrementSeconds: /** @type {number} */ (incrementSeconds) };
}

/**
 * @param {unknown} value
 * @param {unknown} [increment]
 * @returns {boolean}
 */
const isValidTimeControl = (value, increment) => parseTimeControl(value, increment) !== null;

/**
 * Canonical text: "M+S", always with the increment.
 * @param {TimeControl} timeControl
 * @returns {string}
 */
function formatTimeControl({ minutes, incrementSeconds }) {
    return `${minutes}+${incrementSeconds}`;
}

/**
 * Client input → canonical text, or null when invalid.
 * @param {unknown} value
 * @param {unknown} [increment]
 * @returns {string | null}
 */
function normalizeTimeControl(value, increment) {
    const parsed = parseTimeControl(value, increment);
    return parsed ? formatTimeControl(parsed) : null;
}

/**
 * The model of a value the server stored. Anything unreadable is the default
 * (10+0), so a game always has a positive clock.
 * @param {unknown} stored
 * @returns {TimeControl}
 */
function timeControlOf(stored) {
    return parseTimeControl(stored) ?? DEFAULT_TIME_CONTROL;
}

/**
 * Category by base minutes: the first threshold the minutes fit under.
 * @param {TimeControl} timeControl
 * @returns {Category}
 */
function categoryOf({ minutes }) {
    const match = data.categories.find((c) => c.maxMinutes === null || minutes <= c.maxMinutes);
    return /** @type {Category} */ ((match ?? data.categories[data.categories.length - 1]).id);
}

/**
 * Base minutes of a stored time control.
 * @param {unknown} stored
 * @returns {number}
 */
const parseMinutes = (stored) => timeControlOf(stored).minutes;

/**
 * Increment of a stored time control, in milliseconds.
 * @param {unknown} stored
 * @returns {number}
 */
const parseIncrementMs = (stored) => timeControlOf(stored).incrementSeconds * MS_PER_SECOND;

/**
 * Each player's starting clock in milliseconds.
 * @param {unknown} stored
 * @returns {number}
 */
const initialClockMs = (stored) => timeControlOf(stored).minutes * MS_PER_MINUTE;

/**
 * The profiles column that holds the rating for this time control.
 * @param {unknown} stored
 * @returns {`rating_${Category}`}
 */
const ratingField = (stored) => `rating_${categoryOf(timeControlOf(stored))}`;

module.exports = {
    CATEGORY_IDS,
    DEFAULT_TIME_CONTROL,
    parseTimeControl,
    isValidTimeControl,
    formatTimeControl,
    normalizeTimeControl,
    timeControlOf,
    categoryOf,
    parseMinutes,
    parseIncrementMs,
    initialClockMs,
    ratingField,
};
