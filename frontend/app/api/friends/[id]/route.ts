import { NextRequest, NextResponse } from 'next/server';
import { deleteFriendship, setRequestStatus } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

// PUT /api/friends/[id]?action=accept|decline
export async function PUT(req: NextRequest, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const action = req.nextUrl.searchParams.get('action');
    if (action !== 'accept' && action !== 'decline') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const admin = createAdminClient();
    const newStatus = action === 'accept' ? 'accepted' : 'declined';

    const { error } = await setRequestStatus(admin, params.id, meId, newStatus);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}

// DELETE /api/friends/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const { error } = await deleteFriendship(createAdminClient(), params.id, meId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
