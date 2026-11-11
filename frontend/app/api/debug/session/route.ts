import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getProfileById } from '@/lib/server/profiles';
import { createAdminClient, createCookieReadingClient } from '@/lib/server/supabase';

/** The caller's full profile row via the service-role client (only when that key is set). */
async function readProfile(user: User | null) {
    if (!user || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { profileResult: null, profileError: null };
    const { data, error } = await getProfileById(createAdminClient(), user.id);
    return { profileResult: data as unknown, profileError: error?.message ?? null };
}

// GET /api/debug/session — KNOWN BUG (preserved): exposed in production; returns the
// cookie names and the caller's full profile row.
export async function GET() {
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();

    // @supabase/ssr 0.1.0 uses get/set/remove, not getAll/setAll
    const supabase = createCookieReadingClient(cookieStore);

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    const { profileResult, profileError } = await readProfile(user);

    return NextResponse.json({
        cookieNames: allCookies.map((c) => c.name),
        authError: authError?.message ?? null,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        serviceKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        profileRowExists: profileResult !== null,
        profileData: profileResult,
        profileError,
    });
}
