import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSettings } from '@/features/settings/model';
import { DEFAULT_ACCOUNT_PREFERENCES, parseAccountPreferences } from '@/lib/preferences';
import type { AccountPreferences, PreferencesPayload } from '@/types/preferences';

// public.user_preferences (ADR F-140). The owner reads and writes their row through their own
// session client (RLS + column grants); the privacy filters read other users' rows with the
// secret key (SELECT only).

type Section = keyof AccountPreferences;
type Row = Record<string, unknown>;

/** API field → column, per section. The only columns this module ever writes. */
const COLUMNS: { [S in Section]: Record<keyof AccountPreferences[S], string> } = {
    notifications: {
        challenges: 'notify_challenges',
        friendRequests: 'notify_friend_requests',
        gameResults: 'notify_game_results',
        yourTurn: 'notify_your_turn',
        emailDigest: 'notify_email_digest',
        browser: 'notify_browser',
    },
    privacy: {
        showOnline: 'show_online',
        challengePolicy: 'challenge_policy',
        appearInSearch: 'appear_in_search',
        showOnLeaderboard: 'show_on_leaderboard',
        allowSpectators: 'allow_spectators',
    },
    security: { emailOnNewSignIn: 'email_on_new_sign_in' },
    gameplay: { premoves: 'premoves', allowTakebacks: 'allow_takebacks' },
};

const SECTIONS = Object.keys(COLUMNS) as Section[];
const SELECT_COLUMNS = ['play', ...SECTIONS.flatMap((s) => Object.values<string>(COLUMNS[s]))].join(', ');

/** Body of PATCH /api/settings after validation: any subset of sections and keys. */
export interface PreferencesPatch {
    play?: Record<string, unknown>;
    notifications?: Partial<AccountPreferences['notifications']>;
    privacy?: Partial<AccountPreferences['privacy']>;
    security?: Partial<AccountPreferences['security']>;
    gameplay?: Partial<AccountPreferences['gameplay']>;
}

/** A row (or no row) as the API payload; no row = the defaults, `stored: false`. */
export function toPreferencesPayload(row: Row | null): PreferencesPayload {
    if (!row) return { stored: false, play: {}, ...structuredClone(DEFAULT_ACCOUNT_PREFERENCES) };
    const raw: Record<string, Record<string, unknown>> = {};
    for (const section of SECTIONS) {
        raw[section] = {};
        for (const [field, column] of Object.entries<string>(COLUMNS[section])) raw[section][field] = row[column];
    }
    const play = row.play && typeof row.play === 'object' ? (row.play as Record<string, unknown>) : {};
    return { stored: true, play: { ...parseSettings(play) }, ...parseAccountPreferences(raw) };
}

/** The columns a PATCH writes; null when it changes nothing. `play` is normalised with parseSettings. */
export function preferencesUpdateFromPatch(patch: PreferencesPatch): Row | null {
    const update: Row = {};
    if (patch.play) update.play = { ...parseSettings(patch.play) };
    for (const section of SECTIONS) {
        const values = (patch[section] ?? {}) as Record<string, unknown>;
        for (const [field, column] of Object.entries<string>(COLUMNS[section])) {
            if (values[field] !== undefined) update[column] = values[field];
        }
    }
    return Object.keys(update).length > 0 ? update : null;
}

/** The caller's row, or null when they never saved (`maybeSingle`). */
export function getOwnPreferences(userClient: SupabaseClient, userId: string) {
    return userClient.from('user_preferences').select(SELECT_COLUMNS).eq('user_id', userId).maybeSingle();
}

const UNIQUE_VIOLATION = '23505';

/**
 * Writes the caller's row: UPDATE first, INSERT when there is none (the column grants give
 * `authenticated` no UPDATE on user_id, which an upsert's DO UPDATE would need). A concurrent
 * first save makes the INSERT hit the primary key; the UPDATE is then retried once.
 */
export async function saveOwnPreferences(userClient: SupabaseClient, userId: string, update: Row) {
    const table = () => userClient.from('user_preferences');
    const updated = await table().update(update).eq('user_id', userId).select(SELECT_COLUMNS);
    if (updated.error || (updated.data ?? []).length > 0) {
        return { data: (updated.data?.[0] ?? null) as Row | null, error: updated.error };
    }
    const inserted = await table()
        .insert({ user_id: userId, ...update })
        .select(SELECT_COLUMNS)
        .single();
    if (inserted.error?.code !== UNIQUE_VIOLATION) return { data: inserted.data as Row | null, error: inserted.error };
    const retried = await table().update(update).eq('user_id', userId).select(SELECT_COLUMNS).single();
    return { data: retried.data as Row | null, error: retried.error };
}

/** Ids among `userIds` whose owners turned "Allow spectators" off. */
export function listSpectatorBlockers(admin: SupabaseClient, userIds: string[]) {
    return admin.from('user_preferences').select('user_id').in('user_id', userIds).eq('allow_spectators', false);
}

/**
 * Whether `userId` wants a bell notification of this kind. No row = the default (on); a failed
 * read sends none (a missed notification is better than one the user turned off).
 */
export async function wantsNotification(
    admin: SupabaseClient,
    userId: string,
    kind: keyof AccountPreferences['notifications'],
): Promise<boolean> {
    const column = COLUMNS.notifications[kind];
    const { data, error } = await admin.from('user_preferences').select(column).eq('user_id', userId).maybeSingle();
    if (error) return false;
    const value = (data as Row | null)?.[column];
    return typeof value === 'boolean' ? value : DEFAULT_ACCOUNT_PREFERENCES.notifications[kind];
}
