// Reading the server's acknowledgement of a client emit (NODE-13). Every game-server handler
// acks `{ ok: true }` or `{ ok: false, error: <code> }` (server/src/sockets/wrap.js).
//
// `emitWithAck` is the one place that waits for an ack: it gives up after ACK_TIMEOUT_MS and,
// for an event that is safe to send twice, tries ONCE more (ACK_POLICY). An event that is not
// safe to repeat (a move, a resignation, a chat line, a challenge) is never re-sent: the
// timeout is reported as `ack_timeout`, which the caller shows like any other refusal
// (docs/fixes/DECISIONS.md F-065).

export interface SocketAck {
    ok: boolean;
    error?: string;
}

const FALLBACK_CODE = 'internal_error';
const FALLBACK_MESSAGE = 'Something went wrong on the server. Please try again.';

/** How long to wait for the server's ack before giving up on one attempt. */
export const ACK_TIMEOUT_MS = 8_000;
/** The code a caller receives when the server never answered. */
export const ACK_TIMEOUT_CODE = 'ack_timeout';

/** What a player is told for each reason the server can give. */
const MESSAGES: Readonly<Record<string, string>> = {
    game_not_active: 'The game is already over.',
    game_not_found: 'This game no longer exists.',
    not_a_player: 'Only the players of this game can do that.',
    not_your_turn: 'It is not your turn.',
    illegal_move: 'That move is not legal.',
    time_expired: 'Your time ran out before the move arrived.',
    invalid_time_control: 'That time control is not available.',
    no_pending_request: 'That request has expired.',
    invalid_payload: 'The server did not accept that request.',
    invalid_target: 'You cannot challenge yourself.',
    profile_not_found: 'Your profile could not be found. Please sign in again.',
    rate_limited: 'Too many requests. Please wait a moment and try again.',
    [ACK_TIMEOUT_CODE]: 'The server did not answer. Check your connection and try again.',
};

/** A sentence for a rejection code; unknown codes get a generic message. */
export function rejectionMessage(code: string): string {
    return MESSAGES[code] ?? FALLBACK_MESSAGE;
}

const isRejection = (value: unknown): value is SocketAck =>
    typeof value === 'object' && value !== null && (value as SocketAck).ok === false;

/** An ack callback that calls `handler(code)` only when the server refused the request. */
export function onRejected(handler: (code: string) => void): (ack?: unknown) => void {
    return (ack) => {
        if (isRejection(ack)) handler(ack.error ?? FALLBACK_CODE);
    };
}

/**
 * How an event may be repeated when its ack does not arrive.
 * - `retryOnce`: sending it twice has the effect of sending it once (the server ignores the
 *   repeat), so one more attempt is safe.
 * - `doneOnRetry`: codes that, on the repeat, only mean the first attempt already went through
 *   (a second decline of the same challenge finds nothing pending).
 */
interface RetryRule {
    retryOnce: boolean;
    doneOnRetry?: readonly string[];
}

/** Events not listed are never repeated. */
export const ACK_POLICY: Readonly<Record<string, RetryRule>> = {
    // Idempotent on the server: a player queued from this socket stays queued once; leaving
    // twice leaves once; joining a room twice is joining it.
    join_queue: { retryOnce: true },
    leave_queue: { retryOnce: true },
    join_game: { retryOnce: true },
    spectate_game: { retryOnce: true },
    // The answer consumes the pending request: a repeat that finds nothing means "done".
    challenge_decline: { retryOnce: true, doneOnRetry: ['no_pending_request'] },
    rematch_decline: { retryOnce: true, doneOnRetry: ['no_pending_request'] },
    // Not idempotent: a repeat would be a second move, message or notification, or would be
    // refused after the first one started a game. Never re-sent.
    make_move: { retryOnce: false },
    resign: { retryOnce: false },
    send_message: { retryOnce: false },
    challenge_request: { retryOnce: false },
    challenge_accept: { retryOnce: false },
    rematch_request: { retryOnce: false },
    rematch_accept: { retryOnce: false },
};

const NO_RETRY: RetryRule = { retryOnce: false };

/** The part of a socket.io client socket this module needs. */
export interface AckSocket {
    emit: (event: string, ...args: unknown[]) => unknown;
}

export interface AckHandlers {
    /** The server accepted the request. */
    onAccepted?: () => void;
    /** The server refused it (its code), or never answered (`ack_timeout`). */
    onRejected: (code: string) => void;
    /** Per call, for tests; default ACK_TIMEOUT_MS. */
    timeoutMs?: number;
}

/** Settle exactly once, whichever attempt answers first. `null` means accepted. */
function settler(handlers: AckHandlers): (code: string | null) => void {
    let settled = false;
    return (code) => {
        if (settled) return;
        settled = true;
        if (code === null) handlers.onAccepted?.();
        else handlers.onRejected(code);
    };
}

/**
 * Emit `event` and wait for its ack, with a timeout and the retry rule of ACK_POLICY.
 * A late ack of an attempt that timed out still counts while the call is unsettled.
 */
export function emitWithAck(socket: AckSocket, event: string, payload: unknown, handlers: AckHandlers): void {
    const rule = ACK_POLICY[event] ?? NO_RETRY;
    const timeoutMs = handlers.timeoutMs ?? ACK_TIMEOUT_MS;
    const settle = settler(handlers);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (code: string | null) => {
        timers.forEach(clearTimeout);
        settle(code);
    };

    const attempt = (isRetry: boolean) => {
        timers.push(
            setTimeout(() => {
                if (!isRetry && rule.retryOnce) attempt(true);
                else finish(ACK_TIMEOUT_CODE);
            }, timeoutMs),
        );
        socket.emit(event, payload, (ack?: unknown) => {
            if (!isRejection(ack)) return finish(null);
            const code = ack.error ?? FALLBACK_CODE;
            finish(isRetry && rule.doneOnRetry?.includes(code) ? null : code);
        });
    };
    attempt(false);
}
