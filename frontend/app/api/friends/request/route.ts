import { NextRequest, NextResponse } from 'next/server';
import { findExistingFriendship, insertFriendRequest } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// POST /api/friends/request — body { addressee_username }
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const { addressee_username } = await req.json();
    if (!addressee_username) return NextResponse.json({ error: 'addressee_username required' }, { status: 400 });

    const admin = createAdminClient();

    const { data: them } = await findProfileIdByUsername(admin, addressee_username);
    if (!them) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (them.id === meId) return NextResponse.json({ error: 'Cannot friend yourself' }, { status: 400 });

    // Check if friendship already exists in either direction
    const { data: existing } = await findExistingFriendship(admin, meId, them.id);

    if (existing?.status === 'accepted') return NextResponse.json({ error: 'Already friends' }, { status: 400 });
    if (existing?.status === 'pending') return NextResponse.json({ success: true, already: true });

    const { error } = await insertFriendRequest(admin, meId, them.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
