// @ts-check
/**
 * Matchmaking pairing rules. Pure: time comes from an injected clock.
 */

const PROVISIONAL_GAMES = 5;
const DEFAULT_QUEUE_RATING = 1200;
const MS_PER_SECOND = 1000;

/** Provisional players can face established players rated within this band. */
const PROVISIONAL_BAND = { min: 800, max: 1400 };

/** [max seconds waited, rating radius]; past the last step the radius is 9999. */
const RADIUS_STEPS = [
    [10, 50],
    [20, 100],
    [35, 150],
    [60, 250],
    [120, 400],
];
const UNLIMITED_RADIUS = 9999;

/**
 * @typedef {object} QueueEntry
 * @property {string} user_id
 * @property {string} username
 * @property {number} rating
 * @property {boolean} isProvisional
 * @property {unknown} time_control
 * @property {unknown} increment
 * @property {boolean} isRated
 * @property {number} joined_at
 * @property {string} socketId
 */

/**
 * Rating difference a player accepts after waiting `elapsedSec` seconds.
 * @param {number} elapsedSec
 * @returns {number}
 */
function getSearchRadius(elapsedSec) {
    for (const [maxSec, radius] of RADIUS_STEPS) {
        if (elapsedSec <= maxSec) return radius;
    }
    return UNLIMITED_RADIUS;
}

/**
 * Fewer than 5 games played (missing/0/null count as 0).
 * @param {number | null | undefined} gamesPlayed
 * @returns {boolean}
 */
function isProvisional(gamesPlayed) {
    return (gamesPlayed || 0) < PROVISIONAL_GAMES;
}

/**
 * The queue record for a player. A falsy rating (0, null, undefined) becomes 1200.
 * @param {object} params
 * @param {{ id: string, username: string, rating?: number | null, games_played?: number | null }} params.user
 * @param {string} params.socketId
 * @param {unknown} params.timeControl
 * @param {unknown} params.increment
 * @param {boolean} params.isRated
 * @param {number} params.now
 * @returns {QueueEntry}
 */
function createQueueEntry({ user, socketId, timeControl, increment, isRated, now }) {
    return {
        user_id: user.id,
        username: user.username,
        rating: user.rating || DEFAULT_QUEUE_RATING,
        isProvisional: isProvisional(user.games_played),
        time_control: timeControl,
        increment,
        isRated,
        joined_at: now,
        socketId,
    };
}

/**
 * @param {{ rating: number }} entry
 * @returns {boolean}
 */
function inProvisionalBand(entry) {
    return entry.rating >= PROVISIONAL_BAND.min && entry.rating <= PROVISIONAL_BAND.max;
}

/**
 * Whether two queued players' ratings allow a game. Two provisional players
 * always match; one provisional player matches an established player rated
 * 800–1400; otherwise the difference must fit either player's radius.
 * @param {{ rating: number, isProvisional: boolean }} a
 * @param {{ rating: number, isProvisional: boolean }} b
 * @param {number} radiusA
 * @param {number} radiusB
 * @returns {boolean}
 */
function isRatingCompatible(a, b, radiusA, radiusB) {
    if (a.isProvisional && b.isProvisional) return true;
    if (a.isProvisional) return inProvisionalBand(b);
    if (b.isProvisional) return inProvisionalBand(a);
    const diff = Math.abs(a.rating - b.rating);
    return diff <= radiusA || diff <= radiusB;
}

/**
 * Sorts `entries` in place, oldest `joined_at` first, and returns the same array.
 * @template {{ joined_at: number }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
function sortByLongestWaiting(entries) {
    return entries.sort((a, b) => a.joined_at - b.joined_at);
}

/**
 * @param {{ joined_at: number }} entry
 * @param {number} now
 * @returns {number}
 */
function waitedSeconds(entry, now) {
    return (now - entry.joined_at) / MS_PER_SECOND;
}

/**
 * Same game on offer: base time AND increment (G4). The service queues the
 * canonical "M+S" text, which already carries both; the increment is compared
 * as well so entries built any other way cannot be mixed.
 * @param {{ time_control: unknown, increment: unknown }} a
 * @param {{ time_control: unknown, increment: unknown }} b
 * @returns {boolean}
 */
function sameTimeControl(a, b) {
    return a.time_control === b.time_control && a.increment === b.increment;
}

/**
 * First candidate (in the given order) with the same time control and a
 * compatible rating, or null. `clock` is read once for `player` and once per
 * candidate with a matching time control, mirroring the original loop.
 * @template {QueueEntry} T
 * @param {T} player
 * @param {T[]} candidates
 * @param {() => number} clock
 * @returns {T | null}
 */
function findOpponent(player, candidates, clock) {
    const radius = getSearchRadius(waitedSeconds(player, clock()));
    for (const other of candidates) {
        if (!sameTimeControl(player, other)) continue;
        const otherRadius = getSearchRadius(waitedSeconds(other, clock()));
        if (isRatingCompatible(player, other, radius, otherRadius)) return other;
    }
    return null;
}

module.exports = {
    getSearchRadius,
    isProvisional,
    createQueueEntry,
    isRatingCompatible,
    sortByLongestWaiting,
    sameTimeControl,
    findOpponent,
};
