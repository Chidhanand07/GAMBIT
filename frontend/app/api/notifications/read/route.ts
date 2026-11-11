import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/server/identity';
import { markAllNotificationsRead } from '@/lib/server/notifications';
import { createAdminClient } from '@/lib/server/supabase';

// PUT /api/notifications/read — mark all unread as read
export async function PUT() {
    const userId = getUserId(cookies());
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await markAllNotificationsRead(createAdminClient(), userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
