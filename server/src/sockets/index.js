// @ts-check
/**
 * Socket.IO server options and per-connection handler registration.
 */
// The CommonJS export is callable (`socketIo(server, opts)`); the cast tells @ts-check so.
const socketIo = /** @type {(srv: import('http').Server, opts: object) => import('socket.io').Server} */ (
    /** @type {unknown} */ (require('socket.io'))
);
const { registerSessionHandlers } = require('./handlers/session');
const { registerLobbyHandlers } = require('./handlers/lobby');
const { registerGameHandlers } = require('./handlers/game');
const { registerChatHandlers } = require('./handlers/chat');
const { registerSocialHandlers } = require('./handlers/social');

/**
 * The Socket.IO server. Every origin is accepted with credentials (permissive
 * fallback; known issue, preserved; NODE-09).
 * @param {import('http').Server} server
 * @returns {import('socket.io').Server}
 */
function createSocketServer(server) {
    return socketIo(server, {
        cors: {
            origin: (origin, callback) => callback(null, true),
            credentials: true,
        },
        transports: ['websocket', 'polling'], // prefer WebSocket, fall back to polling
    });
}

/**
 * The connection as services see it (NODE-03: services never get the socket).
 * @param {import('socket.io').Socket} socket
 * @returns {import('../services/emitter').ClientPort}
 */
function clientOf(socket) {
    return {
        id: socket.id,
        join: (room) => {
            socket.join(room);
        },
        emit: (event, ...args) => {
            socket.emit(event, ...args);
        },
    };
}

/**
 * @typedef {object} SocketDeps
 * @property {import('./sessionRegistry').SessionRegistry} sessions
 * @property {import('./handlers/session').SessionHandlerDeps['matchmaking'] &
 *   Parameters<typeof registerLobbyHandlers>[1]['matchmaking']} matchmaking
 * @property {import('./handlers/session').SessionHandlerDeps['gameService'] &
 *   import('./handlers/game').GameHandlerService} gameService
 * @property {Parameters<typeof registerChatHandlers>[1]['chatService']} chatService
 * @property {import('./handlers/social').SocialHandlerService} socialService
 */

/**
 * Register every event handler on each new connection.
 * @param {import('socket.io').Server} io
 * @param {SocketDeps} deps
 */
function registerSocketHandlers(io, deps) {
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        const client = clientOf(socket);
        registerSessionHandlers(socket, client, deps);
        registerLobbyHandlers(socket, deps);
        registerGameHandlers(socket, client, deps);
        registerChatHandlers(socket, deps);
        registerSocialHandlers(socket, deps);
    });
}

module.exports = { createSocketServer, registerSocketHandlers };
