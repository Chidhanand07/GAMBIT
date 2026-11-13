import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSessionClient } from './supabase';

// Caller identity for the route handlers (NX-07, NX-10).
//
// The only source of identity is Supabase Auth: `auth.getUser()` on a client bound to the
// request cookies sends the access token to Supabase, which checks its signature, expiry and
// revocation. Nothing in the cookie is decoded or trusted here, and `getSession()` (which
// only reads the cookie) is never used. Any failure means "not signed in" (SEC-09).

const HTTP_UNAUTHORIZED = 401;

export type AuthResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** The verified user id of the caller, or null when Supabase Auth does not confirm one. */
export async function getVerifiedUserId(): Promise<string | null> {
    // Outside the try on purpose: during `next build`, cookies() throws Next's "dynamic server
    // usage" signal, which is how a route is marked dynamic. Swallowing it would let Next
    // prerender the handler once and serve that 401 to everyone.
    const cookieStore = cookies();
    try {
        const { data, error } = await createSessionClient(cookieStore).auth.getUser();
        if (error || !data?.user?.id) return null;
        return data.user.id;
    } catch (e) {
        console.error('[identity] could not verify the session:', (e as Error)?.message ?? e);
        return null;
    }
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
export async function requireUser(): Promise<AuthResult> {
    const userId = await getVerifiedUserId();
    if (!userId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Not authenticated' }, { status: HTTP_UNAUTHORIZED }),
        };
    }
    return { ok: true, userId };
}
