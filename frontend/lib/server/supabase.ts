import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

/** The `cookies()` store of the current request (next/headers). */
export type RequestCookieStore = ReturnType<typeof cookies>;

type ResponseCookieOptions = Parameters<NextResponse['cookies']['set']>[2];
type CookieToSet = { name: string; value: string; options?: object };

/** Auth options of the service-role client (fresh object per client). */
const noSessionPersistence = () => ({ autoRefreshToken: false, persistSession: false });

/**
 * Session cookies stay in the "raw" JSON form @supabase/ssr 0.1 wrote, so sessions created
 * before this upgrade keep working and `middleware.ts` (which reads the cookie for its
 * optimistic redirect) keeps understanding it. The browser client uses the same setting.
 */
export const SESSION_COOKIE_ENCODING = 'raw' as const;

/**
 * Service-role Supabase client (bypasses RLS). Created per call, reading the env at call time.
 * Only call it after `requireUser()` has returned a verified user (or from a route that is
 * public on purpose), and scope every query to that user (SEC-01, NX-08).
 */
export function createAdminClient(): SupabaseClient {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: noSessionPersistence(),
    });
}

/**
 * Anon-key @supabase/ssr client bound to the request's session cookies. Used only to ask
 * Supabase Auth who the caller is (`auth.getUser()`); it is never used to bypass RLS.
 *
 * `setAll` writes a refreshed session back. That works in Route Handlers; in a Server
 * Component the store is read-only and the write is skipped (the browser client refreshes).
 */
export function createSessionClient(cookieStore: RequestCookieStore) {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookieEncoding: SESSION_COOKIE_ENCODING,
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet: CookieToSet[]) => {
                try {
                    for (const { name, value, options } of cookiesToSet) {
                        cookieStore.set(name, value, options as ResponseCookieOptions);
                    }
                } catch {
                    // Read-only cookie store (Server Component): nothing to write.
                }
            },
        },
    });
}

/**
 * Anon-key @supabase/ssr client for `/api/auth/login` and the OAuth callback: reads the
 * request cookies and writes every session cookie Supabase sets (or clears) onto `response`.
 */
export function createResponseCookieClient(request: NextRequest, response: NextResponse) {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookieEncoding: SESSION_COOKIE_ENCODING,
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet: CookieToSet[]) => {
                for (const { name, value, options } of cookiesToSet) {
                    response.cookies.set(name, value, options as ResponseCookieOptions);
                }
            },
        },
    });
}
