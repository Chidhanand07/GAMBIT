import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findProfilesByUsernameIgnoringCase } from './profiles';
import { schemas } from './validation';

// Sign-in with "Email or username" (Signin.dc.html, F-101). A username is turned into its
// account's e-mail here, on the server, with the secret-key client. The e-mail is never
// returned to the caller and never logged; an unknown username does the same work as a known
// one, so the response cannot tell them apart (no username enumeration).

/** Every failed sign-in takes at least this long, whatever failed (timing class, F-101). */
export const FAILED_LOGIN_MIN_MS = 800;

/** Usernames cannot contain `@` (schemas.usernameParam), so anything with one is an e-mail. */
export function isEmailIdentifier(identifier: string): boolean {
    return identifier.includes('@');
}

/**
 * An address no account can have (the reserved `.invalid` TLD, RFC 2606) and that is new on
 * every call: the password check for an unknown user runs against it.
 */
export function unknownAccountEmail(): string {
    return `${randomUUID()}@login.invalid`;
}

type ProfileMatch = { id: string; username: string };

/** One profile for a case-insensitive match: the only row, or the row with the exact spelling. */
function pickProfile(rows: ProfileMatch[], username: string): ProfileMatch | null {
    if (rows.length === 1) return rows[0];
    return rows.find((row) => row.username === username) ?? null;
}

async function emailOfUser(admin: SupabaseClient, userId: string): Promise<string | null> {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
}

/**
 * The e-mail to sign in with for `identifier`, or null when no account matches. An e-mail is
 * returned as typed. A username is matched case-insensitively and exactly (no wildcards).
 * The unknown path still asks Supabase Auth for a user (a random id), so it is not faster.
 */
export async function resolveLoginEmail(admin: SupabaseClient, identifier: string): Promise<string | null> {
    if (isEmailIdentifier(identifier)) return identifier;
    if (!schemas.usernameParam.safeParse(identifier).success) {
        await emailOfUser(admin, randomUUID());
        return null;
    }
    const { data, error } = await findProfilesByUsernameIgnoringCase(admin, identifier);
    const profile = error || !data ? null : pickProfile(data as ProfileMatch[], identifier);
    const email = await emailOfUser(admin, profile?.id ?? randomUUID());
    return profile ? email : null;
}

/** Waits until `FAILED_LOGIN_MIN_MS` have passed since `startedAt` (a `Date.now()` value). */
export async function waitForFailureFloor(startedAt: number): Promise<void> {
    const remaining = FAILED_LOGIN_MIN_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
