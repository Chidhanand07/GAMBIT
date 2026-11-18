// @ts-check
/**
 * Spectator counting rules (ADR F-130). Pure: no Redis, no sockets.
 *
 * Every spectating connection is one member `<userId>:<socketId>` of the game's
 * spectator set, so two tabs of one viewer are two members; the count shown
 * ("N watching") is the number of distinct viewers.
 */

/** A member with no heartbeat for this long is gone (its instance crashed). */
const SPECTATOR_TTL_MS = 60_000;
/** How often an instance refreshes its own spectators and prunes the lapsed ones. */
const SPECTATOR_HEARTBEAT_MS = 20_000;
/** Most game ids one `spectator_counts` request may ask about (the lobby lists at most 20). */
const MAX_COUNT_REQUEST = 20;

const SEPARATOR = ':';

/**
 * @param {string} userId
 * @param {string} socketId
 * @returns {string}
 */
function spectatorMember(userId, socketId) {
    return `${userId}${SEPARATOR}${socketId}`;
}

/**
 * Distinct viewers among the members of one game's set.
 * @param {readonly string[]} members
 * @returns {number}
 */
function watcherCount(members) {
    const viewers = new Set(members.map((m) => m.slice(0, Math.max(0, m.indexOf(SEPARATOR)))));
    return viewers.size;
}

module.exports = { SPECTATOR_TTL_MS, SPECTATOR_HEARTBEAT_MS, MAX_COUNT_REQUEST, spectatorMember, watcherCount };
