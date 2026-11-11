// Player click handling for the MAVERICK board (pure apart from the callbacks it is given).
import type { Chess, Move } from 'chess.js';
import { tryMove } from './game';
import type { Side } from './types';

export interface SquareClickContext {
    game: Chess;
    playerColor: Side;
    /** Input is ignored while the game is over or MAVERICK is thinking. */
    blocked: boolean;
    selection: {
        selectedSquare: string | null;
        isOwnPiece: (square: string) => boolean;
        select: (square: string) => void;
        clearSelection: () => void;
    };
    onPlayerMove: (result: Move) => void;
}

/** Select a piece, deselect it, move it, or reselect another own piece. */
export function handleSquareClick(ctx: SquareClickContext, square: string) {
    const { game, playerColor, selection } = ctx;
    if (ctx.blocked) return;
    if (game.turn() !== playerColor) return; // not your turn
    const from = selection.selectedSquare;
    if (!from) {
        if (selection.isOwnPiece(square)) selection.select(square);
        return;
    }
    if (from === square) return selection.clearSelection();
    const result = tryMove(game, from, square);
    if (result) return ctx.onPlayerMove(result);
    // Reselect if clicking own piece
    if (selection.isOwnPiece(square)) selection.select(square);
    else selection.clearSelection();
}
