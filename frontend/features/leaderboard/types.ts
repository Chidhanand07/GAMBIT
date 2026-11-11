import type { Profile } from '@/types/profile';
import type { RatingField } from '@/types/timeControl';

/** A row of GET /api/leaderboard as the page reads it. Ratings may be missing (shown as 1200). */
export type LeaderboardPlayer = Pick<Profile, 'username' | 'display_name' | 'avatar_url'> &
    Partial<Pick<Profile, 'games_played' | 'wins'>> &
    Partial<Record<RatingField, number | null>>;

export const DEFAULT_RATING = 1200;

/** Rounded rating in `field`, or 1200 when absent. */
export function ratingOf(player: LeaderboardPlayer, field: RatingField): number {
    return Math.round(player[field] ?? DEFAULT_RATING);
}
