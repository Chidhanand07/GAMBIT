'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '@/lib/api/leaderboard';
import { bucketOf, type LeaderboardFilter, type LeaderboardPlayer } from '../types';

/** The selected time-control tab and its rankings, refetched on every tab change. */
export function useLeaderboard() {
    const [filter, setFilter] = useState<LeaderboardFilter>('all');
    const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetchLeaderboard(`rating_${bucketOf(filter)}`)
            .then((data) => {
                if (active) setPlayers(data);
            })
            .catch(() => {
                /* network failure: keep the last board */
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filter]);

    return { filter, setFilter, players, loading };
}
