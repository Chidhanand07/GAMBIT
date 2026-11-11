'use client';

// Display-only clock tick (the server handles expiry). Ticks the side to move once per second,
// only after the server activated the clock and while nobody is disconnected and the game is live.
import { useEffect, useRef, type Dispatch } from 'react';
import type { GameAction, GameState } from '../state/gameReducer';

const TICK_MS = 1000;

interface Options {
    fen: string;
    gameOver: GameState['gameOver'];
    gameData: GameState['gameData'];
    opponentDisconnected: boolean;
    clockActive: boolean;
    dispatch: Dispatch<GameAction>;
}

export function useGameClock({ fen, gameOver, gameData, opponentDisconnected, clockActive, dispatch }: Options): void {
    const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // The turn token is the 2nd space-delimited FEN field: 'w' or 'b'.
    const currentTurn = fen.split(' ')[1];

    useEffect(() => {
        if (clockRef.current) clearInterval(clockRef.current);
        if (gameOver || !gameData || opponentDisconnected || !clockActive) return;
        clockRef.current = setInterval(() => dispatch({ type: 'clockTicked', side: currentTurn }), TICK_MS);
        return () => {
            if (clockRef.current) clearInterval(clockRef.current);
        };
    }, [currentTurn, gameOver, gameData, opponentDisconnected, clockActive, dispatch]);
}
