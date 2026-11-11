'use client';

import { useCallback, useState } from 'react';
import type { Chess, Square } from 'chess.js';
import type { Side } from '../types';

/** The player's selected square and its legal target squares. */
export function usePieceSelection(game: Chess, playerColor: Side) {
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [legalMoves, setLegalMoves] = useState<string[]>([]);

    const clearSelection = useCallback(() => {
        setSelectedSquare(null);
        setLegalMoves([]);
    }, []);

    /** True when `square` holds one of the player's pieces. */
    const isOwnPiece = (square: string) => {
        const piece = game.get(square as Square);
        return !!piece && piece.color === playerColor;
    };

    const select = (square: string) => {
        setSelectedSquare(square);
        setLegalMoves(game.moves({ square: square as Square, verbose: true }).map((m) => m.to));
    };

    return { selectedSquare, legalMoves, clearSelection, isOwnPiece, select };
}
