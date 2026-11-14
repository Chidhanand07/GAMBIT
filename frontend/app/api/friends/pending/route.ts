import { NextResponse } from 'next/server';
import { listIncomingRequests } from '@/lib/server/friendships';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/friends/pending — incoming pending requests where I am addressee
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const meId = auth.userId;

    const { data, error } = await listIncomingRequests(createAdminClient(), meId);

    if (error) return NextResponse.json([], { status: 200 });
    return NextResponse.json(data ?? []);
}
