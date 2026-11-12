import { NextRequest, NextResponse } from 'next/server';
import { listFinishedGamesPage } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = '15';
const MAX_PAGE_SIZE = 50;

// GET /api/profile/[username]/games?limit=&offset= — finished games, newest first
export async function GET(request: NextRequest, { params }: { params: { username: string } }) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0');

    const admin = createAdminClient();

    // Resolve username to UUID
    const { data: profile } = await findProfileIdByUsername(admin, params.username);

    if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: games, error } = await listFinishedGamesPage(admin, profile.id, offset, limit);

    if (error) {
        console.error('[api/profile/games] error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ games: games ?? [], profileId: profile.id });
}
