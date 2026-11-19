// Preset positions on the Import tab (Analysis.dc.html).
import { normalizeFen } from './board';

export interface QuickPosition {
    name: string;
    fen: string;
}

export const QUICK_POSITIONS: readonly QuickPosition[] = [
    { name: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    { name: "King's Gambit", fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2' },
    { name: 'Sicilian Defense', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2' },
    { name: 'Ruy Lopez', fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
];

/** Whether the board (`currentFen`, as chess.js writes it) is exactly this preset. */
export const isShowing = (q: QuickPosition, currentFen: string) => normalizeFen(q.fen) === currentFen;
