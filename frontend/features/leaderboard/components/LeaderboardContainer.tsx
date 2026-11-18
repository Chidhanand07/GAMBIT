'use client';

import { usePresence } from '@/components/PresenceProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { podiumOf, standingOf, toRankRows, totalsOf } from '../leaderboardView';
import { fieldOf } from '../types';
import { LeaderboardView } from './LeaderboardView';

const PLAY_HREF = '/lobby';

/**
 * Wires the leaderboard to real data: GET /api/leaderboard per tab (Glicko-2 ratings; All ranks by
 * each player's best pool, F-125), the signed-in profile (ProfileProvider, from the verified session)
 * for "You", GET /api/leaderboard/me for "Your standing" beyond the top 50, and the presence count.
 */
export function LeaderboardContainer() {
    const { profile } = useProfile();
    const { filter, setFilter, players, total, viewer, loading } = useLeaderboard(Boolean(profile));
    const { onlineCount } = usePresence();

    const field = fieldOf(filter);
    const rows = toRankRows(players, field, profile?.username);
    const standing = profile && !loading ? standingOf(rows, profile, field, viewer) : null;

    return (
        <LeaderboardView
            filter={filter}
            onFilterChange={setFilter}
            loading={loading}
            rows={rows}
            podium={podiumOf(rows)}
            standing={standing}
            totals={totalsOf(players, field, total)}
            onlineNow={onlineCount}
            playHref={PLAY_HREF}
        />
    );
}
