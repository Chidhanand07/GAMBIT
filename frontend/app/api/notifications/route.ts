import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/server/identity';
import { listRecentNotifications } from '@/lib/server/notifications';
import { createAdminClient } from '@/lib/server/supabase';

// GET /api/notifications — my 30 latest notifications
export async function GET() {
    const userId = getUserId(cookies());
    if (!userId) return NextResponse.json([], { status: 401 });

    const { data, error } = await listRecentNotifications(createAdminClient(), userId);

    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json(data ?? []);
}
