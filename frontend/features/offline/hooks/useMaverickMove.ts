'use client';

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Chess } from 'chess.js';
import { requestMaverickMove } from '@/lib/api/offline';
import { playGameEndSound } from '@/lib/sounds';
import { playSoundForMove } from '../game';
import type { Difficulty, LastMove } from '../types';

/** Keep a minimum "thinking" beat so the move feels natural, not instant. */
const MIN_THINK_MS = 400;
const ENGINE_UNAVAILABLE = 'MAVERICK is unavailable. Is the engine running?';
/** Retry policy (F13): after a failed request the player may retry this many times in a row. */
export const MAX_ENGINE_RETRIES = 3;

interface Options {
    game: Chess;
    difficulty: Difficulty;
    refresh: () => void;
    setLastMove: Dispatch<SetStateAction<LastMove | null>>;
}

/** Asks MAVERICK (POST /api/maverick-move) for a move and applies it to `game`. */
export function useMaverickMove({ game, difficulty, refresh, setLastMove }: Options) {
    const [thinking, setThinking] = useState(false);
    const [engineError, setEngineError] = useState<string | null>(null);
    /** Consecutive failed requests; reset by a successful move or clearEngineError. */
    const [failures, setFailures] = useState(0);
    const thinkingRef = useRef(false);

    const maverickMove = useCallback(async () => {
        if (thinkingRef.current) return;
        if (game.isGameOver()) return;
        thinkingRef.current = true;
        setThinking(true);
        setEngineError(null);
        const startedAt = Date.now();
        try {
            const data = await requestMaverickMove(game.fen(), difficulty);
            const elapsed = Date.now() - startedAt;
            if (elapsed < MIN_THINK_MS) await new Promise((r) => setTimeout(r, MIN_THINK_MS - elapsed));

            const result = game.move({
                from: data.uci.slice(0, 2),
                to: data.uci.slice(2, 4),
                promotion: data.uci.slice(4) || 'q',
            });
            setFailures(0);
            if (result) {
                setLastMove({ from: result.from, to: result.to });
                playSoundForMove(game, result);
                refresh();
                if (game.isGameOver()) playGameEndSound(false);
            }
        } catch (e) {
            setEngineError((e as { message?: string } | null | undefined)?.message || ENGINE_UNAVAILABLE);
            setFailures((n) => n + 1);
        } finally {
            thinkingRef.current = false;
            setThinking(false);
        }
    }, [game, difficulty, refresh, setLastMove]);

    const clearEngineError = useCallback(() => {
        setEngineError(null);
        setFailures(0);
    }, []);
    /** The first failure plus MAX_ENGINE_RETRIES retries; after that only a new game helps. */
    const canRetry = engineError !== null && failures <= MAX_ENGINE_RETRIES;
    const retry = () => {
        if (canRetry) void maverickMove();
    };

    return { thinking, engineError, canRetry, retry, clearEngineError, maverickMove };
}
