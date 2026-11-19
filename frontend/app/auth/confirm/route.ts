import { NextResponse, type NextRequest } from 'next/server';
import { createResponseCookieClient } from '@/lib/server/supabase';
import { safeRedirectPath } from '@/lib/safeRedirect';

// GET /auth/confirm?token_hash=&type=email_change&next= — the link in Supabase's "Change Email
// Address" e-mail (template in DEPLOY.md, ADR F-143). Verifies the one-time token server-side
// (no PKCE verifier needed, so the link works in any browser), writes the refreshed session
// cookies and sends the user on to `next` (a path on this site only, S6).

/** The only link type this route accepts; sign-up and recovery links have their own flows. */
const EMAIL_CHANGE = 'email_change';
const MAX_TOKEN_HASH_LENGTH = 512;

function fail(request: NextRequest, next: string) {
    const url = new URL(next, request.url);
    url.searchParams.set('email', 'link_invalid');
    return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const tokenHash = params.get('token_hash');
    const next = safeRedirectPath(params.get('next'));
    if (params.get('type') !== EMAIL_CHANGE || !tokenHash || tokenHash.length > MAX_TOKEN_HASH_LENGTH) {
        return fail(request, next);
    }

    const target = new URL(next, request.url);
    target.searchParams.set('email', 'confirmed');
    const response = NextResponse.redirect(target);
    const supabase = createResponseCookieClient(request, response);
    const { error } = await supabase.auth.verifyOtp({ type: EMAIL_CHANGE, token_hash: tokenHash });
    if (error) {
        console.error('[auth/confirm] verifyOtp failed:', error.code ?? error.status, error.message);
        return fail(request, next);
    }
    return response;
}
