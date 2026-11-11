import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { findFriendshipStatus, relationFromFriendship } from '@/lib/server/friendships';
import { getUserId } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

// GET /api/friends/status/[username] — my relation to that user
export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
    const meId = getUserId(cookies());
    if (!meId) return NextResponse.json({ status: 'none' });

    const admin = createAdminClient();

    const { data: them } = await findProfileIdByUsername(admin, params.username);
    if (!them) return NextResponse.json({ status: 'none' });
    if (them.id === meId) return NextResponse.json({ status: 'self' });

    const { data } = await findFriendshipStatus(admin, meId, them.id);

    return NextResponse.json({ status: relationFromFriendship(data, meId) });
}
