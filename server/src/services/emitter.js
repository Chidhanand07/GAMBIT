// @ts-check
/**
 * The one port services use to push Socket.IO events (SOLID-06, NODE-03).
 * Services never see `io` or a `socket`: they get an Emitter for rooms and a
 * Client (see `ClientPort`) for the connection that sent the event.
 */

/**
 * @typedef {object} Emitter
 * @property {(room: string, event: string, ...args: unknown[]) => void} toRoom
 *   emit to every socket in `room` (`io.to(room).emit(...)`).
 * @property {(event: string, ...args: unknown[]) => void} toAll emit to every socket (`io.emit`).
 *
 * Arguments are forwarded as given: an event emitted without a payload stays
 * payload-less on the wire (passing `undefined` would arrive as `null`).
 */

/**
 * @typedef {object} ClientPort the connection that sent the current event.
 * @property {string} id socket id.
 * @property {(room: string) => void} join add this connection to a room.
 * @property {(event: string, ...args: unknown[]) => void} emit emit to this connection only.
 */

/**
 * @typedef {object} IoLike
 * @property {(room: string) => { emit: (event: string, ...args: unknown[]) => unknown }} to
 * @property {(event: string, ...args: unknown[]) => unknown} emit
 */

/**
 * Emitter over a Socket.IO server; each call is exactly `io.to(room).emit(...)`
 * or `io.emit(...)`, made when the service emits.
 * @param {IoLike} io
 * @returns {Emitter}
 */
function createIoEmitter(io) {
    return {
        toRoom: (room, event, ...args) => {
            io.to(room).emit(event, ...args);
        },
        toAll: (event, ...args) => {
            io.emit(event, ...args);
        },
    };
}

/** @param {string} gameId */
const gameRoom = (gameId) => `game_${gameId}`;

/** @param {string} userId */
const userRoom = (userId) => `user_${userId}`;
/**
 * The sockets of one player that are at one game's board, on every instance (MULTI-INSTANCE).
 * @param {string} gameId
 * @param {string} userId
 */
const playerRoom = (gameId, userId) => `player:${gameId}:${userId}`;

module.exports = { createIoEmitter, gameRoom, userRoom, playerRoom };
