import { NextRequest, NextResponse } from 'next/server';
import { toPublicProfileDto } from '@/lib/server/dto';
import { requireUser } from '@/lib/server/identity';
import { getProfileByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

// GET /api/profile/[username] — public profile row
export async function GET(_request: NextRequest, { params }: { params: { username: string } }) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    if (!params.username) {
        return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const username = parseInput(schemas.usernameParam, params.username);
    if (!username.ok) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data, error } = await getProfileByUsername(createAdminClient(), username.data);

    if (error) {
        console.error('[api/profile/username] query error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(toPublicProfileDto(data));
}
