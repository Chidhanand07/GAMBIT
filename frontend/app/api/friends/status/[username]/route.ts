import { NextRequest, NextResponse } from 'next/server';
import { findFriendshipStatus, relationFromFriendship } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/friends/status/[username] — my relation to that user
export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const admin = createAdminClient();

    const { data: them } = await findProfileIdByUsername(admin, params.username);
    if (!them) return NextResponse.json({ status: 'none' });
    if (them.id === meId) return NextResponse.json({ status: 'self' });

    const { data } = await findFriendshipStatus(admin, meId, them.id);

    return NextResponse.json({ status: relationFromFriendship(data, meId) });
}
