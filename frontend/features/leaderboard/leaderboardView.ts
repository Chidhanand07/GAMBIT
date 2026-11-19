// Pure view model for the leaderboard (design/Leaderboard.dc.html): rows, podium, totals, standing.
import { allRatingPool } from '@/lib/chess/ratingPools';
import type { RatingField, SpeedBucket } from '@/types/timeControl';
import { DEFAULT_RATING, ratingOf, type LeaderboardField, type LeaderboardPlayer } from './types';

const PERCENT = 100;
export const PODIUM_SIZE = 3;

export interface RankRow {
    rank: number;
    username: string;
    name: string;
    handle: string;
    initial: string;
    avatarUrl: string | null;
    rating: number;
    /** The pool printed under the rating ("rapid"); on All, the pool the rating comes from. */
    pool: string;
    games: number;
    /** Whole-number win percentage (0 with no games). */
    winPct: number;
    you: boolean;
    href: string;
}

/** Rows GET /api/leaderboard returns at most (LEADERBOARD_SIZE in lib/server/profiles). */
export const LEADERBOARD_SIZE = 50;

export interface LeaderboardTotals {
    /** Every ranked player, or null when unknown (no server count and the list is capped). */
    players: number | null;
    /** Mean rating of the players shown. */
    avgRating: number;
    /** True when the list is capped, so the mean covers only the top players shown. */
    avgOfTop: boolean;
}

/** What the "Your standing" card shows for the signed-in viewer. */
export interface Standing {
    /** Position on the board (beyond the top 50 too, F-125), or null when the viewer is not ranked there. */
    rank: number | null;
    /** Rating on the board; null on All before the first rated game. */
    rating: number | null;
    name: string;
    /** The pool of that rating, or null when there is none. */
    pool: SpeedBucket | null;
    games: number;
    winPct: number;
}

/** The viewer as the standing card needs it (a ProfileProvider profile). */
export type StandingProfile = Pick<LeaderboardPlayer, 'username' | 'display_name'> & {
    games_played: number;
    wins: number;
} & Partial<Record<RatingField, number | null>>;

/** GET /api/leaderboard/me: the viewer's rank on the board from the server (F-125). */
export interface ViewerStanding {
    rank: number | null;
    rating: number | null;
    pool: SpeedBucket | null;
}

const POOL_PREFIX = 'rating_';

/** The pool label of a board's rating: the board's own pool, or on All the player's best pool. */
function poolLabel(player: LeaderboardPlayer, field: LeaderboardField): string {
    if (field !== 'rating_all') return field.slice(POOL_PREFIX.length);
    return allRatingPool(player) ?? 'all';
}

export const winPercent = (wins: number | undefined, games: number | undefined) =>
    games ? Math.round(((wins ?? 0) / games) * PERCENT) : 0;

const displayName = (p: Pick<LeaderboardPlayer, 'username' | 'display_name'>) => p.display_name || p.username;

export function toRankRows(players: readonly LeaderboardPlayer[], field: LeaderboardField, viewer?: string): RankRow[] {
    return players.map((p, i) => {
        const name = displayName(p);
        return {
            rank: i + 1,
            username: p.username,
            name,
            handle: `@${p.username}`,
            initial: (name.charAt(0) || '?').toUpperCase(),
            avatarUrl: p.avatar_url ?? null,
            rating: ratingOf(p, field),
            pool: poolLabel(p, field),
            games: p.games_played ?? 0,
            winPct: winPercent(p.wins, p.games_played),
            you: viewer !== undefined && p.username === viewer,
            href: `/profile/${p.username}`,
        };
    });
}

/**
 * Player count and mean rating (1200 for an empty board). `total` is the server's count of ranked
 * players; without it the list length is the count only while the list is not capped.
 */
export function totalsOf(
    players: readonly LeaderboardPlayer[],
    field: LeaderboardField,
    total: number | null = null,
): LeaderboardTotals {
    const sum = players.reduce((a, p) => a + (p[field] ?? DEFAULT_RATING), 0);
    const capped = players.length >= LEADERBOARD_SIZE;
    return {
        players: total ?? (capped ? null : players.length),
        avgRating: Math.round(sum / players.length || DEFAULT_RATING),
        avgOfTop: capped,
    };
}

/**
 * The viewer's standing: their place in the rows returned, else the server's rank (any place, F-125);
 * the rating and pool from the server when it answered, else from the profile (pool boards only).
 */
export function standingOf(
    rows: readonly RankRow[],
    viewer: StandingProfile,
    field: LeaderboardField,
    server: ViewerStanding | null = null,
): Standing {
    const own = field === 'rating_all' ? null : (field.slice(POOL_PREFIX.length) as SpeedBucket);
    return {
        rank: rows.find((r) => r.username === viewer.username)?.rank ?? server?.rank ?? null,
        rating: server ? server.rating : own && ratingOf(viewer, `rating_${own}`),
        name: displayName(viewer),
        pool: server ? server.pool : own,
        games: viewer.games_played,
        winPct: winPercent(viewer.wins, viewer.games_played),
    };
}

/** Podium slots left to right: second, first, third (empty below three players). */
export function podiumOf(rows: readonly RankRow[]): RankRow[] {
    return rows.length >= PODIUM_SIZE ? [rows[1], rows[0], rows[2]] : [];
}
