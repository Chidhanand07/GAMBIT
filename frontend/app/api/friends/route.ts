import { NextRequest, NextResponse } from 'next/server';
import { listAcceptedFriendships, toFriendList } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/friends?userId=<uuid>  — accepted friends of that user (shown on their profile page)
// GET /api/friends                — MY accepted friends
// Signed-in callers only: profile pages are behind the login wall, so are their friend lists.
export async function GET(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    // The id ends up inside a PostgREST `or` filter string: only a UUID is accepted (S7).
    const target = parseInput(schemas.uuid, req.nextUrl.searchParams.get('userId') ?? auth.userId, 'Invalid userId');
    if (!target.ok) return target.response;
    const targetId = target.data;

    const { data, error } = await listAcceptedFriendships(createAdminClient(), targetId);

    if (error) return NextResponse.json([]);
    return NextResponse.json(toFriendList(data ?? [], targetId));
}
