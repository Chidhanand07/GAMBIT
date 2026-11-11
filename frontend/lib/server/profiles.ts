import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RatingField } from '@/types/timeControl';
import { createAdminClient } from './supabase';

/** Starting rating in every speed bucket for a brand-new profile. */
const DEFAULT_RATING = 1200;
/** `<base>1` … `<base>99` are tried when the email-derived username is taken. */
const MAX_USERNAME_SUFFIX = 99;
const MAX_USERNAME_BASE_LENGTH = 15;

const STATS_COLUMNS =
    'id, games_played, wins, losses, draws, rating_bullet, rating_blitz, rating_rapid, rating_classical';
const LEADERBOARD_SIZE = 50;

/** Columns of a freshly created profile row (signup, /api/profile/me auto-create, OAuth). */
export function newProfileRow(id: string, username: string) {
    return {
        id,
        username,
        rating_bullet: DEFAULT_RATING,
        rating_blitz: DEFAULT_RATING,
        rating_rapid: DEFAULT_RATING,
        rating_classical: DEFAULT_RATING,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        created_at: new Date().toISOString(),
    };
}

/** `profiles.id` of a username (`select('id')…maybeSingle()`); the full query result. */
export function findProfileIdByUsername(admin: SupabaseClient, username: string) {
    return admin.from('profiles').select('id').eq('username', username).maybeSingle();
}

/** Full profile row by id. */
export function getProfileById(admin: SupabaseClient, id: string) {
    return admin.from('profiles').select('*').eq('id', id).maybeSingle();
}

/** Full profile row by username. */
export function getProfileByUsername(admin: SupabaseClient, username: string) {
    return admin.from('profiles').select('*').eq('username', username).maybeSingle();
}

/** Totals and ratings used by GET /api/profile/[username]/stats. */
export function getProfileStatsRow(admin: SupabaseClient, username: string) {
    return admin.from('profiles').select(STATS_COLUMNS).eq('username', username).maybeSingle();
}

/** Updates the caller's own profile and returns the updated row. */
export function updateProfile(admin: SupabaseClient, id: string, fields: Record<string, unknown>) {
    return admin.from('profiles').update(fields).eq('id', id).select().single();
}

/** Inserts a new profile row (no returning select). */
export function insertProfile(admin: SupabaseClient, row: Record<string, unknown>) {
    return admin.from('profiles').insert(row);
}

/** Top 50 profiles by one rating column, best first. */
export function listLeaderboard(admin: SupabaseClient, field: RatingField) {
    return admin
        .from('profiles')
        .select(`username, display_name, ${field}, games_played, wins, losses, draws`)
        .order(field, { ascending: false })
        .limit(LEADERBOARD_SIZE);
}

/** Email local part with non-word characters replaced by `_`, max 15 chars, else "player". */
function usernameBaseFromEmail(email: string): string {
    return (
        email
            .split('@')[0]
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .slice(0, MAX_USERNAME_BASE_LENGTH) || 'player'
    );
}

/** First free username among `<base>`, `<base>1` … `<base>99` (the last one tried if all are taken). */
async function pickAvailableUsername(admin: SupabaseClient, email: string): Promise<string> {
    const base = usernameBaseFromEmail(email);
    let username = base;
    for (let i = 1; i <= MAX_USERNAME_SUFFIX; i++) {
        const { data: existing } = await findProfileIdByUsername(admin, username);
        if (!existing) break;
        username = `${base}${i}`;
    }
    return username;
}

/**
 * GET /api/profile/me fallback: creates a default profile for an auth user that has none
 * and returns it, or null (logged) when the insert fails.
 */
export async function createDefaultProfile(admin: SupabaseClient, userId: string) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const username = await pickAvailableUsername(admin, authUser?.user?.email ?? '');

    const { data, error } = await admin.from('profiles').insert(newProfileRow(userId, username)).select().single();

    if (error) {
        console.error('[api/profile/me] auto-create failed:', error.message);
        return null;
    }
    return data;
}

/**
 * OAuth callback: creates a profile (with the provider avatar) unless one already exists.
 * Uses its own service-role client so that a failure to create it is caught by the caller.
 */
export async function ensureOAuthProfile(userId: string, email: string, avatarUrl: string | null): Promise<void> {
    const admin = createAdminClient();
    const { data: existing } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (existing) return;

    const username = await pickAvailableUsername(admin, email);
    await insertProfile(admin, { ...newProfileRow(userId, username), avatar_url: avatarUrl ?? null });
}
