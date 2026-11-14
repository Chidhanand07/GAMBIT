import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { listRecentNotifications } from '@/lib/server/notifications';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/notifications — my 30 latest notifications
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { data, error } = await listRecentNotifications(createAdminClient(), userId);

    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json(data ?? []);
}
