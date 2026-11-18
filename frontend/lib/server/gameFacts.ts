import 'server-only';
import { playerOutcome, type OutcomeRow } from '@/lib/chess/gameOutcome';
import type { SpeedBucket } from '@/types/timeControl';
import type { SnapshotGameRow } from './ratingHistory';

// Derived profile facts read from the player's finished games (Profile.dc.html "Stats" tiles).

export type FactGameRow = OutcomeRow & SnapshotGameRow;

const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const BUCKETS: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];

/** The opponent's rating when the game started, from the snapshot (F-120); null without one. */
function opponentRatingAtStart(game: FactGameRow, profileId: string): number | null {
    const rating = game.white_id === profileId ? game.black_rating_before : game.white_rating_before;
    return isNumber(rating) ? Math.round(rating) : null;
}

/**
 * Best win per pool: the highest rating an opponent had when the player beat them. Only games with
 * a rating snapshot count (the opponent's rating at the time is unknown for older games); null for a
 * pool without such a win.
 */
export function bestWins(games: readonly FactGameRow[], profileId: string): Record<SpeedBucket, number | null> {
    const best: Record<SpeedBucket, number | null> = { bullet: null, blitz: null, rapid: null, classical: null };
    for (const game of games) {
        const pool = game.rating_category as SpeedBucket;
        if (!BUCKETS.includes(pool) || playerOutcome(game, profileId) !== 'win') continue;
        const rating = opponentRatingAtStart(game, profileId);
        if (rating !== null && (best[pool] === null || rating > (best[pool] as number))) best[pool] = rating;
    }
    return best;
}

/** The best of the per-pool best wins; null when there is none. */
export function overallBestWin(perPool: Record<SpeedBucket, number | null>): number | null {
    const values = Object.values(perPool).filter(isNumber);
    return values.length > 0 ? Math.max(...values) : null;
}
