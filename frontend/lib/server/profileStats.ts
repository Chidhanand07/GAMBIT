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
    };
}
