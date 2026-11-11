'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Chess, Move } from 'chess.js';
import { replayTo } from '../board';

interface Options {
    moveHistory: Move[];
    setCurrentMoveIndex: Dispatch<SetStateAction<number>>;
    setGame: Dispatch<SetStateAction<Chess | null>>;
    setSelectedSquare: Dispatch<SetStateAction<string | null>>;
    setLegalTargets: Dispatch<SetStateAction<string[]>>;
}

/** ArrowLeft / ArrowRight step through the history (ignored while typing in an input or textarea). */
export function useArrowKeyNavigation(opts: Options) {
    const { moveHistory, setCurrentMoveIndex, setGame, setSelectedSquare, setLegalTargets } = opts;
    useEffect(() => {
        const step = (delta: -1 | 1) =>
            setCurrentMoveIndex((prev) => {
                const next = delta < 0 ? Math.max(-1, prev - 1) : Math.min(moveHistory.length - 1, prev + 1);
                setGame(replayTo(moveHistory, next));
                setSelectedSquare(null);
                setLegalTargets([]);
                return next;
            });
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                step(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                step(1);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [moveHistory, setCurrentMoveIndex, setGame, setSelectedSquare, setLegalTargets]);
}
