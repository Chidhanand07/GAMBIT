// @ts-check
/**
 * Socket.IO handshake authentication (NODE-10). Identity comes only from
 * `socket.handshake.auth.token`, verified once per connection and stored in
 * `socket.data.userId`. There is no `authenticate` event, and no handler reads
 * a user id from a payload. Any failure rejects the connection (SEC-09).
 */

/** Supabase access tokens are ~1 KB; anything far larger is not a token. */
const MAX_TOKEN_LENGTH = 8192;
const UNAUTHORIZED = 'unauthorized';

/**
 * @param {unknown} auth `socket.handshake.auth`
 * @returns {string | null}
 */
function tokenFrom(auth) {
    const token = /** @type {{ token?: unknown } | undefined} */ (auth)?.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
    return token;
}

/**
 * @param {object} deps
 * @param {(token: string) => Promise<string | null>} deps.verifyToken user id, or null when invalid
 * @returns {(socket: { handshake: { auth: unknown }, data: Record<string, unknown> },
 *   next: (err?: Error) => void) => Promise<void>}
 */
function createHandshakeAuth({ verifyToken }) {
    return async function authenticateHandshake(socket, next) {
        const token = tokenFrom(socket.handshake.auth);
        if (!token) return next(new Error(UNAUTHORIZED));
        try {
            const userId = await verifyToken(token);
            if (!userId) return next(new Error(UNAUTHORIZED));
            socket.data.userId = userId;
            next();
        } catch (error) {
            console.error('[socket] token verification failed:', /** @type {Error} */ (error).message);
            next(new Error(UNAUTHORIZED));
        }
    };
}

module.exports = { createHandshakeAuth };
