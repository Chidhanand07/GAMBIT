// @ts-check
/**
 * A socket does not outlive the access token it was opened with (NODE-10).
 * The handshake records the token's deadline in `socket.data.tokenExpiresAt`;
 * at that moment the server tells the client why and closes the connection.
 * The client reconnects, and its handshake carries a fresh token.
 */

const TOKEN_EXPIRED = 'token_expired';

/** How long a client gets to come back with a fresh token before it counts as having left. */
const TOKEN_RECONNECT_GRACE_MS = 5000;

/**
 * Close `socket` when its token's deadline passes.
 * @param {{ data: Record<string, any>, emit: (event: string, payload: object) => unknown,
 *   disconnect: (close?: boolean) => unknown }} socket
 * @param {() => number} [now]
 * @returns {() => void} cancel; call it when the socket disconnects first
 */
function watchTokenExpiry(socket, now = () => Date.now()) {
    // No recorded deadline is treated as "expired now" (SEC-09).
    const deadline = typeof socket.data.tokenExpiresAt === 'number' ? socket.data.tokenExpiresAt : now();
    const timer = setTimeout(
        () => {
            // Marks the disconnect that follows as ours, so it is not mistaken for the player leaving.
            socket.data.tokenExpired = true;
            socket.emit(TOKEN_EXPIRED, { reason: TOKEN_EXPIRED });
            socket.disconnect(true);
        },
        Math.max(0, deadline - now()),
    );
    return () => clearTimeout(timer);
}

module.exports = { watchTokenExpiry, TOKEN_EXPIRED, TOKEN_RECONNECT_GRACE_MS };
