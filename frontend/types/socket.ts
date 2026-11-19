// Socket.io event payloads between the pages and server/server.js + server/services/*.js.
// Identity is not part of any payload: the server takes it from the handshake token
// (see lib/socket/connection.ts).
// Shapes describe what is actually sent today (including known quirks), not an ideal
// protocol. Usable as `Socket<ServerToClientEvents, ClientToServerEvents>` from socket.io-client.
import type { Game, MoveLogEntry, PlayerColor } from './game';
import type { Profile } from './profile';
import type { TimeControl } from './timeControl';
import type {
    DrawDeclinedPayload,
    DrawOfferedPayload,
    PremoveDiscardedPayload,
    TakebackAppliedPayload,
    TakebackDeclinedPayload,
    TakebackRequestedPayload,
} from './gameRequests';

export type * from './gameRequests';

type ChallengeColor = PlayerColor | 'random';

// ── client → server ──────────────────────────────────────────────────────────

export interface JoinQueuePayload {
    /** Still sent by the lobby but ignored: the server queues the handshake-verified user. */
    user: Pick<Profile, 'id'> & Partial<Profile>;
    time_control: TimeControl;
    increment: number;
    /** Omitted by the custom-time button; the server defaults it to true. */
    is_rated?: boolean;
}

/**
 * A move is only its squares (+ promotion piece). The server validates it against its own
 * position and computes the FEN, SAN, UCI and capture flag; anything else sent here is dropped.
 */
export interface MakeMovePayload {
    game_id: string;
    from: string;
    to: string;
    /** The page sends 'q' on every move; the server reads it only when the move promotes. */
    promotion?: string;
}

export interface SendMessagePayload {
    game_id: string;
    /** Display name shown next to the message; identity is the server's `from_user_id`. */
    from: string;
    /** 1–500 characters after trimming; stored and relayed by the server. */
    text: string;
}

/** Resign this player's side of the game. The server names the winner. */
export interface ResignPayload {
    game_id: string;
}

/**
 * Fields come from optional chains in the game page and may be undefined.
 * `from_user_id` is added by the server (the verified sender) before it relays the request.
 */
export interface RematchRequestPayload {
    from_user_id?: string;
    to_user_id?: string | null;
    from_username?: string;
    time_control: TimeControl;
    is_rated: boolean;
}

/** Answers name only the requester; the server uses the terms it stored with the request. */
export interface RematchAcceptPayload {
    /** The original requester (the opponent). */
    from_user_id?: string | null;
}

export interface RematchDeclinePayload {
    /** The original requester (the opponent), who is told about the decline. */
    from_user_id?: string | null;
}

export interface ChallengeRequestPayload {
    /** Set by the server (the verified sender) on the relayed event; not sent by the client. */
    from_user_id: string;
    to_user_id: string;
    from_username: string;
    time_control: TimeControl;
    is_rated: boolean;
    color: ChallengeColor;
}

/** Names only the challenger; time control, rated flag and colours come from the stored challenge. */
export interface ChallengeAcceptPayload {
    from_user_id: string;
}

export interface ChallengeDeclinePayload {
    from_user_id: string;
    by_username: string;
}

export interface ClientToServerEvents {
    join_queue: (payload: JoinQueuePayload) => void;
    /** The argument is ignored: the server removes the handshake-verified user. */
    leave_queue: (userId?: string) => void;
    join_game: (gameId: string) => void;
    /** Handled by the server; no page emits it today. */
    spectate_game: (gameId: string) => void;
    /** Stop watching a game (the game page closed); a player's socket is not affected (F-130). */
    leave_game: (gameId: string) => void;
    /** How many watch each game, acked as `{ ok, counts }` (F-130). */
    spectator_counts: (payload: { game_ids: string[] }) => void;
    make_move: (payload: MakeMovePayload) => void;
    send_message: (payload: SendMessagePayload) => void;
    /** There is no client `game_end`: results are decided by the server. */
    resign: (payload: ResignPayload) => void;
    rematch_request: (payload: RematchRequestPayload) => void;
    rematch_accept: (payload: RematchAcceptPayload) => void;
    rematch_decline: (payload: RematchDeclinePayload) => void;
    challenge_request: (payload: ChallengeRequestPayload) => void;
    challenge_accept: (payload: ChallengeAcceptPayload) => void;
    challenge_decline: (payload: ChallengeDeclinePayload) => void;
    draw_offer: (payload: GameIdPayload) => void;
    draw_accept: (payload: GameIdPayload) => void;
    draw_decline: (payload: GameIdPayload) => void;
    takeback_request: (payload: GameIdPayload) => void;
    takeback_accept: (payload: GameIdPayload) => void;
    takeback_decline: (payload: GameIdPayload) => void;
    premove_set: (payload: MakeMovePayload) => void;
    premove_cancel: (payload: GameIdPayload) => void;
}

// ── server → client ──────────────────────────────────────────────────────────

/** What `match_found` tells a player about the opponent: public facts only. */
export interface MatchOpponent {
    user_id: string;
    username: string;
    rating: number;
    isProvisional: boolean;
}

export interface MatchFoundPayload extends Game {
    color: PlayerColor;
    opponent: MatchOpponent;
}

/** The server paired us but could not create the game; we are out of the queue. */
export interface MatchFailedPayload {
    reason: 'game_creation_failed';
}

export interface ClockSyncPayload {
    whiteMs: number;
    blackMs: number;
    /** Set by the global ticker; absent on the sync sent when a player reconnects. */
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
    /** Viewers watching a live game (F-130); absent when the server could not count them. */
    spectators?: number;
    /** Present only while a draw offer stands (ADR F-151). */
    drawOffer?: { by: PlayerColor };
    /** Moves played when each side last offered a draw; present once anyone has offered. */
    lastDrawOfferPly?: Partial<Record<PlayerColor, number>>;
    /** Present only while a takeback request stands (ADR F-152). */
    takeback?: { by: PlayerColor; plies: number };
    /** Each player's "Allow takeback requests" setting, as declared for this game. */
    takebackPrefs?: Partial<Record<PlayerColor, boolean>>;
    /** This player's own queued premove; sent to its owner only (ADR F-153). */
    premove?: { from: string; to: string; promotion?: string };
}

/** A live game's spectator count changed (F-130). */
export interface SpectatorsChangedPayload {
    game_id: string;
    count: number;
}

/** An accepted move, broadcast to the room. Every field is computed by the server. */
export interface MoveMadePayload {
    game_id: string;
    from: string;
    to: string;
    /** Present only when the move promoted. */
    promotion?: string;
    /** UCI, e.g. "e2e4" or "a7a8q". */
    move: string;
    san: string;
    /** Position after the move. */
    fen: string;
    captured: boolean;
    /** chess.js move flags ('k'/'q' castle, 'p' promotion, 'e' en passant, …). */
    flags: string;
    whiteMs: number;
    blackMs: number;
}

/** Sent to the mover only, followed by a fresh `game_state_sync`. */
export interface MoveRejectedPayload {
    game_id: string;
    reason: 'illegal_move' | 'not_your_turn' | 'not_a_player' | 'game_not_active' | 'game_not_found';
}

/** A chat line relayed to the game room: the validated message plus the server-verified sender id. */
export interface ChatMessagePayload extends SendMessagePayload {
    from_user_id: string;
}

/**
 * The result of a game, always built by the server: after a move that ends it (checkmate,
 * stalemate, insufficient material, threefold repetition, fifty-move rule), a resignation,
 * a flag fall or an abandonment, and when joining a game that is already over.
 */
export interface GameEndBroadcast {
    game_id: string;
    /** 'White wins' | 'Black wins' | 'Draw' | 'Aborted' (a side never made its first move). */
    result: string;
    /** e.g. 'Checkmate', 'Stalemate', 'Resignation', 'Time', 'Abandonment', 'Aborted', 'Game over'. */
    reason: string;
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

/** Opponent ratings the matchmaker accepts for this player right now; both null = any rating (F-132). */
export type SearchWindow = { min: number; max: number } | { min: null; max: null };

export interface ServerToClientEvents {
    queue_joined: (payload: { position: number; estimated_wait: number; search_window?: SearchWindow }) => void;
    /** The player's rating window widened while they wait (F-132). */
    search_window: (payload: SearchWindow) => void;
    /** Broadcast to every socket. */
    queue_status: (payload: { players_searching: number }) => void;
    match_found: (payload: MatchFoundPayload) => void;
    match_failed: (payload: MatchFailedPayload) => void;
    /** Emitted by POST /api/games/join/:token with the joined game row. */
    game_start: (payload: Game) => void;
    game_state_sync: (payload: GameStateSyncPayload) => void;
    clock_sync: (payload: ClockSyncPayload) => void;
    move_made: (payload: MoveMadePayload) => void;
    move_rejected: (payload: MoveRejectedPayload) => void;
    draw_offered: (payload: DrawOfferedPayload) => void;
    draw_declined: (payload: DrawDeclinedPayload) => void;
    takeback_requested: (payload: TakebackRequestedPayload) => void;
    takeback_declined: (payload: TakebackDeclinedPayload) => void;
    takeback_applied: (payload: TakebackAppliedPayload) => void;
    premove_discarded: (payload: PremoveDiscardedPayload) => void;
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
    spectators_changed: (payload: SpectatorsChangedPayload) => void;
}
