import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { listAcceptedFriendships, toFriendList } from '@/lib/server/friendships';
import { getUserId } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// GET /api/friends?userId=<uuid>  — list accepted friends for any user (for public profile)
// GET /api/friends                — list MY accepted friends (uses cookie)
export async function GET(req: NextRequest) {
    const meId = getUserId(cookies());

    // Allow viewing friends of another user (public profile) via ?userId param
    const targetId = req.nextUrl.searchParams.get('userId') ?? meId;
    if (!targetId) return NextResponse.json([]);

    const { data, error } = await listAcceptedFriendships(createAdminClient(), targetId);

    if (error) return NextResponse.json([]);
    return NextResponse.json(toFriendList(data ?? [], targetId));
}
