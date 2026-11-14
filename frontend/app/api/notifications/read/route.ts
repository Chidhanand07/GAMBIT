import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { markAllNotificationsRead } from '@/lib/server/notifications';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// PUT /api/notifications/read — mark all unread as read
export async function PUT() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { error } = await markAllNotificationsRead(createAdminClient(), userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
