import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

/** The `cookies()` store of the current request (next/headers). */
export type RequestCookieStore = ReturnType<typeof cookies>;

type ResponseCookieOptions = Parameters<NextResponse['cookies']['set']>[2];

/** Auth options the service-role client and the session-reading client pass (fresh object per client). */
const noSessionPersistence = () => ({ autoRefreshToken: false, persistSession: false });

/**
 * Service-role Supabase client (bypasses RLS). Created per call, reading the env at call
 * time, exactly like the per-handler `makeAdmin()` copies it replaces.
 */
export function createAdminClient(): SupabaseClient {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: noSessionPersistence(),
    });
}

/**
 * Anon-key @supabase/ssr client that only reads the request cookies (set/remove are no-ops).
 * `persistSession: false` is passed only by the handlers that already did (`/api/games/[id]`).
 */
export function createCookieReadingClient(cookieStore: RequestCookieStore, options: { noPersistence?: boolean } = {}) {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            get: (name: string) => cookieStore.get(name)?.value,
            set: () => {},
            remove: () => {},
        },
        ...(options.noPersistence ? { auth: noSessionPersistence() } : {}),
    });
}

/**
 * Anon-key @supabase/ssr client for `/api/auth/login`: reads the request cookies and writes
 * every session cookie Supabase sets onto `response` (removal = empty value with maxAge 0).
 */
export function createLoginClient(request: NextRequest, response: NextResponse) {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            get: (name: string) => request.cookies.get(name)?.value,
            set: (name: string, value: string, options: Record<string, unknown>) => {
                response.cookies.set(name, value, options as ResponseCookieOptions);
            },
            remove: (name: string, options: Record<string, unknown>) => {
                response.cookies.set(name, '', { ...(options as ResponseCookieOptions), maxAge: 0 });
            },
        },
    });
}

/**
 * Anon-key @supabase/ssr client for the OAuth callback: like {@link createLoginClient} but
 * removal writes an empty value with the given options only (no `maxAge: 0`).
 */
export function createOAuthCallbackClient(request: NextRequest, response: NextResponse) {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            get(name: string) {
                return request.cookies.get(name)?.value;
            },
            set(name: string, value: string, options: object) {
                response.cookies.set(name, value, options as ResponseCookieOptions);
            },
            remove(name: string, options: object) {
                response.cookies.set(name, '', options as ResponseCookieOptions);
            },
        },
    });
}
