import { NextRequest, NextResponse } from 'next/server';
import { INVALID_LOGIN_MESSAGE, loginErrorMessage } from '@/lib/server/auth';
import { clientIp } from '@/lib/server/clientIp';
import { supabaseSecretKey } from '@/lib/server/env';
import {
    isEmailIdentifier,
    resolveLoginEmail,
    unknownAccountEmail,
    waitForFailureFloor,
} from '@/lib/server/loginIdentity';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createAdminClient, createResponseCookieClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

const HTTP_UNAUTHORIZED = 401;

/** The account's e-mail for an identifier; null when none (or when the lookup cannot run). */
async function emailFor(identifier: string): Promise<string | null> {
    if (isEmailIdentifier(identifier)) return identifier;
    if (!supabaseSecretKey()) {
        console.error('[auth/login] username sign-in needs SUPABASE_SECRET_KEY; treated as unknown');
        return null;
    }
    return resolveLoginEmail(createAdminClient(), identifier);
}

async function unauthorized(startedAt: number, error: string) {
    await waitForFailureFloor(startedAt);
    return NextResponse.json({ error }, { status: HTTP_UNAUTHORIZED });
}

// POST /api/auth/login — body { identifier, password } (identifier: e-mail or username; the
// older { email, password } is still accepted). PUBLIC on purpose: this is how a session is
// created (docs/fixes/DECISIONS.md F-012, F-101).
export async function POST(request: NextRequest) {
    // Per client IP, then per identifier (across IPs), before anything is looked up (RATE-LIMITS).
    const ipLimited = await enforceRateLimit(clientIp(request.headers), RATE_LIMITS.loginIp);
    if (ipLimited) return ipLimited;

    const body = await parseJsonBody(request, schemas.login, 'Email and password are required');
    if (!body.ok) return body.response;
    const { identifier, password } = body.data;

    const identifierLimited = await enforceRateLimit(identifier.toLowerCase(), RATE_LIMITS.loginEmail);
    if (identifierLimited) return identifierLimited;

    const startedAt = Date.now();
    const email = await emailFor(identifier);

    // Auth is performed server-side so the session cookies are set directly on the HTTP
    // response: the proxy and the route handlers can read them on the very next request.
    const authResponse = NextResponse.json({ ok: true });
    const supabase = createResponseCookieClient(request, authResponse);

    // An unknown user still gets a password check (against an address no account has), so it
    // costs the same as a wrong password and ends in the same message.
    const { data, error } = await supabase.auth.signInWithPassword({ email: email ?? unknownAccountEmail(), password });

    if (!email) return unauthorized(startedAt, INVALID_LOGIN_MESSAGE);
    if (error) return unauthorized(startedAt, loginErrorMessage(error));
    if (!data.session) return unauthorized(startedAt, 'Please confirm your email before signing in.');

    return authResponse;
}
