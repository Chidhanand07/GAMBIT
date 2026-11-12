import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { getProfileById } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

/** The caller's own profile row via the service-role client (only when that key is set). */
async function readProfile(userId: string) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { profileResult: null, profileError: null };
    const { data, error } = await getProfileById(createAdminClient(), userId);
    return { profileResult: data as unknown, profileError: error?.message ?? null };
}

// GET /api/debug/session — diagnostics for the signed-in caller only (their own cookie names
// and profile row). KNOWN ISSUE (S12, not part of this fix): the route still exists in production.
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const { profileResult, profileError } = await readProfile(auth.userId);

    return NextResponse.json({
        cookieNames: cookies()
            .getAll()
            .map((c) => c.name),
        authError: null,
        userId: auth.userId,
        serviceKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        profileRowExists: profileResult !== null,
        profileData: profileResult,
        profileError,
    });
}
