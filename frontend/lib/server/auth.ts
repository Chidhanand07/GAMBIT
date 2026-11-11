import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { insertProfile, newProfileRow } from './profiles';

type AuthClient = Pick<SupabaseClient, 'auth'>;

const CODE_EXCHANGE_ATTEMPTS = 3;
/** Back-off before retry n is n × 1.5 s. */
const CODE_EXCHANGE_BACKOFF_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 401 message for a failed password sign-in. */
export function loginErrorMessage(error: { message: string }): string {
    return error.message.toLowerCase().includes('email not confirmed')
        ? 'Please confirm your email before signing in.'
        : 'Invalid email or password';
}

/** 400 message for a failed admin `createUser`. */
function signupErrorMessage(error: { message: string }): string {
    const message = error.message.toLowerCase();
    return message.includes('already registered') || message.includes('already exists')
        ? 'An account with this email already exists'
        : error.message;
}

/**
 * Signup: creates an unconfirmed auth user via the admin API (bypasses the anon email rate
 * limits), then its default profile; deletes the auth user again if the profile insert fails.
 * Returns the 400 error message, or null on success.
 */
export async function createUserWithProfile(
    admin: SupabaseClient,
    input: { email: string; password: string; username: string },
): Promise<string | null> {
    const { email, password, username } = input;
    const { data: created, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
    });

    if (authError) return signupErrorMessage(authError);
    if (!created?.user) return 'Signup failed. Please try again.';

    const { error: profileError } = await insertProfile(admin, newProfileRow(created.user.id, username));

    if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return profileError.message.includes('unique') ? 'Username already taken' : profileError.message;
    }
    return null;
}

/**
 * Exchanges an OAuth code for a session, retrying up to 3 times (1.5 s, 3 s back-off) only
 * while Supabase reports a rate limit. Returns the user, or the last error.
 */
export async function exchangeCodeWithRetry(
    supabase: AuthClient,
    code: string,
): Promise<{ user: User | null; lastError: Error | null }> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < CODE_EXCHANGE_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(CODE_EXCHANGE_BACKOFF_MS * attempt);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.user) return { user: data.user, lastError };
        lastError = error ?? new Error('Unknown error');
        if (!error?.message.toLowerCase().includes('rate limit')) break;
    }
    return { user: null, lastError };
}
