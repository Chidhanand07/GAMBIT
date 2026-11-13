// Reading the server's acknowledgement of a client emit (NODE-13). Every game-server handler
// acks `{ ok: true }` or `{ ok: false, error: <code> }` (server/src/sockets/wrap.js).

export interface SocketAck {
    ok: boolean;
    error?: string;
}

const FALLBACK_CODE = 'internal_error';
const FALLBACK_MESSAGE = 'Something went wrong on the server. Please try again.';

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
