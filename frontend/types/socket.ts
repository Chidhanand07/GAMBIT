// Socket.io event payloads between the pages and server/server.js + server/services/*.js.
// Shapes describe what is actually sent today (including known quirks), not an ideal
// protocol. Usable as `Socket<ServerToClientEvents, ClientToServerEvents>` from socket.io-client.
import type { Game, MoveLogEntry, PlayerColor } from './game';
import type { Profile } from './profile';
import type { TimeControl } from './timeControl';

type ChallengeColor = PlayerColor | 'random';

// ── client → server ──────────────────────────────────────────────────────────

export interface JoinQueuePayload {
    /** The lobby sends `{ id }` or, from the custom-time button, the whole profile. Only `id` is read. */
    user: Pick<Profile, 'id'> & Partial<Profile>;
    time_control: TimeControl;
    increment: number;
    /** Omitted by the custom-time button; the server defaults it to true. */
    is_rated?: boolean;
}

export interface MakeMovePayload {
    game_id: string;
    from: string;
    to: string;
    promotion?: string;
    fen: string;
    san: string;
    captured: boolean;
    /**
     * UCI move the server validates against the engine. The game page never sends it,
     * so engine validation is skipped and the client FEN is trusted.
     */
    move?: string;
}

export interface SendMessagePayload {
    game_id: string;
    from: string;
    text: string;
    /** What the server persists as `messages.content`; never sent by the client (known bug). */
    message?: string;
}

export interface GameEndPayload {
    game_id: string;
    /** 'White wins' | 'Black wins' | 'Draw'; the server only checks for 'white'/'black' substrings. */
    result: string;
    reason: string;
    white_id?: string | null;
    black_id?: string | null;
    is_rated?: boolean | null;
    time_control?: TimeControl;
}

/** Fields come from optional chains in the game page and may be undefined. */
export interface RematchRequestPayload {
    from_user_id?: string;
    to_user_id?: string | null;
    from_username?: string;
    time_control: TimeControl;
    is_rated: boolean;
}

export interface RematchAcceptPayload {
    /** The original requester (the opponent). */
    from_user_id?: string | null;
    to_user_id?: string;
    time_control: TimeControl;
    is_rated: boolean;
}

export interface RematchDeclinePayload {
    to_user_id?: string | null;
    by_username?: string;
}

export interface ChallengeRequestPayload {
    from_user_id: string;
    to_user_id: string;
    from_username: string;
    time_control: TimeControl;
    is_rated: boolean;
    color: ChallengeColor;
}

export interface ChallengeAcceptPayload {
    from_user_id: string;
    to_user_id: string;
    time_control: TimeControl;
    is_rated: boolean;
    /** Server reads this as the challenger's colour. */
    color: ChallengeColor;
}

export interface ChallengeDeclinePayload {
    from_user_id: string;
    by_username: string;
}

export interface ClientToServerEvents {
    /** Raw user id; the server trusts it (known bug). */
    authenticate: (userId: string) => void;
    join_queue: (payload: JoinQueuePayload) => void;
    leave_queue: (userId: string | undefined) => void;
    join_game: (gameId: string) => void;
    /** Handled by the server; no page emits it today. */
    spectate_game: (gameId: string) => void;
    make_move: (payload: MakeMovePayload) => void;
    send_message: (payload: SendMessagePayload) => void;
    game_end: (payload: GameEndPayload) => void;
    rematch_request: (payload: RematchRequestPayload) => void;
    rematch_accept: (payload: RematchAcceptPayload) => void;
    rematch_decline: (payload: RematchDeclinePayload) => void;
    challenge_request: (payload: ChallengeRequestPayload) => void;
    challenge_accept: (payload: ChallengeAcceptPayload) => void;
    challenge_decline: (payload: ChallengeDeclinePayload) => void;
}

// ── server → client ──────────────────────────────────────────────────────────

/** Matchmaking queue entry (server/services/matchmaking.js), sent as `match_found.opponent`. */
export interface QueueEntry {
    user_id: string;
    username: string;
    rating: number;
    isProvisional: boolean;
    time_control: TimeControl;
    increment: number;
    isRated: boolean;
    joined_at: number;
    socketId: string;
}

export interface MatchFoundPayload extends Game {
    color: PlayerColor;
    opponent: QueueEntry;
}

export interface ClockSyncPayload {
    whiteMs: number;
    blackMs: number;
    /** Set by the global ticker; absent on the reconnect sync in `authenticate`. */
    serverTs?: number;
}

export interface GameStateSyncPayload {
    fen: string;
    moveLog: MoveLogEntry[];
    whiteMs: number;
    blackMs: number;
    activeSide: 'w' | 'b';
    clockActive: boolean;
    whiteId: string;
    blackId: string;
}

/** The mover's `make_move` payload echoed to the room with server clocks (fen may be the engine's). */
export interface MoveMadePayload extends MakeMovePayload {
    whiteMs: number;
    blackMs: number;
}

/** The sender's `send_message` payload echoed with the server-verified sender id. */
export interface ChatMessagePayload extends SendMessagePayload {
    from_user_id: string;
}

/**
 * Server-built on join/clock expiry/abandonment; on resign/checkmate it is the
 * client's `game_end` payload echoed with server player ids.
 */
export interface GameEndBroadcast extends GameEndPayload {
    white_id: string;
    black_id: string;
}

export interface RatingChange {
    oldRating: number;
    newRating: number;
    change: number;
}

export interface RatingUpdatedPayload {
    white: RatingChange;
    black: RatingChange;
}

export interface GameIdPayload {
    game_id: string;
}

export interface ServerToClientEvents {
    authenticated: (payload: { userId: string }) => void;
    queue_joined: (payload: { position: number; estimated_wait: number }) => void;
    /** Broadcast to every socket. */
    queue_status: (payload: { players_searching: number }) => void;
    match_found: (payload: MatchFoundPayload) => void;
    /** Emitted by POST /api/games/join/:token with the joined game row. */
    game_start: (payload: Game) => void;
    game_state_sync: (payload: GameStateSyncPayload) => void;
    clock_sync: (payload: ClockSyncPayload) => void;
    move_made: (payload: MoveMadePayload) => void;
    chat_message: (payload: ChatMessagePayload) => void;
    game_end: (payload: GameEndBroadcast) => void;
    rating_updated: (payload: RatingUpdatedPayload) => void;
    rematch_request: (payload: RematchRequestPayload) => void;
    rematch_ready: (payload: GameIdPayload) => void;
    rematch_declined: () => void;
    challenge_request: (payload: ChallengeRequestPayload) => void;
    challenge_ready: (payload: GameIdPayload) => void;
    challenge_declined: (payload: { by: string }) => void;
    opponent_disconnected: (payload: { userId: string; timeoutSeconds: number }) => void;
    opponent_reconnected: (payload: { userId: string }) => void;
}
