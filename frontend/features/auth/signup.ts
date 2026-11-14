import { createClient } from '@/lib/supabase/client';
import type { UsernameStatus } from './hooks/useUsernameAvailability';

export const PASSWORD_MISMATCH = 'Passwords do not match';

const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/** Where a new, signed-in user lands. */
const LOBBY_PATH = '/lobby';

/**
 * Full page load to `url`. F-024: after sign-up the page is reloaded on purpose, so the
 * server components and the proxy see the new session cookies (router.push would keep the
 * signed-out render tree). The URL is absolute, built from this origin.
 */
export function fullPageLoad(url: string): void {
    window.location.assign(url);
}

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

/**
 * Creates the account via /api/auth/signup, then signs in with the browser client and
 * navigates to /lobby with a full page load (`navigate`, an absolute URL). Returns the message to show when the flow
 * stops early, or null after navigating. Network/unexpected errors propagate to the caller.
 * Nothing is logged: this runs in the browser, and the data at hand is credentials, the
 * session and its cookies (S14, SEC-01).
 */
export async function registerAndSignIn(
    input: SignupInput,
    navigate: (absoluteUrl: string) => void = fullPageLoad,
): Promise<string | null> {
    const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.email, password: input.password, username: input.username }),
    });

    const data: { error?: string } = await res.json().catch(() => ({}));

    if (!res.ok) return data.error || 'Signup failed. Please try again.';

    const supabase = createClient();
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
    });

    if (signInError) return 'Account created! Please sign in.';

    // No session after a successful sign-in: e-mail confirmation is required.
    if (!signInData.session) return 'Account created! Please confirm your email then sign in.';

    navigate(new URL(LOBBY_PATH, window.location.origin).href);
    return null;
}
