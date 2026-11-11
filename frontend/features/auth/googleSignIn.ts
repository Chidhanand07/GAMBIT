import { createClient } from '@/lib/supabase/client';

export const GOOGLE_SIGN_IN_FAILED = 'Google sign-in failed. Please try again.';

/**
 * Starts the Google OAuth redirect via Supabase (login and signup pages).
 * Calls `onError` with the shared message when Supabase returns an error or throws.
 */
export async function startGoogleSignIn(onError: (message: string) => void): Promise<void> {
    try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) onError(GOOGLE_SIGN_IN_FAILED);
    } catch {
        onError(GOOGLE_SIGN_IN_FAILED);
    }
}
