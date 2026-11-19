// Defaults and a defensive parse of the account preferences (ADR F-140). Pure: used by the
// settings feature in the browser and by lib/server/preferences.ts. The defaults are the
// mockup's (design/Settings.dc.html) and the column defaults of public.user_preferences.
import type {
    AccountPreferences,
    ChallengePolicy,
    GameplayPrefs,
    NotificationPrefs,
    PrivacyPrefs,
    SecurityPrefs,
} from '@/types/preferences';

export const CHALLENGE_POLICIES: readonly ChallengePolicy[] = ['everyone', 'friends', 'nobody'];

export const DEFAULT_ACCOUNT_PREFERENCES: Readonly<AccountPreferences> = Object.freeze({
    notifications: Object.freeze({
        challenges: true,
        friendRequests: true,
        gameResults: true,
        yourTurn: true,
        emailDigest: false,
        browser: false,
    }),
    privacy: Object.freeze({
        showOnline: true,
        challengePolicy: 'everyone',
        appearInSearch: true,
        showOnLeaderboard: true,
        allowSpectators: true,
    }),
    security: Object.freeze({ emailOnNewSignIn: true }),
    gameplay: Object.freeze({ premoves: false, allowTakebacks: false }),
});

type Section = keyof AccountPreferences;

const asRecord = (raw: unknown): Record<string, unknown> =>
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** Every boolean key of `defaults` taken from `raw` when it is a boolean there. */
function booleans<T extends object>(defaults: T, raw: unknown): T {
    const src = asRecord(raw);
    const out = { ...defaults } as Record<string, unknown>;
    for (const [key, fallback] of Object.entries(defaults)) {
        if (typeof fallback === 'boolean' && typeof src[key] === 'boolean') out[key] = src[key];
    }
    return out as T;
}

function parsePrivacy(raw: unknown): PrivacyPrefs {
    const privacy = booleans(DEFAULT_ACCOUNT_PREFERENCES.privacy, raw);
    const policy = asRecord(raw).challengePolicy;
    return {
        ...privacy,
        challengePolicy: CHALLENGE_POLICIES.includes(policy as ChallengePolicy)
            ? (policy as ChallengePolicy)
            : DEFAULT_ACCOUNT_PREFERENCES.privacy.challengePolicy,
    };
}

/** Whatever the API or a draft holds, read back as preferences: unknown keys dropped, bad values defaulted. */
export function parseAccountPreferences(raw: unknown): AccountPreferences {
    const src = asRecord(raw);
    return {
        notifications: booleans<NotificationPrefs>(DEFAULT_ACCOUNT_PREFERENCES.notifications, src.notifications),
        privacy: parsePrivacy(src.privacy),
        security: booleans<SecurityPrefs>(DEFAULT_ACCOUNT_PREFERENCES.security, src.security),
        gameplay: booleans<GameplayPrefs>(DEFAULT_ACCOUNT_PREFERENCES.gameplay, src.gameplay),
    };
}

/** `prefs` with one value of one section replaced (and re-validated). */
export function withPreference(prefs: AccountPreferences, section: Section, key: string, value: unknown) {
    return parseAccountPreferences({ ...prefs, [section]: { ...prefs[section], [key]: value } });
}
