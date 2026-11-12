import { NextRequest, NextResponse } from 'next/server';
import { createUserWithProfile } from '@/lib/server/auth';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

// POST /api/auth/signup — body { email, password, username }
// PUBLIC on purpose: this is how an account is created (docs/fixes/DECISIONS.md F-012).
export async function POST(request: NextRequest) {
    const { email, password, username } = await request.json();

    if (!email || !password || !username) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not set in frontend/.env.local');
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
