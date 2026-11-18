// The optional public-profile fields (F-127): limits and choice lists shared by the API's zod
// schema, the settings form and the profile page. The database has the same rules as CHECK
// constraints (supabase/migrations/20261118100400_profile_extra_fields.sql).

export const PROFILE_TEXT_LIMITS = {
    city: 60,
    website: 200,
    favoriteOpening: 80,
    favoritePlayer: 60,
} as const;

export const PRONOUNS = ['he/him', 'she/her', 'they/them'] as const;
export type Pronouns = (typeof PRONOUNS)[number];

export const PLAYING_STYLES = ['aggressive', 'positional', 'tactical', 'balanced'] as const;
export type PlayingStyle = (typeof PLAYING_STYLES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'improving', 'club', 'tournament'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const PLAYING_STYLE_LABELS: Readonly<Record<PlayingStyle, string>> = {
    aggressive: 'Aggressive',
    positional: 'Positional',
    tactical: 'Tactical',
    balanced: 'Balanced',
};

export const EXPERIENCE_LABELS: Readonly<Record<Experience, string>> = {
    beginner: 'Beginner',
    improving: 'Improving',
    club: 'Club player',
    tournament: 'Tournament',
};

/** The database's rule: https://, a host, no whitespace (the length is checked separately). */
const HTTPS_URL = /^https:\/\/[^\s/?#]+\S*$/;

/** True for a link the profile may show: an https URL with a host and no whitespace. */
export function isHttpsUrl(value: string): boolean {
    if (!HTTPS_URL.test(value)) return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

/** Label of a stored playing style, or null for none / an unknown value. */
export const playingStyleLabel = (v: string | null | undefined): string | null =>
    v && Object.hasOwn(PLAYING_STYLE_LABELS, v) ? PLAYING_STYLE_LABELS[v as PlayingStyle] : null;

/** Label of a stored experience level, or null for none / an unknown value. */
export const experienceLabel = (v: string | null | undefined): string | null =>
    v && Object.hasOwn(EXPERIENCE_LABELS, v) ? EXPERIENCE_LABELS[v as Experience] : null;
