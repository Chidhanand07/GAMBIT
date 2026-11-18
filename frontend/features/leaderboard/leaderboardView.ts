// Pure view model for the leaderboard (design/Leaderboard.dc.html): rows, podium, totals, standing.
import type { RatingField, SpeedBucket } from '@/types/timeControl';
import { DEFAULT_RATING, ratingOf, type LeaderboardPlayer } from './types';

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
    games: number;
    /** Whole-number win percentage (0 with no games). */
    winPct: number;
    you: boolean;
    href: string;
}

export interface LeaderboardTotals {
    players: number;
    avgRating: number;
}

/** What the "Your standing" card shows for the signed-in viewer. */
export interface Standing {
    /** Position on the board, or null when the viewer is not in the top players returned. */
    rank: number | null;
    rating: number;
    name: string;
    bucket: SpeedBucket;
    games: number;
    winPct: number;
}

/** The viewer as the standing card needs it (a ProfileProvider profile). */
export type StandingProfile = Pick<LeaderboardPlayer, 'username' | 'display_name'> & {
    games_played: number;
    wins: number;
} & Partial<Record<RatingField, number | null>>;

export const winPercent = (wins: number | undefined, games: number | undefined) =>
    games ? Math.round(((wins ?? 0) / games) * PERCENT) : 0;

const displayName = (p: Pick<LeaderboardPlayer, 'username' | 'display_name'>) => p.display_name || p.username;

export function toRankRows(players: readonly LeaderboardPlayer[], field: RatingField, viewer?: string): RankRow[] {
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
            games: p.games_played ?? 0,
            winPct: winPercent(p.wins, p.games_played),
            you: viewer !== undefined && p.username === viewer,
            href: `/profile/${p.username}`,
        };
    });
}

/** Player count and mean rating (1200 for an empty board). */
export function totalsOf(players: readonly LeaderboardPlayer[], field: RatingField): LeaderboardTotals {
    const sum = players.reduce((a, p) => a + (p[field] ?? DEFAULT_RATING), 0);
    return { players: players.length, avgRating: Math.round(sum / players.length || DEFAULT_RATING) };
}

export function standingOf(rows: readonly RankRow[], viewer: StandingProfile, bucket: SpeedBucket): Standing {
    const field: RatingField = `rating_${bucket}`;
    return {
        rank: rows.find((r) => r.username === viewer.username)?.rank ?? null,
        rating: ratingOf(viewer, field),
        name: displayName(viewer),
        bucket,
        games: viewer.games_played,
        winPct: winPercent(viewer.wins, viewer.games_played),
    };
}

/** Podium slots left to right: second, first, third (empty below three players). */
export function podiumOf(rows: readonly RankRow[]): RankRow[] {
    return rows.length >= PODIUM_SIZE ? [rows[1], rows[0], rows[2]] : [];
}
