import { NextRequest, NextResponse } from 'next/server';
import { loginErrorMessage } from '@/lib/server/auth';
import { clientIp } from '@/lib/server/clientIp';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createResponseCookieClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// POST /api/auth/login — body { email, password }
// PUBLIC on purpose: this is how a session is created (docs/fixes/DECISIONS.md F-012).
export async function POST(request: NextRequest) {
    // Per client IP, then per e-mail (across IPs), before Supabase Auth is asked (RATE-LIMITS).
    const ipLimited = await enforceRateLimit(clientIp(request.headers), RATE_LIMITS.loginIp);
    if (ipLimited) return ipLimited;

    const body = await parseJsonBody(request, schemas.login, 'Email and password are required');
    if (!body.ok) return body.response;
    const { email, password } = body.data;

    const emailLimited = await enforceRateLimit(email.trim().toLowerCase(), RATE_LIMITS.loginEmail);
    if (emailLimited) return emailLimited;

    // Auth is performed server-side so the session cookies are set directly on the HTTP
    // response: the proxy and the route handlers can read them on the very next request.
    const authResponse = NextResponse.json({ ok: true });
    const supabase = createResponseCookieClient(request, authResponse);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        return NextResponse.json({ error: loginErrorMessage(error) }, { status: 401 });
    }

    if (!data.session) {
        return NextResponse.json({ error: 'Please confirm your email before signing in.' }, { status: 401 });
    }

    return authResponse;
}
