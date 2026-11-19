// Pure chess helpers for the analysis board.
import { Chess, type Move, type Square } from 'chess.js';

/** Position after playing history[0..index] from the start (index -1 = start). */
export function replayTo(history: Move[], index: number): Chess {
    const g = new Chess();
    for (let i = 0; i <= index && i < history.length; i++) g.move(history[i]);
    return g;
}

/** Legal target squares for the piece on `square`, or null when it is not a piece of the side to move. */
export function targetsFor(game: Chess, square: Square): Square[] | null {
    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) return null;
    return game.moves({ square, verbose: true }).map((m) => m.to);
}

/** Load a FEN into a fresh game; throws on an invalid FEN. */
export function gameFromFen(fen: string): Chess {
    const g = new Chess();
    g.load(fen);
    return g;
}

/** `fen` as chess.js writes it (e.g. an en-passant square no pawn can use becomes "-"); null when invalid. */
export function normalizeFen(fen: string): string | null {
    try {
        return gameFromFen(fen).fen();
    } catch {
        return null;
    }
}

/** Load a PGN into a fresh game; throws on an invalid PGN. */
export function gameFromPgn(pgn: string): { game: Chess; history: Move[] } {
    const g = new Chess();
    g.loadPgn(pgn);
    return { game: g, history: g.history({ verbose: true }) };
}

export type SquareClickOutcome =
    | { type: 'none' }
    | { type: 'clear' }
    | { type: 'select'; targets: Square[] }
    | { type: 'move'; game: Chess; move: Move };

/**
 * What a click on `square` does: with nothing selected, select a piece of the
 * side to move (else nothing); with a selection, play the move (then clear),
 * or on an illegal move reselect a piece of the side to move (else clear).
 */
export function resolveSquareClick(game: Chess, selectedSquare: Square | null, square: Square): SquareClickOutcome {
    const select = (): SquareClickOutcome | null => {
        const targets = targetsFor(game, square);
        return targets ? { type: 'select', targets } : null;
    };
    if (!selectedSquare) return select() ?? { type: 'none' };
    const g = new Chess(game.fen());
    try {
        const move = g.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (move) return { type: 'move', game: g, move };
    } catch {
        return select() ?? { type: 'clear' };
    }
    return { type: 'clear' };
}
