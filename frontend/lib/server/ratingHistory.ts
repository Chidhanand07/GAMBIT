import 'server-only';
import type { SpeedBucket } from '@/types/timeControl';

// The rating history of a player per pool, from the rating snapshot every rated game carries
// (games.rating_category, {white,black}_rating_{before,after}; F-120). Games rated before the
// snapshots existed have none and are not part of any history.

const BUCKETS: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];

export interface SnapshotGameRow {
    white_id?: string | null;
    rating_category?: string | null;
    white_rating_before?: number | null;
    white_rating_after?: number | null;
    black_rating_before?: number | null;
    black_rating_after?: number | null;
    ended_at?: string | null;
    created_at?: string | null;
}

interface Point {
    at: string;
    before: number;
    after: number;
}

const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isBucket = (c: unknown): c is SpeedBucket => BUCKETS.includes(c as SpeedBucket);

/** The player's side of a game's snapshot, or null when the game has none. */
function pointOf(game: SnapshotGameRow, profileId: string): Point | null {
    const white = game.white_id === profileId;
    const before = white ? game.white_rating_before : game.black_rating_before;
    const after = white ? game.white_rating_after : game.black_rating_after;
    if (!isNumber(before) || !isNumber(after)) return null;
    return { at: game.ended_at ?? game.created_at ?? '', before, after };
}

/** Rounded ratings: the one before the first recorded game, then the one after each game. */
function seriesOf(points: Point[]): number[] {
    if (points.length === 0) return [];
    const ordered = [...points].sort((a, b) => a.at.localeCompare(b.at));
    return [Math.round(ordered[0].before), ...ordered.map((p) => Math.round(p.after))];
}

/** Rating after each recorded game per pool, oldest first, led by the rating before the first. */
export function ratingHistory(games: readonly SnapshotGameRow[], profileId: string): Record<SpeedBucket, number[]> {
    const points: Record<SpeedBucket, Point[]> = { bullet: [], blitz: [], rapid: [], classical: [] };
    for (const game of games) {
        if (!isBucket(game.rating_category)) continue;
        const point = pointOf(game, profileId);
        if (point) points[game.rating_category].push(point);
    }
    return {
        bullet: seriesOf(points.bullet),
        blitz: seriesOf(points.blitz),
        rapid: seriesOf(points.rapid),
        classical: seriesOf(points.classical),
    };
}
