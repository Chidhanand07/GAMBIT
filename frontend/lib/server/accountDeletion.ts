import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VerifiedSession } from './identity';
import { createPasswordProbeClient } from './supabase';

// Account deletion (ADR F-145): re-authentication, then the data (public.delete_account, one
// transaction), the avatar files and the auth user. Logs carry a short hash of the user id only.

/** An OAuth-only account must have signed in this recently to delete itself. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const SECOND_MS = 1000;
/** Long enough to mean "never" while the deletion runs (Supabase takes a Go duration). */
const BAN_FOR = '876000h';
const AVATAR_BUCKET = 'avatars';
const LOG_REF_LENGTH = 12;

export type Step<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

/** A short, non-reversible reference for logs (no user id or e-mail in the log, SEC-01). */
export const logRef = (userId: string) => createHash('sha256').update(userId).digest('hex').slice(0, LOG_REF_LENGTH);

type FreshUser = NonNullable<VerifiedSession['user']>;

/** True when the user can sign in with a password (an `email` identity). */
export function hasPassword(user: FreshUser): boolean {
    return (user.identities ?? []).some((i) => i.provider === 'email');
}

/** When the newest sign-in method of this session was used, in ms (amr timestamps are seconds). */
function lastSignInMs(session: VerifiedSession): number {
    return Math.max(0, ...session.amr.map((m) => m.timestamp * SECOND_MS));
}

/**
 * Proves it is the user: the account password when there is one (checked on a throwaway client
 * that stores no session; that session is signed out again), otherwise a sign-in in the last
 * ten minutes. Two-factor (AAL2) was already required by requireFreshUser().
 */
export async function reauthenticate(
    session: VerifiedSession,
    password: string | undefined,
    now = Date.now(),
): Promise<Step> {
    const user = session.user;
    if (!user) return { ok: false, status: 401, error: 'reauth_required' };
    if (!hasPassword(user)) {
        return now - lastSignInMs(session) <= REAUTH_WINDOW_MS
            ? { ok: true }
            : { ok: false, status: 401, error: 'reauth_required' };
    }
    if (!password || !user.email) return { ok: false, status: 401, error: 'password_required' };
    const probe = createPasswordProbeClient();
    const { data, error } = await probe.auth.signInWithPassword({ email: user.email, password });
    if (error || data.user?.id !== user.id) return { ok: false, status: 401, error: 'wrong_password' };
    await probe.auth.signOut().catch(() => {});
    return { ok: true };
}

/** Bans (true) or unbans the auth user: nobody can sign in while their data is being removed. */
export async function setSignInBlocked(admin: SupabaseClient, userId: string, blocked: boolean): Promise<boolean> {
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? BAN_FOR : 'none' });
    if (error)
        console.error(`[account/delete] ${blocked ? 'ban' : 'unban'} failed (ref ${logRef(userId)}):`, error.message);
    return !error;
}

/** public.delete_account: the data, atomically. `active_game` when the user is still playing. */
export async function deleteAccountData(admin: SupabaseClient, userId: string): Promise<Step> {
    const { error } = await admin.rpc('delete_account', { p_user_id: userId });
    if (!error) return { ok: true };
    if (error.code === '55000') return { ok: false, status: 409, error: 'active_game' };
    console.error(`[account/delete] delete_account failed (ref ${logRef(userId)}):`, error.code, error.message);
    return { ok: false, status: 500, error: 'delete_failed' };
}

/** The user's avatar files (best effort: a leftover file is logged, not fatal). */
export async function removeAvatarFiles(admin: SupabaseClient, userId: string): Promise<void> {
    try {
        const bucket = admin.storage.from(AVATAR_BUCKET);
        const { data } = await bucket.list(userId);
        const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
        if (paths.length > 0) await bucket.remove(paths);
    } catch (e) {
        console.error(`[account/delete] avatar cleanup failed (ref ${logRef(userId)}):`, (e as Error)?.message);
    }
}

/** The auth user, last. A failure leaves them banned (cannot sign in), and is reported. */
export async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<Step> {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) return { ok: true };
    console.error(`[account/delete] auth deleteUser failed (ref ${logRef(userId)}):`, error.message);
    return { ok: false, status: 500, error: 'auth_delete_failed' };
}

/** The checks before anything is removed: the typed username matches, then re-authentication. */
export async function confirmDeletion(
    admin: SupabaseClient,
    session: VerifiedSession,
    input: { confirmUsername: string; password?: string },
): Promise<Step> {
    const { data: profile, error } = await admin
        .from('profiles')
        .select('username')
        .eq('id', session.userId)
        .maybeSingle();
    if (error) return { ok: false, status: 500, error: 'delete_failed' };
    if (!profile) return { ok: false, status: 404, error: 'profile_not_found' };
    if (input.confirmUsername !== profile.username) return { ok: false, status: 400, error: 'username_mismatch' };
    return reauthenticate(session, input.password);
}

/** Ban → data (unbanned again if that fails) → avatar files → auth user. */
export async function deleteAccountEverywhere(admin: SupabaseClient, userId: string): Promise<Step> {
    if (!(await setSignInBlocked(admin, userId, true))) return { ok: false, status: 500, error: 'delete_failed' };
    const data = await deleteAccountData(admin, userId);
    if (!data.ok) {
        await setSignInBlocked(admin, userId, false);
        return data;
    }
    await removeAvatarFiles(admin, userId);
    return deleteAuthUser(admin, userId);
}
