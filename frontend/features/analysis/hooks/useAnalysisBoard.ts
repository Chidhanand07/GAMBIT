'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { gameFromFen, gameFromPgn, replayTo, resolveSquareClick } from '../board';
import { useArrowKeyNavigation } from './useArrowKeyNavigation';

/**
 * Analysis board state: the current position, the move history (a single line;
 * a new move from an earlier position truncates it), selection and navigation.
 */
export function useAnalysisBoard() {
    const [game, setGame] = useState<Chess | null>(null);
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [legalTargets, setLegalTargets] = useState<string[]>([]);

    useEffect(() => {
        setGame(new Chess());
    }, []);

    const navigateToMove = useCallback(
        (index: number) => {
            setGame(replayTo(moveHistory, index));
            setCurrentMoveIndex(index);
            setSelectedSquare(null);
            setLegalTargets([]);
        },
        [moveHistory],
    );

    const handleSquareClick = useCallback(
        (square: string) => {
            if (!game) return;
            const outcome = resolveSquareClick(game, selectedSquare, square);
            if (outcome.type === 'none') return;
            if (outcome.type === 'select') {
                setSelectedSquare(square);
                setLegalTargets(outcome.targets);
                return;
            }
            if (outcome.type === 'move') {
                const newHistory = [...moveHistory.slice(0, currentMoveIndex + 1), outcome.move];
                setMoveHistory(newHistory);
                setCurrentMoveIndex(newHistory.length - 1);
                setGame(outcome.game);
            }
            setSelectedSquare(null);
            setLegalTargets([]);
        },
        [game, selectedSquare, moveHistory, currentMoveIndex],
    );

    useArrowKeyNavigation({ moveHistory, setCurrentMoveIndex, setGame, setSelectedSquare, setLegalTargets });

    /** Replace the whole line and put the cursor on its last move. Selection is left as is. */
    const loadLine = (g: Chess, history: Move[]) => {
        setGame(g);
        setMoveHistory(history);
        setCurrentMoveIndex(history.length - 1);
    };
    /** Start a fresh line from `fen` (throws on an invalid FEN). */
    const loadPosition = (fen: string) => loadLine(gameFromFen(fen), []);
    /** Load a PGN and jump to its last move (throws on an invalid PGN). */
    const loadPgn = (pgn: string) => {
        const { game: g, history } = gameFromPgn(pgn);
        loadLine(g, history);
    };

    const reset = () => {
        setGame(new Chess());
        setMoveHistory([]);
        setCurrentMoveIndex(-1);
        setSelectedSquare(null);
        setLegalTargets([]);
    };

    const nav = { navigateToMove, handleSquareClick, loadPosition, loadPgn, reset };
    return { game, moveHistory, currentMoveIndex, selectedSquare, legalTargets, ...nav };
}
