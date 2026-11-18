import type { PoolRow } from '@/lib/chess/ratingPools';
import type { Profile } from '@/types/profile';
import type { RatingField, SpeedBucket } from '@/types/timeControl';

/** A board: one pool's rating column, or "All" (profiles.rating_all, F-125). */
export type LeaderboardField = RatingField | 'rating_all';

/** A row of GET /api/leaderboard as the page reads it. Ratings may be missing (shown as 1200). */
export type LeaderboardPlayer = Pick<Profile, 'username' | 'display_name'> &
    Partial<Pick<Profile, 'avatar_url' | 'games_played' | 'wins'>> &
    PoolRow & { rating_all?: number | null };

export const DEFAULT_RATING = 1200;

/** Rounded rating on a board, or 1200 when absent. */
export function ratingOf(player: Partial<Record<LeaderboardField, number | null>>, field: LeaderboardField): number {
    return Math.round(player[field] ?? DEFAULT_RATING);
}

/** The time-control tabs. "All" ranks by each player's best pool (F-125). */
export type LeaderboardFilter = 'all' | SpeedBucket;

export const FILTERS: readonly { id: LeaderboardFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'rapid', label: 'Rapid' },
    { id: 'classical', label: 'Classical' },
];

/** The rating column a tab ranks by. */
export const fieldOf = (filter: LeaderboardFilter): LeaderboardField =>
    filter === 'all' ? 'rating_all' : `rating_${filter}`;
