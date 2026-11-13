import { NextResponse, type NextRequest } from 'next/server';
import { carrySession, refreshSession } from '@/lib/server/sessionRefresh';

// Next 16 proxy (was middleware.ts). Two jobs only (NX-09):
//   1. let @supabase/ssr refresh the session cookies;
//   2. send visitors without a verified session away from pages that need one.
// It is an optimistic redirect, NOT an authorization check: every route handler calls
// requireUser() itself, and the data is protected there (and by RLS).

const LOGIN_PATH = '/login';

export async function proxy(request: NextRequest) {
    const { response, userId } = await refreshSession(request);
    if (userId) return response;

    const { pathname, search } = request.nextUrl;
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    url.searchParams.set('redirect', pathname + search);
    // Keep whatever Supabase set or cleared while trying to refresh.
    return carrySession(response, NextResponse.redirect(url));
}

// Allow-list: the proxy runs only on pages that require a session. API routes verify the
// caller themselves; public pages and static files never reach this code.
export const config = {
    matcher: [
        '/lobby/:path*',
        '/game/:path*',
        '/profile/:path*',
        '/leaderboard/:path*',
        '/settings/:path*',
        '/challenge/:path*',
    ],
};
