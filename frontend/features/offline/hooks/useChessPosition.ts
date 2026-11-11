'use client';

import { useCallback, useState } from 'react';
import { Chess } from 'chess.js';
import type { LastMove } from '../types';

/** One mutable chess.js game plus the React state that mirrors it. */
export function useChessPosition() {
    const [game] = useState(() => new Chess());
    // The FEN is never read; setting it re-renders after the mutable `game` changes.
    const [, setFen] = useState(game.fen());
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [lastMove, setLastMove] = useState<LastMove | null>(null);

    /** Re-sync React state after `game` was mutated. */
    const refresh = useCallback(() => {
        setFen(game.fen());
        setMoveHistory(game.history());
    }, [game]);

    return { game, moveHistory, lastMove, setLastMove, refresh };
}
