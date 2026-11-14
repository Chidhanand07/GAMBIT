import { NextRequest, NextResponse } from 'next/server';
import { listFinishedGamesPage } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { findProfileIdByUsername } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

// GET /api/profile/[username]/games?limit=&offset= — finished games, newest first
export async function GET(request: NextRequest, props: { params: Promise<{ username: string }> }) {
    const params = await props.params;
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const username = parseInput(schemas.usernameParam, params.username);
    if (!username.ok) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    const page = parseInput(
        schemas.gamesPage,
        { limit: request.nextUrl.searchParams.get('limit'), offset: request.nextUrl.searchParams.get('offset') },
        'Invalid limit or offset',
    );
    if (!page.ok) return page.response;
    const { limit, offset } = page.data;

    const admin = createAdminClient();

    // Resolve username to UUID
    const { data: profile } = await findProfileIdByUsername(admin, username.data);

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
