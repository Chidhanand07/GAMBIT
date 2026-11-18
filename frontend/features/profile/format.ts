// Pure display helpers for the profile page.
import { playerOutcome, type OutcomeRow, type PlayerOutcome } from '@/lib/chess/gameOutcome';
import type { Profile } from '@/types/profile';

const PERCENT = 100;

/** "Jan 5, 2024" (en-US); empty string for a missing date. */
export function formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ProfileRecord {
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    /** Rounded percentage of wins; 0 when no games were played. */
    winRate: number;
}

/** Lifetime W/L/D counters from the profile row (missing counters read as 0). */
export function profileRecord(profile: Pick<Profile, 'games_played' | 'wins' | 'losses' | 'draws'>): ProfileRecord {
    const gamesPlayed = profile.games_played ?? 0;
    const wins = profile.wins ?? 0;
    const losses = profile.losses ?? 0;
    const draws = profile.draws ?? 0;
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * PERCENT) : 0;
    return { gamesPlayed, wins, losses, draws, winRate };
}

/** Outcome of a finished game for `profileId`: win, loss, draw or aborted (see lib/chess/gameOutcome). */
export function gameOutcome(game: OutcomeRow, profileId: string): PlayerOutcome {
    return playerOutcome(game, profileId);
}
