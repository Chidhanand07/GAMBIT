// @ts-check
/**
 * Socket.IO server options and per-connection handler registration.
 */
// The CommonJS export is callable (`socketIo(server, opts)`); the cast tells @ts-check so.
const socketIo = /** @type {(srv: import('http').Server, opts: object) => import('socket.io').Server} */ (
    /** @type {unknown} */ (require('socket.io'))
);
const { createHandshakeAuth } = require('./auth');
const { registerSessionHandlers } = require('./handlers/session');
const { registerLobbyHandlers } = require('./handlers/lobby');
const { registerGameHandlers } = require('./handlers/game');
const { registerChatHandlers } = require('./handlers/chat');
const { registerSocialHandlers } = require('./handlers/social');

/**
 * The Socket.IO server. The handshake is refused for a browser origin that is
 * not on the allow-list (`allowRequest`); CORS headers use the same policy
 * (NODE-09, S13).
 * @param {import('http').Server} server
 * @param {() => import('../http/app').OriginPolicy} originPolicy
 * @returns {import('socket.io').Server}
 */
function createSocketServer(server, originPolicy) {
    return socketIo(server, {
        cors: {
            origin: (/** @type {string | undefined} */ origin, /** @type {Function} */ callback) =>
                callback(null, Boolean(origin && originPolicy().isAllowed(origin))),
            credentials: true,
        },
        allowRequest: (/** @type {import('http').IncomingMessage} */ req, /** @type {Function} */ callback) =>
            callback(null, originPolicy().allowsRequest(req.headers.origin)),
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
 * @property {(token: string) => Promise<string | null>} verifyToken access token → user id (null when invalid)
 * @property {(token: string) => number} tokenDeadline when a socket opened with the token must be closed
 */

/**
 * Authenticate every handshake, then register the event handlers on each
 * accepted connection.
 * @param {import('socket.io').Server} io
 * @param {SocketDeps} deps
 */
function registerSocketHandlers(io, deps) {
    io.use(createHandshakeAuth({ verifyToken: deps.verifyToken, tokenDeadline: deps.tokenDeadline }));
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
