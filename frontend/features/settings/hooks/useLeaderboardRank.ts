import { useEffect, useState } from 'react';
import { fetchViewerStanding } from '@/lib/api/leaderboard';

/**
 * The signed-in player's place on the rapid leaderboard (the board the privacy preview shows),
 * from the server's rank (GET /api/leaderboard/me, any place, F-125). Null while loading, when
 * it could not be read, or when the player is not on the leaderboard (no rapid rating, or
 * "Show on leaderboard" is off, F-163).
 */
export function useLeaderboardRank(): number | null {
    const [rank, setRank] = useState<number | null>(null);
    useEffect(() => {
        let current = true;
        fetchViewerStanding('rating_rapid')
            .then((standing) => {
                if (current) setRank(standing?.rank ?? null);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, []);
    return rank;
}
