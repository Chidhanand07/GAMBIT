import { createClient } from '@/lib/supabase/client';
import type { UsernameStatus } from './hooks/useUsernameAvailability';

export const PASSWORD_MISMATCH = 'Passwords do not match';

const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export interface SignupInput {
    email: string;
    password: string;
    username: string;
}

/** Client-side checks run before calling the API, in the order the user sees them. Returns the first error. */
export function validateSignup(
    { password, username }: SignupInput,
    confirm: string,
    usernameStatus: UsernameStatus,
): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) return 'Password must be at least 8 characters';
    if (password !== confirm) return PASSWORD_MISMATCH;
    if (usernameStatus === 'taken') return 'Username already taken';
    if (username.length < MIN_USERNAME_LENGTH) return 'Username must be at least 3 characters';
    if (!USERNAME_PATTERN.test(username)) return 'Username may only contain letters, numbers, and underscores';
    return null;
}

type SignInResult = Awaited<ReturnType<ReturnType<typeof createClient>['auth']['signInWithPassword']>>;

/** Summary of the post-signup sign-in, for the debug log. */
function describeSignIn(signInData: SignInResult['data'], signInError: SignInResult['error']) {
    return {
        user: signInData?.user?.email ?? null,
        session: signInData?.session ? `expires=${signInData.session.expires_at}` : null,
        error: signInError?.message ?? null,
    };
}

/**
 * Creates the account via /api/auth/signup, then signs in with the browser client and
 * navigates to /lobby with a full page load. Returns the message to show when the flow
 * stops early, or null after navigating. Network/unexpected errors propagate to the caller.
 */
export async function registerAndSignIn(input: SignupInput): Promise<string | null> {
    console.log('[signup] calling /api/auth/signup...');
    const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.email, password: input.password, username: input.username }),
    });

    const data: { error?: string } = await res.json().catch(() => ({}));
    console.log('[signup] API response:', res.status, data);

    if (!res.ok) return data.error || 'Signup failed. Please try again.';

    console.log('[signup] profile created, signing in via browser client...');
    const supabase = createClient();
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
    });

    console.log('[signup] signIn result:', describeSignIn(signInData, signInError));

    if (signInError) {
        console.error('[signup] sign-in after signup failed:', signInError.message);
        return 'Account created! Please sign in.';
    }

    if (!signInData.session) {
        console.warn('[signup] no session after sign-in — email confirmation likely required');
        return 'Account created! Please confirm your email then sign in.';
    }

    console.log(
        '[signup] cookies after sign-in:',
        document.cookie.split(';').map((s) => s.trim().split('=')[0]),
    );
    console.log('[signup] navigating to /lobby...');
    window.location.assign('/lobby');
    return null;
}
