// Messages for the `?error=` a sign-in flow sends back to /login (the OAuth callback route
// and /auth/exchange). The parameter is attacker-controllable, so only known codes get a
// specific message and raw text is never echoed onto the page (F17).
import { GOOGLE_SIGN_IN_FAILED } from './googleSignIn';

const GENERIC_SIGN_IN_FAILED = 'Sign-in failed. Please try again.';

const MESSAGES: Readonly<Record<string, string>> = {
    oauth_failed: GOOGLE_SIGN_IN_FAILED,
    no_code: GOOGLE_SIGN_IN_FAILED,
};

/** The message for a `?error=` value; null when there is none. */
export function loginErrorMessage(code: string | null): string | null {
    if (!code) return null;
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC_SIGN_IN_FAILED;
}
