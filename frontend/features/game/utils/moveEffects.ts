// Pure chess.js queries + sound selection shared by the local move (commitMove) and the
// server echo (move_made). Branch order matches the legacy page exactly.
import type { Chess, Square } from 'chess.js';
import {
    playCaptureSound,
    playCastleSound,
    playCheckmateSound,
    playCheckSound,
    playMoveSound,
    playPromoteSound,
} from '@/lib/sounds';
import type { GameOverInfo } from '../state/gameReducer';

type PieceOnBoard = ReturnType<Chess['get']>;

const hasFlag = (flags: string | undefined, flag: string) => !!flags && flags.includes(flag);

/** Mate > check > castle (k/q flag) > promotion (p flag) > capture > plain move. */
export function playMoveSoundFor(chess: Chess, flags: string | undefined, captured: unknown): void {
    if (chess.isCheckmate()) playCheckmateSound();
    else if (chess.inCheck()) playCheckSound();
    else if (hasFlag(flags, 'k') || hasFlag(flags, 'q')) playCastleSound();
    else if (hasFlag(flags, 'p')) playPromoteSound();
    else if (captured) playCaptureSound();
    else playMoveSound();
}

/** Result/reason the page shows when chess.js says the position is over; null while play continues. */
export function detectGameOver(chess: Chess): GameOverInfo | null {
    if (!chess.isGameOver()) return null;
    const mate = chess.isCheckmate();
    const result = mate ? (chess.turn() === 'w' ? 'Black wins' : 'White wins') : 'Draw';
    const reason = mate ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : 'Draw';
    return { result, reason };
}

/** A pawn landing on the far rank for its colour. */
export function isPromotionMove(piece: PieceOnBoard, to: Square): boolean {
    return piece?.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));
}
