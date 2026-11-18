import type { Profile } from '@/types/profile';
import type { RatingField, SpeedBucket } from '@/types/timeControl';

/** A row of GET /api/leaderboard as the page reads it. Ratings may be missing (shown as 1200). */
export type LeaderboardPlayer = Pick<Profile, 'username' | 'display_name'> &
    Partial<Pick<Profile, 'avatar_url' | 'games_played' | 'wins'>> &
    Partial<Record<RatingField, number | null>>;

export const DEFAULT_RATING = 1200;

/** Rounded rating in `field`, or 1200 when absent. */
export function ratingOf(player: LeaderboardPlayer, field: RatingField): number {
    return Math.round(player[field] ?? DEFAULT_RATING);
}

/** The time-control tabs. "All" has no pool of its own: it ranks by the rapid rating. */
export type LeaderboardFilter = 'all' | SpeedBucket;

export const FILTERS: readonly { id: LeaderboardFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'rapid', label: 'Rapid' },
    { id: 'classical', label: 'Classical' },
];

/** The bucket a filter ranks by. */
export const bucketOf = (filter: LeaderboardFilter): SpeedBucket => (filter === 'all' ? 'rapid' : filter);
