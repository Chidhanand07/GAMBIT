import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublicKey } from '@/lib/supabase/publicEnv';
import { SESSION_COOKIE_ENCODING } from './supabase';

// Session refresh for proxy.ts, following the current @supabase/ssr guidance (NX-09, NX-10):
// a client bound to the request cookies, `getAll` / `setAll`, identity from `getClaims()`
// (never `getSession()`), and the caller returns the response this module builds, so
// refreshed cookies and their no-store headers are not lost.

type CookieToSet = { name: string; value: string; options?: object };
type ResponseCookieOptions = Parameters<NextResponse['cookies']['set']>[2];

export type RefreshedSession = {
    /** Pass-through response carrying any refreshed session cookies and their cache headers. */
    response: NextResponse;
    /** Verified user id, or null when Supabase Auth does not confirm a session. */
    userId: string | null;
};

/** Copies the session cookies and cache headers of `from` onto another response. */
export function carrySession(from: NextResponse, to: NextResponse): NextResponse {
    for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
    for (const header of ['cache-control', 'expires', 'pragma']) {
        const value = from.headers.get(header);
        if (value) to.headers.set(header, value);
    }
    return to;
}

/**
 * Lets Supabase refresh an expired access token and reports who the caller is.
 * Any failure means "not signed in" (SEC-09).
 */
export async function refreshSession(request: NextRequest): Promise<RefreshedSession> {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabasePublicKey()!, {
        cookieEncoding: SESSION_COOKIE_ENCODING,
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet: CookieToSet[], headers: Record<string, string>) => {
                // The page rendered after the proxy must see the new cookies too.
                for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
                response = NextResponse.next({ request });
                for (const { name, value, options } of cookiesToSet) {
                    response.cookies.set(name, value, options as ResponseCookieOptions);
                }
                // Supabase marks a response that sets auth cookies as not cacheable.
                for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
            },
        },
    });

    try {
        const { data, error } = await supabase.auth.getClaims();
        const sub = data?.claims?.sub;
        const userId = !error && typeof sub === 'string' && sub ? sub : null;
        return { response, userId };
    } catch (e) {
        console.error('[proxy] could not verify the session:', (e as Error)?.message ?? e);
        return { response, userId: null };
    }
}
