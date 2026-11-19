'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '@/lib/api/leaderboard';
import { bucketOf, type LeaderboardFilter, type LeaderboardPlayer } from '../types';

/** How often the open board re-reads the rankings, so the "Updated live" badge holds. */
export const LEADERBOARD_REFRESH_MS = 30_000;

/**
 * The selected time-control tab, its rankings and the ranked-player count: read on every tab
 * change and every LEADERBOARD_REFRESH_MS while the tab is open. A failed read keeps the last board.
 */
export function useLeaderboard() {
    const [filter, setFilter] = useState<LeaderboardFilter>('all');
    const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const load = () =>
            fetchLeaderboard(`rating_${bucketOf(filter)}`)
                .then((page) => {
                    if (!active) return;
                    setPlayers(page.players);
                    setTotal(page.total);
                })
                .catch(() => {
                    /* network failure: keep the last board */
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        setLoading(true);
        void load();
        const timer = setInterval(() => void load(), LEADERBOARD_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [filter]);

    return { filter, setFilter, players, total, loading };
}
