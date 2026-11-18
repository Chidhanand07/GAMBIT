// Board helpers on a chess.js position.
import type { Chess, Square } from 'chess.js';

/** The square of the king in check (side to move), or null when nobody is in check. */
export function checkedKingSquare(chess: Pick<Chess, 'inCheck' | 'turn' | 'board'>): Square | null {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    for (const row of chess.board()) {
        for (const cell of row) {
            if (cell?.type === 'k' && cell.color === turn) return cell.square;
        }
    }
    return null;
}
