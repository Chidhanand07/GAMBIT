'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, fetchViewerStanding } from '@/lib/api/leaderboard';
import type { ViewerStanding } from '../leaderboardView';
import { fieldOf, type LeaderboardFilter, type LeaderboardPlayer } from '../types';

/** How often the open board re-reads the rankings, so the "Updated live" badge holds. */
export const LEADERBOARD_REFRESH_MS = 30_000;

/**
 * The selected time-control tab, its rankings, the ranked-player count and, for a signed-in viewer,
 * their own rank on the board (any place, F-125): read on every tab change and every
 * LEADERBOARD_REFRESH_MS while the tab is open. A failed read keeps the last board.
 */
export function useLeaderboard(signedIn: boolean) {
    const [filter, setFilter] = useState<LeaderboardFilter>('all');
    const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [viewer, setViewer] = useState<ViewerStanding | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const field = fieldOf(filter);
        const loadViewer = () =>
            fetchViewerStanding(field)
                .catch(() => null)
                .then((standing) => {
                    if (active) setViewer(standing);
                });
        const load = () =>
            fetchLeaderboard(field)
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
        const refresh = () => {
            void load();
            if (signedIn) void loadViewer();
        };
        setLoading(true);
        setViewer(null);
        refresh();
        const timer = setInterval(refresh, LEADERBOARD_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [filter, signedIn]);

    return { filter, setFilter, players, total, viewer, loading };
}
