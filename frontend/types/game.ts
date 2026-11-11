// `public.games` / `public.moves` rows and the API shapes built from them.
import type { ProfileSummary } from './profile';
import type { TimeControl } from './timeControl';

export type GameStatus = 'waiting' | 'active' | 'completed' | 'aborted';

export type PlayerColor = 'white' | 'black';

/** Viewer's seat as returned by GET /api/games/[id] (`myColor`). */
export type SeatColor = PlayerColor | 'spectator';

/** One analysed ply written back by the engine's game review (JSONB array items). */
export interface MoveClassification {
    ply: number;
    /** UCI, e.g. "e2e4" or "e7e8q". */
    move: string;
    san: string;
    classification: string;
    accuracy: number;
    best_move: string;
    eval_white: number;
}

export interface Game {
    id: string;
    white_id: string | null;
    black_id: string | null;
    time_control: TimeControl;
    increment: number;
    status: GameStatus;
    /** Server writes 'draw' or null; the schema comment also lists 'white_wins' / 'black_wins'. */
    result: string | null;
    winner_id: string | null;
    pgn?: string | null;
    /** Current position (migration 00005); updated on every move. */
    fen?: string | null;
    final_fen?: string | null;
    white_clock_ms?: number | null;
    black_clock_ms?: number | null;
    /** Written on disconnect only (known column mismatch with *_clock_ms). */
    white_time_ms?: number | null;
    black_time_ms?: number | null;
    white_accuracy?: number | null;
    black_accuracy?: number | null;
    white_move_classifications?: MoveClassification[] | null;
    black_move_classifications?: MoveClassification[] | null;
    critical_moments?: unknown;
    invite_token?: string | null;
    invite_expires_at?: string | null;
    is_rated: boolean | null;
    spectator_count?: number | null;
    started_at?: string | null;
    ended_at?: string | null;
    created_at: string;
}

/** GET /api/games/[id]: the row with both players embedded plus the caller's seat. */
export interface GameWithPlayers extends Game {
    white: ProfileSummary | null;
    black: ProfileSummary | null;
    myColor?: SeatColor;
}

/** `public.moves` row (inserted by the realtime server on each move). */
export interface Move {
    id: string;
    game_id: string;
    move_number: number;
    color: PlayerColor;
    uci: string;
    san: string;
    fen_after: string;
    clock_ms_remaining: number | null;
    created_at: string;
}

/** Entry of the realtime server's in-memory move log (`game_state_sync.moveLog`). */
export interface MoveLogEntry {
    /** UCI from the client's `move` field; the current client never sends it, so it is undefined. */
    move?: string;
    fen: string;
    san: string;
}
