// Response shapes of the profile page's API routes (app/api/profile/[username]/{games,stats}).
import type { Game } from './game';
import type { ProfileSummary } from './profile';
import type { SpeedBucket } from './timeControl';

/** Row of GET /api/profile/[username]/games (players embedded via PostgREST joins). */
export interface ProfileGameRow extends Pick<Game, 'id' | 'time_control' | 'status' | 'result' | 'winner_id'> {
    white_accuracy: number | null;
    black_accuracy: number | null;
    created_at: string;
    ended_at: string | null;
    white_id: string;
    black_id: string;
    white: ProfileSummary | null;
    black: ProfileSummary | null;
}

/** GET /api/profile/[username]/games body. */
export interface ProfileGamesPayload {
    games?: ProfileGameRow[];
    profileId?: string;
}

export interface CategoryRecord {
    played: number;
    wins: number;
    losses: number;
    draws: number;
}

/** Derived facts of GET /api/profile/[username]/stats. */
export interface ProfileFacts {
    /** Mean analysed accuracy (%), null when no game was analysed. */
    averageAccuracy: number | null;
    longestWinStreak: number;
    /** English weekday name (UTC), null without games. */
    mostActiveDay: string | null;
}

/** GET /api/profile/[username]/stats. Every field is read defensively by the page. */
export interface ProfileStats {
    total?: number;
    wins?: number;
    losses?: number;
    draws?: number;
    ratings?: Partial<Record<SpeedBucket, number | null>>;
    byCategory?: Partial<Record<SpeedBucket, CategoryRecord>>;
    byColour?: Partial<Record<'white' | 'black', CategoryRecord>>;
    facts?: ProfileFacts;
}
