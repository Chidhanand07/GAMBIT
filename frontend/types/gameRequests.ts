// Server → client payloads of the requests between the players of a live game: draw offers
// (ADR F-151), takebacks (ADR F-152) and premoves (ADR F-153). Re-exported from types/socket.
import type { MoveLogEntry, PlayerColor } from './game';

/** A player offered a draw (`ply`: moves played at that moment). */
export interface DrawOfferedPayload {
    game_id: string;
    by: PlayerColor;
    ply: number;
}

/** A player declined the standing draw offer. */
export interface DrawDeclinedPayload {
    game_id: string;
    by: PlayerColor;
}

/** The owner's premove was not legal after the opponent's move and was dropped. */
export interface PremoveDiscardedPayload {
    game_id: string;
    reason: 'illegal_move';
}

/** A player asked to take back their last move (`plies`: 1, or 2 when the opponent replied). */
export interface TakebackRequestedPayload {
    game_id: string;
    by: PlayerColor;
    plies: number;
}

/** A player declined the standing takeback request. */
export interface TakebackDeclinedPayload {
    game_id: string;
    by: PlayerColor;
}

/** The takeback was granted: the restored position, move log and clocks. */
export interface TakebackAppliedPayload {
    game_id: string;
    plies: number;
    fen: string;
    moveLog: MoveLogEntry[];
    whiteMs: number;
    blackMs: number;
    activeSide: 'w' | 'b';
    clockActive: boolean;
}
