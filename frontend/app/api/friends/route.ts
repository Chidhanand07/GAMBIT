import { NextRequest, NextResponse } from 'next/server';
import { listAcceptedFriendships, toFriendList } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/friends?userId=<uuid>  — accepted friends of that user (shown on their profile page)
// GET /api/friends                — MY accepted friends
// Signed-in callers only: profile pages are behind the login wall, so are their friend lists.
export async function GET(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const targetId = req.nextUrl.searchParams.get('userId') ?? auth.userId;

    const { data, error } = await listAcceptedFriendships(createAdminClient(), targetId);

    if (error) return NextResponse.json([]);
    return NextResponse.json(toFriendList(data ?? [], targetId));
}
