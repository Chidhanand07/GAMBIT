import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { getProfileByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

// GET /api/profile/[username] — public profile row
export async function GET(_request: NextRequest, { params }: { params: { username: string } }) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    if (!params.username) {
        return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const { data, error } = await getProfileByUsername(createAdminClient(), params.username);

    if (error) {
        console.error('[api/profile/username] query error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(data);
}
