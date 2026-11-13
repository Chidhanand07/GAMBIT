// The realtime (Socket.IO) connection to the game server. Identity is proven in the
// handshake: `auth` runs on every connect *and* reconnect attempt, so each one carries the
// current Supabase access token (NODE-10). There is no `authenticate` event.
import { io, type Socket } from 'socket.io-client';

/** socket.io does not retry a handshake the server refused; try again after a token refresh. */
export const UNAUTHORIZED_RETRY_MS = 5_000;
const RECONNECTION_DELAY_MS = 1_000;
const RECONNECTION_DELAY_MAX_MS = 8_000;
const UNAUTHORIZED = 'unauthorized';
/** socket.io's reason for a disconnect the server initiated. */
const SERVER_DISCONNECT = 'io server disconnect';

export interface GameSocketOptions {
    url: string;
    /** The signed-in user's current access token, or null when there is no session. */
    getToken: () => Promise<string | null>;
}

export interface GameSocketConnection {
    socket: Socket;
    /** Disconnect and cancel any pending retry. */
    close: () => void;
}

type HandshakeAuth = { token?: string };

async function handshakeAuth(getToken: GameSocketOptions['getToken']): Promise<HandshakeAuth> {
    try {
        const token = await getToken();
        return token ? { token } : {};
    } catch {
        // No token: the server refuses the handshake, which is the safe outcome.
        return {};
    }
}

export function createGameSocket({ url, getToken }: GameSocketOptions): GameSocketConnection {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const socket = io(url, {
        autoConnect: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: RECONNECTION_DELAY_MS,
        reconnectionDelayMax: RECONNECTION_DELAY_MAX_MS,
        transports: ['websocket', 'polling'],
        auth: (cb) => {
            void handshakeAuth(getToken).then(cb);
        },
    });

    socket.on('connect_error', (err: Error) => {
        if (err.message !== UNAUTHORIZED || retryTimer) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            socket.connect();
        }, UNAUTHORIZED_RETRY_MS);
    });
    socket.on('disconnect', (reason: string) => {
        // The server ends a connection when its access token expires (it says `token_expired`
        // first). socket.io never reconnects after a server-side disconnect, so do it here:
        // the handshake asks for the token again and gets the refreshed one.
        if (reason === SERVER_DISCONNECT && !closed) socket.connect();
    });

    return {
        socket,
        close: () => {
            closed = true;
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            socket.disconnect();
        },
    };
}
