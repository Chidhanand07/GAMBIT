// The "All" leaderboard rule (F-125), shared by the web app's server and its pages. The database
// computes the rating itself (profiles.rating_all); this tells which pool it comes from. Pure.
import type { RatingField, SpeedBucket } from '@/types/timeControl';

export const RATING_POOLS: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];

/** A pool counts for "All" once the player has this many rated games in it (profiles.rating_all). */
export const MIN_RATED_GAMES_FOR_ALL = 1;

export type PoolRow = Partial<Record<RatingField, number | null>> &
    Partial<Record<`rated_games_${SpeedBucket}`, number | null>>;

/**
 * The pool the "All" rating comes from: the highest rating among the pools with enough rated
 * games, the first in RATING_POOLS order on a tie. Null when no pool qualifies.
 */
export function allRatingPool(row: PoolRow): SpeedBucket | null {
    let best: SpeedBucket | null = null;
    for (const pool of RATING_POOLS) {
        const rating = row[`rating_${pool}`];
        if ((row[`rated_games_${pool}`] ?? 0) < MIN_RATED_GAMES_FOR_ALL || typeof rating !== 'number') continue;
        if (best === null || rating > (row[`rating_${best}`] as number)) best = pool;
    }
    return best;
}
