// Password sign-in through POST /api/auth/login (F-101). The server resolves a username to its
// account and sets the session cookies on the response; the browser never sees the e-mail of
// an account it signed in to by username. Nothing is logged here (S14, SEC-01).

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_UNAUTHORIZED = 401;

export const INVALID_LOGIN = 'Invalid email, username or password';
export const LOGIN_RATE_LIMITED = 'Too many sign-in attempts. Please wait a few minutes and try again.';

/** The message for a failed sign-in response; null for success. */
function messageFor(status: number, body: { error?: string }): string {
    if (status === HTTP_TOO_MANY_REQUESTS) return LOGIN_RATE_LIMITED;
    if (status === HTTP_UNAUTHORIZED && body.error) return body.error;
    return INVALID_LOGIN;
}

/**
 * Signs in with an e-mail or username and a password. Resolves to null on success (the session
 * cookies are set), or to the message to show. A network failure rejects.
 */
export async function signInWithIdentifier(identifier: string, password: string): Promise<string | null> {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    if (res.ok) return null;
    const body: { error?: string } = await res.json().catch(() => ({}));
    return messageFor(res.status, body);
}
