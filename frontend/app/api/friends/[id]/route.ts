import { NextRequest, NextResponse } from 'next/server';
import { deleteFriendship, setRequestStatus } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

// PUT /api/friends/[id]?action=accept|decline
export async function PUT(req: NextRequest, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const id = parseInput(schemas.uuid, params.id, 'Invalid friendship id');
    if (!id.ok) return id.response;
    const action = parseInput(schemas.friendAction, req.nextUrl.searchParams.get('action'), 'Invalid action');
    if (!action.ok) return action.response;

    const admin = createAdminClient();
    const newStatus = action.data === 'accept' ? 'accepted' : 'declined';

    const { error } = await setRequestStatus(admin, id.data, meId, newStatus);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}

// DELETE /api/friends/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const id = parseInput(schemas.uuid, params.id, 'Invalid friendship id');
    if (!id.ok) return id.response;

    const { error } = await deleteFriendship(createAdminClient(), id.data, meId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
