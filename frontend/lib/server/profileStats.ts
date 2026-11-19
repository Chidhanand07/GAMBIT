import 'server-only';
import { playerOutcome, type OutcomeRow } from '@/lib/chess/gameOutcome';
import { classifyTimeControl } from '@/lib/chess/timeControl';
import type { SpeedBucket } from '@/types/timeControl';

/** Rating reported for a bucket whose column is null. */
const DEFAULT_RATING = 1200;

type CategoryStats = { played: number; wins: number; losses: number; draws: number };

interface StatsProfileRow {
    id: string;
    games_played: number | null;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    rating_bullet: number | null;
    rating_blitz: number | null;
    rating_rapid: number | null;
    rating_classical: number | null;
}

interface StatsGameRow extends OutcomeRow {
    time_control: string | null;
    white_accuracy?: number | null;
    black_accuracy?: number | null;
    created_at?: string | null;
}

const emptyCategory = (): CategoryStats => ({ played: 0, wins: 0, losses: 0, draws: 0 });

const OUTCOME_COUNTER = { win: 'wins', loss: 'losses', draw: 'draws' } as const;

/**
 * Played/won/lost/drawn per speed bucket, read like the game server reads a row (F12): an
 * aborted game is not counted, and a game nobody won is a draw, not a loss.
 */
function statsByCategory(games: StatsGameRow[], profileId: string): Record<SpeedBucket, CategoryStats> {
    const stats = {
        bullet: emptyCategory(),
        blitz: emptyCategory(),
        rapid: emptyCategory(),
        classical: emptyCategory(),
    };
    for (const game of games) {
        const outcome = playerOutcome(game, profileId);
        if (outcome === 'aborted') continue;
        const cat = classifyTimeControl(game.time_control);
        stats[cat].played++;
        stats[cat][OUTCOME_COUNTER[outcome]]++;
    }
    return stats;
}

/** W/L/D with the white pieces and with the black pieces (aborted games skipped). */
function statsByColour(games: StatsGameRow[], profileId: string): Record<'white' | 'black', CategoryStats> {
    const stats = { white: emptyCategory(), black: emptyCategory() };
    for (const game of games) {
        const outcome = playerOutcome(game, profileId);
        if (outcome === 'aborted') continue;
        const side = game.white_id === profileId ? stats.white : stats.black;
        side.played++;
        side[OUTCOME_COUNTER[outcome]]++;
    }
    return stats;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ownAccuracy = (game: StatsGameRow, profileId: string) =>
    game.white_id === profileId ? game.white_accuracy : game.black_accuracy;

/** Mean of the player's analysed accuracies, rounded; null when no game was analysed. */
function averageAccuracy(games: StatsGameRow[], profileId: string): number | null {
    const values = games.map((g) => ownAccuracy(g, profileId)).filter((a): a is number => typeof a === 'number');
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, a) => sum + a, 0) / values.length);
}

/** Most consecutive wins, oldest game first (aborted games neither extend nor break a streak). */
function longestWinStreak(games: StatsGameRow[], profileId: string): number {
    const ordered = [...games].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    let best = 0;
    let current = 0;
    for (const game of ordered) {
        const outcome = playerOutcome(game, profileId);
        if (outcome === 'aborted') continue;
        current = outcome === 'win' ? current + 1 : 0;
        best = Math.max(best, current);
    }
    return best;
}

/** The weekday (UTC) with the most played (not aborted) games; null without any. */
function mostActiveDay(games: StatsGameRow[], profileId: string): string | null {
    const counts = new Array<number>(WEEKDAYS.length).fill(0);
    for (const game of games) {
        if (game.created_at && playerOutcome(game, profileId) !== 'aborted') {
            counts[new Date(game.created_at).getUTCDay()]++;
        }
    }
    const top = Math.max(...counts);
    return top > 0 ? WEEKDAYS[counts.indexOf(top)] : null;
}

/** Response body of GET /api/profile/[username]/stats. */
export function buildProfileStats(profile: StatsProfileRow, games: StatsGameRow[]) {
    return {
        total: profile.games_played ?? 0,
        wins: profile.wins ?? 0,
        losses: profile.losses ?? 0,
        draws: profile.draws ?? 0,
        ratings: {
            bullet: profile.rating_bullet ?? DEFAULT_RATING,
            blitz: profile.rating_blitz ?? DEFAULT_RATING,
            rapid: profile.rating_rapid ?? DEFAULT_RATING,
            classical: profile.rating_classical ?? DEFAULT_RATING,
        },
        byCategory: statsByCategory(games, profile.id),
        byColour: statsByColour(games, profile.id),
        facts: {
            averageAccuracy: averageAccuracy(games, profile.id),
            longestWinStreak: longestWinStreak(games, profile.id),
            mostActiveDay: mostActiveDay(games, profile.id),
        },
    };
}
