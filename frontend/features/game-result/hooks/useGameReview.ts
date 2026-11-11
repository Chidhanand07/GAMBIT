'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchGameForReview } from '@/lib/api/gameResult';
import type { GameWithPlayers } from '@/types/game';

export type ReviewStatus = 'loading' | 'analyzing' | 'ready' | 'error';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TRIES = 20; // ~60 s

/**
 * Loads the game row and polls while the engine review is still running.
 * LEGACY: polling continues after an error response too (only a game with
 * classifications stops it), up to MAX_POLL_TRIES.
 */
export function useGameReview(gameId: string) {
    const [game, setGame] = useState<GameWithPlayers | null>(null);
    const [status, setStatus] = useState<ReviewStatus>('loading');
    const [flipped, setFlipped] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetchGameForReview(gameId);
            if (!res.ok) {
                setStatus('error');
                return;
            }
            const g: GameWithPlayers = await res.json();
            setGame(g);
            const hasAnalysis = g.white_move_classifications?.length || g.black_move_classifications?.length;
            setStatus(hasAnalysis ? 'ready' : 'analyzing');
            if (g.black_id === g.black?.id && g.myColor === 'black') setFlipped(true);
            return !!hasAnalysis;
        } catch {
            setStatus('error');
            return false;
        }
    }, [gameId]);

    useEffect(() => {
        let tries = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
            const done = await load();
            tries++;
            if (!done && tries < MAX_POLL_TRIES) timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        void tick();
        return () => clearTimeout(timer);
    }, [load]);

    return { game, status, flipped, setFlipped };
}
