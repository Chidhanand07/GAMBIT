'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchGameForReview } from '@/lib/api/gameResult';
import type { GameWithPlayers } from '@/types/game';

export type ReviewStatus = 'loading' | 'analyzing' | 'ready' | 'error';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TRIES = 20; // ~60 s

/** What one load tells the poller: keep polling only while the review is still running. */
type LoadOutcome = 'done' | 'pending' | 'failed';

const hasAnalysis = (g: GameWithPlayers) =>
    Boolean(g.white_move_classifications?.length || g.black_move_classifications?.length);
const viewerIsBlack = (g: GameWithPlayers) => g.black_id === g.black?.id && g.myColor === 'black';

/**
 * Loads the game row and polls while the engine review is still running, up to
 * MAX_POLL_TRIES. An error (non-ok response or a throw) stops the polling and shows the
 * error state; `retry` loads again and resumes polling (F16).
 */
export function useGameReview(gameId: string) {
    const [game, setGame] = useState<GameWithPlayers | null>(null);
    const [status, setStatus] = useState<ReviewStatus>('loading');
    const [flipped, setFlipped] = useState(false);
    /** Bumped by `retry` to start a fresh polling run. */
    const [run, setRun] = useState(0);

    const load = useCallback(async (): Promise<LoadOutcome> => {
        try {
            const res = await fetchGameForReview(gameId);
            if (!res.ok) {
                setStatus('error');
                return 'failed';
            }
            const g: GameWithPlayers = await res.json();
            setGame(g);
            const done = hasAnalysis(g);
            setStatus(done ? 'ready' : 'analyzing');
            if (viewerIsBlack(g)) setFlipped(true);
            return done ? 'done' : 'pending';
        } catch {
            setStatus('error');
            return 'failed';
        }
    }, [gameId]);

    useEffect(() => {
        let tries = 0;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
            const outcome = await load();
            tries++;
            if (!cancelled && outcome === 'pending' && tries < MAX_POLL_TRIES)
                timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        void tick();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [load, run]);

    const retry = useCallback(() => {
        setStatus('loading');
        setRun((n) => n + 1);
    }, []);

    return { game, status, flipped, setFlipped, retry };
}
