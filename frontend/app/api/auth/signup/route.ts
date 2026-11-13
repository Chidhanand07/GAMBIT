import { NextRequest, NextResponse } from 'next/server';
import { createUserWithProfile } from '@/lib/server/auth';
import { clientIp } from '@/lib/server/clientIp';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { supabaseSecretKey } from '@/lib/server/env';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createAdminClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

const USERNAME_RULE = 'Username must be 3 to 20 letters, numbers or underscores';

// POST /api/auth/signup — body { email, password, username }
// PUBLIC on purpose: this is how an account is created (docs/fixes/DECISIONS.md F-012).
export async function POST(request: NextRequest) {
    // Per client IP, before any database call (RATE-LIMITS).
    const limited = await enforceRateLimit(clientIp(request.headers), RATE_LIMITS.signup);
    if (limited) return limited;

    const body = await parseJsonBody(request, schemas.signup, 'Missing required fields');
    if (!body.ok) return body.response;
    const { email, password, username } = body.data;

    // The form applies the same rule; the server must not rely on it (the name is stored and shown).
    if (!schemas.newUsername.safeParse(username).success) {
        return NextResponse.json({ error: USERNAME_RULE }, { status: 400 });
    }

    if (!supabaseSecretKey()) {
        console.error('SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) is not set');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Admin client — full access to create user + profile
    const admin = createAdminClient();

    // Check if username is already taken before creating the auth user
    const { data: existing } = await findProfileIdByUsername(admin, username);

    if (existing) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
    }

    // Create the auth user via admin (bypasses email rate limits on the anon endpoint)
    const signupError = await createUserWithProfile(admin, { email, password, username });

    if (signupError) {
        return NextResponse.json({ error: signupError }, { status: 400 });
    }

    // Return ok — client will sign in using the browser client directly
    return NextResponse.json({ ok: true });
}
