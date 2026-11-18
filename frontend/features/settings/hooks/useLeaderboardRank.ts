import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '@/lib/api/leaderboard';

/**
 * The 1-based place of `username` on the rapid leaderboard (the board the privacy preview
 * shows), or null when they are not in the top 50 or it could not be loaded.
 */
export function useLeaderboardRank(username: string): number | null {
    const [rank, setRank] = useState<number | null>(null);
    useEffect(() => {
        let current = true;
        fetchLeaderboard('rating_rapid')
            .then(({ players }) => {
                const index = Array.isArray(players) ? players.findIndex((p) => p?.username === username) : -1;
                if (current) setRank(index >= 0 ? index + 1 : null);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [username]);
    return rank;
}
