import { NextRequest, NextResponse } from 'next/server';
import { loginErrorMessage } from '@/lib/server/auth';
import { createResponseCookieClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// POST /api/auth/login — body { email, password }
// PUBLIC on purpose: this is how a session is created (docs/fixes/DECISIONS.md F-012).
export async function POST(request: NextRequest) {
    const body = await parseJsonBody(request, schemas.login, 'Email and password are required');
    if (!body.ok) return body.response;
    const { email, password } = body.data;

    // Auth is performed server-side so session cookies are set directly on the
    // HTTP response. This guarantees the middleware can read them on the next
    // request, which @supabase/ssr@0.1.0 browser client can't ensure (large
    // JWTs fall back to localStorage, invisible to server cookies).
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
