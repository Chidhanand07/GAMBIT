'use client';

import { usePresence } from '@/components/PresenceProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { podiumOf, standingOf, toRankRows, totalsOf } from '../leaderboardView';
import { bucketOf } from '../types';
import { LeaderboardView } from './LeaderboardView';

const PLAY_HREF = '/lobby';

/**
 * Wires the leaderboard to real data: GET /api/leaderboard per tab (Glicko-2 ratings), the
 * signed-in profile (ProfileProvider, from the verified session) for "You" and "Your standing",
 * and the presence count for "Online now".
 */
export function LeaderboardContainer() {
    const { filter, setFilter, players, total, loading } = useLeaderboard();
    const { profile } = useProfile();
    const { onlineCount } = usePresence();

    const bucket = bucketOf(filter);
    const rows = toRankRows(players, `rating_${bucket}`, profile?.username);
    const standing = profile && !loading ? standingOf(rows, profile, bucket) : null;

    return (
        <LeaderboardView
            filter={filter}
            onFilterChange={setFilter}
            loading={loading}
            rows={rows}
            podium={podiumOf(rows)}
            bucket={bucket}
            standing={standing}
            totals={totalsOf(players, `rating_${bucket}`, total)}
            onlineNow={onlineCount}
            playHref={PLAY_HREF}
        />
    );
}
