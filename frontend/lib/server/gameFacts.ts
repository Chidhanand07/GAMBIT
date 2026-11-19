import 'server-only';
import { movesPlayed } from '@/lib/chess/fen';
import { playerOutcome, type OutcomeRow } from '@/lib/chess/gameOutcome';
import type { SpeedBucket } from '@/types/timeControl';
import type { SnapshotGameRow } from './ratingHistory';

// Derived profile facts read from the player's finished games (Profile.dc.html "Stats" tiles).

export type FactGameRow = OutcomeRow &
    SnapshotGameRow & {
        /** How the game ended (F-124); null for games finished before it was stored. */
        end_reason?: string | null;
        final_fen?: string | null;
        fen?: string | null;
    };

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

/** Moves in a finished game, from its final position (the live position for older rows). */
export const gameMoves = (game: Pick<FactGameRow, 'final_fen' | 'fen'>): number | null =>
    movesPlayed(game.final_fen ?? game.fen);

const played = (games: readonly FactGameRow[], profileId: string) =>
    games.filter((g) => playerOutcome(g, profileId) !== 'aborted');

/** Mean number of moves of the played games, rounded; null without a readable final position. */
export function averageGameLength(games: readonly FactGameRow[], profileId: string): number | null {
    const lengths = played(games, profileId)
        .map(gameMoves)
        .filter((n): n is number => n !== null && n > 0);
    if (lengths.length === 0) return null;
    return Math.round(lengths.reduce((sum, n) => sum + n, 0) / lengths.length);
}

/** Fewest moves in a won game; null without a win whose final position is readable. */
export function fastestWin(games: readonly FactGameRow[], profileId: string): number | null {
    const lengths = games
        .filter((g) => playerOutcome(g, profileId) === 'win')
        .map(gameMoves)
        .filter((n): n is number => n !== null && n > 0);
    return lengths.length > 0 ? Math.min(...lengths) : null;
}

/** "How games end" rows (Profile.dc.html), each a set of stored end_reason codes. */
const ENDING_GROUPS: readonly (readonly [string, readonly string[]])[] = [
    ['Checkmate', ['checkmate']],
    ['Resignation', ['resignation']],
    ['On time', ['timeout']],
    [
        'Stalemate or draw',
        ['stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'agreement'],
    ],
    ['Abandoned', ['abandonment']],
];
export const NOT_RECORDED = 'Not recorded';

export interface EndingCount {
    name: string;
    count: number;
}

/**
 * How the player's played games ended, in the mockup's rows. Games finished before the reason was
 * stored (F-124) are counted as "Not recorded", a row that appears only when there are any.
 */
export function endings(games: readonly FactGameRow[], profileId: string): EndingCount[] {
    const rows = ENDING_GROUPS.map(([name]) => ({ name, count: 0 }));
    let unknown = 0;
    for (const game of played(games, profileId)) {
        const group = ENDING_GROUPS.findIndex(([, codes]) => codes.includes(game.end_reason ?? ''));
        if (group === -1) unknown++;
        else rows[group].count++;
    }
    return unknown > 0 ? [...rows, { name: NOT_RECORDED, count: unknown }] : rows;
}
