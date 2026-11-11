import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { listIncomingRequests } from '@/lib/server/friendships';
import { getUserId } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// GET /api/friends/pending — incoming pending requests where I am addressee
export async function GET() {
    const meId = getUserId(cookies());
    if (!meId) return NextResponse.json([], { status: 200 });

    const { data, error } = await listIncomingRequests(createAdminClient(), meId);

    if (error) return NextResponse.json([], { status: 200 });
    return NextResponse.json(data ?? []);
}
