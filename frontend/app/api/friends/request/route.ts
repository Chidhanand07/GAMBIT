import { NextRequest, NextResponse } from 'next/server';
import { findExistingFriendship, insertFriendRequest } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createAdminClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

/** The answer when a friendship in either direction already decides the request, else null. */
function existingFriendshipResponse(status: string | undefined): NextResponse | null {
    if (status === 'accepted') return NextResponse.json({ error: 'Already friends' }, { status: 400 });
    if (status === 'pending') return NextResponse.json({ success: true, already: true });
    return null;
}

// POST /api/friends/request — body { addressee_username }
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    // Per verified user, before any database call (RATE-LIMITS).
    const limited = await enforceRateLimit(meId, RATE_LIMITS.friendRequest);
    if (limited) return limited;

    const body = await parseJsonBody(req, schemas.friendRequest, 'addressee_username required');
    if (!body.ok) return body.response;
    const { addressee_username } = body.data;

    const admin = createAdminClient();

    const { data: them } = await findProfileIdByUsername(admin, addressee_username);
    if (!them) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (them.id === meId) return NextResponse.json({ error: 'Cannot friend yourself' }, { status: 400 });

    // Check if friendship already exists in either direction
    const { data: existing } = await findExistingFriendship(admin, meId, them.id);

    const settled = existingFriendshipResponse(existing?.status);
    if (settled) return settled;

    const { error } = await insertFriendRequest(admin, meId, them.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
