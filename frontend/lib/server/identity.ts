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
const HTTP_FORBIDDEN = 403;

type SessionAuth = ReturnType<typeof createSessionClient>['auth'];
type FreshUser = Awaited<ReturnType<SessionAuth['getUser']>>['data']['user'];

/** One entry of the token's `amr` claim: how and when the user authenticated. */
export interface AuthMethod {
    method: string;
    timestamp: number;
}

/** What the verified token (and, when fresh, Supabase Auth) says about the caller. */
export interface VerifiedSession {
    userId: string;
    /** Authenticator assurance level of this session ('aal1' password/OAuth, 'aal2' + TOTP). */
    aal: string | null;
    amr: AuthMethod[];
    /** The user as Supabase Auth returns it now; only with `fresh`. */
    user: FreshUser | null;
}

export type AuthResult = { ok: true; userId: string; session: VerifiedSession } | { ok: false; response: NextResponse };

export type IdentityOptions = {
    /** Also confirm with Supabase Auth (`getUser()`) that the session is still valid. */
    fresh?: boolean;
};

const asAmr = (value: unknown): AuthMethod[] =>
    Array.isArray(value)
        ? value.filter((m): m is AuthMethod => !!m && typeof m.method === 'string' && typeof m.timestamp === 'number')
        : [];

/** The verified claims as a session, or null when the token does not verify. */
async function verifiedClaims(auth: SessionAuth): Promise<Omit<VerifiedSession, 'user'> | null> {
    const { data, error } = await auth.getClaims();
    const claims = data?.claims as Record<string, unknown> | undefined;
    const sub = claims?.sub;
    if (error || typeof sub !== 'string' || !sub) return null;
    return { userId: sub, aal: typeof claims?.aal === 'string' ? claims.aal : null, amr: asAmr(claims?.amr) };
}

/** The user Supabase Auth knows for this session now, if it is `userId`. */
async function currentUser(auth: SessionAuth, userId: string): Promise<FreshUser | null> {
    const { data, error } = await auth.getUser();
    return !error && data?.user?.id === userId ? data.user : null;
}

/** The verified session of the caller, or null when it does not verify. */
export async function getVerifiedSession(options: IdentityOptions = {}): Promise<VerifiedSession | null> {
    // Outside the try on purpose: during `next build`, cookies() throws Next's "dynamic server
    // usage" signal, which is how a route is marked dynamic. Swallowing it would let Next
    // prerender the handler once and serve that 401 to everyone.
    const cookieStore = await cookies();
    try {
        const { auth } = createSessionClient(cookieStore);
        const claims = await verifiedClaims(auth);
        if (!claims) return null;
        if (!options.fresh) return { ...claims, user: null };
        const user = await currentUser(auth, claims.userId);
        return user ? { ...claims, user } : null;
    } catch (e) {
        console.error('[identity] could not verify the session:', (e as Error)?.message ?? e);
        return null;
    }
}

/** The verified user id of the caller, or null when the session does not verify. */
export async function getVerifiedUserId(options: IdentityOptions = {}): Promise<string | null> {
    return (await getVerifiedSession(options))?.userId ?? null;
}

/** True when the user has a verified second factor (two-factor is on, ADR F-144). */
export function hasVerifiedFactor(user: FreshUser | null): boolean {
    return (user?.factors ?? []).some((f) => f.status === 'verified');
}

async function authResult(options: IdentityOptions): Promise<AuthResult> {
    const session = await getVerifiedSession(options);
    if (!session) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Not authenticated' }, { status: HTTP_UNAUTHORIZED }),
        };
    }
    // Two-factor is on but this session never proved the second factor (ADR F-144).
    if (options.fresh && hasVerifiedFactor(session.user) && session.aal !== 'aal2') {
        return { ok: false, response: NextResponse.json({ error: 'mfa_required' }, { status: HTTP_FORBIDDEN }) };
    }
    return { ok: true, userId: session.userId, session };
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
 * When two-factor is on, the session must be AAL2 (403 `mfa_required` otherwise).
 */
export function requireFreshUser(): Promise<AuthResult> {
    return authResult({ fresh: true });
}
