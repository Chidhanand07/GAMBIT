import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSessionClient } from './supabase';

// Caller identity for the route handlers (NX-07, NX-10).
//
// Identity is the VERIFIED claims of the access token: `auth.getClaims()` on a client bound to
// the request cookies checks the token's signature and expiry. With asymmetric signing keys
// that happens locally against the project's cached JWKS (no network call per request); a
// project still on the legacy shared secret is verified by Supabase Auth instead, by the same
// call. Unverified cookie contents are never read, and `getSession()` (which only parses the
// cookie) is never used. Any failure means "not signed in" (SEC-09).
//
// Verified claims say who signed in and that the token has not expired. They do not say that
// the session still exists: a sign-out or ban takes effect when the token expires. Routes
// that change the account use `requireFreshUser()`, which also asks Supabase Auth.

const HTTP_UNAUTHORIZED = 401;

type SessionAuth = ReturnType<typeof createSessionClient>['auth'];

export type AuthResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

export type IdentityOptions = {
    /** Also confirm with Supabase Auth (`getUser()`) that the session is still valid. */
    fresh?: boolean;
};

/** The subject of the verified claims, or null when the token does not verify. */
async function verifiedSubject(auth: SessionAuth): Promise<string | null> {
    const { data, error } = await auth.getClaims();
    const sub: unknown = data?.claims?.sub;
    return !error && typeof sub === 'string' && sub ? sub : null;
}

/** True when Supabase Auth, asked now, still knows this session as `userId`. */
async function isCurrentUser(auth: SessionAuth, userId: string): Promise<boolean> {
    const { data, error } = await auth.getUser();
    return !error && data?.user?.id === userId;
}

/** The verified user id of the caller, or null when the session does not verify. */
export async function getVerifiedUserId(options: IdentityOptions = {}): Promise<string | null> {
    // Outside the try on purpose: during `next build`, cookies() throws Next's "dynamic server
    // usage" signal, which is how a route is marked dynamic. Swallowing it would let Next
    // prerender the handler once and serve that 401 to everyone.
    const cookieStore = await cookies();
    try {
        const { auth } = createSessionClient(cookieStore);
        const userId = await verifiedSubject(auth);
        if (!userId) return null;
        if (options.fresh && !(await isCurrentUser(auth, userId))) return null;
        return userId;
    } catch (e) {
        console.error('[identity] could not verify the session:', (e as Error)?.message ?? e);
        return null;
    }
}

async function authResult(options: IdentityOptions): Promise<AuthResult> {
    const userId = await getVerifiedUserId(options);
    if (!userId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Not authenticated' }, { status: HTTP_UNAUTHORIZED }),
        };
    }
    return { ok: true, userId };
}

/**
 * First line of every non-public route handler:
 *
 *     const auth = await requireUser();
 *     if (!auth.ok) return auth.response;
 *
 * Only after this may a handler create the service-role client, and every query it makes
 * must be scoped to `auth.userId`.
 */
export function requireUser(): Promise<AuthResult> {
    return authResult({});
}

/**
 * `requireUser()` plus a round trip to Supabase Auth, for routes that change the account:
 * a signed-out, banned or deleted user is refused immediately, not when the token expires.
 */
export function requireFreshUser(): Promise<AuthResult> {
    return authResult({ fresh: true });
}
