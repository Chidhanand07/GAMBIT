import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeWithRetry } from '@/lib/server/auth';
import { ensureOAuthProfile } from '@/lib/server/profiles';
import { createOAuthCallbackClient } from '@/lib/server/supabase';

const loginErrorRedirect = (message: string, request: NextRequest) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));

/** Auto-create profile for OAuth users (Google, GitHub, etc.); failures are logged, not fatal. */
async function ensureProfileNonFatal(user: User) {
    try {
        await ensureOAuthProfile(user.id, user.email ?? '', (user.user_metadata?.avatar_url as string | null) ?? null);
    } catch (err) {
        console.error('[auth/callback] profile ensure failed:', err);
        // Non-fatal — user can still proceed
    }
}

// GET /auth/callback?code=&next= — OAuth code exchange, then redirect to `next` (default /lobby)
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/lobby';
    const errorParam = searchParams.get('error');

    if (errorParam) return loginErrorRedirect(errorParam, request);

    if (!code) {
        return NextResponse.redirect(new URL('/login?error=no_code', request.url));
    }

    const response = NextResponse.redirect(new URL(next, request.url));
    const supabase = createOAuthCallbackClient(request, response);

    // Retry up to 3 times with backoff if rate-limited
    const { user: exchangedUser, lastError } = await exchangeCodeWithRetry(supabase, code);

    if (!exchangedUser) {
        console.error('[auth/callback] exchange failed:', lastError?.message);
        return loginErrorRedirect(lastError?.message ?? 'oauth_failed', request);
    }

    await ensureProfileNonFatal(exchangedUser);

    return response;
}
