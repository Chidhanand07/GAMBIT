import { NextRequest, NextResponse } from 'next/server';
import { listFinishedGamesPage } from '@/lib/server/games';
import { gameMoves } from '@/lib/server/gameFacts';
import { requireUser } from '@/lib/server/identity';
import { OTHER_OPENING, openingsOfGames } from '@/lib/server/openings';
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

    const rows = games ?? [];
    // The opening of each game (F-123); left out when its moves cannot be read.
    const openings = await openingsOfGames(
        admin,
        rows.map((g) => g.id),
    );
    const listed = rows.map(({ final_fen, fen, ...game }) => {
        // The number of moves (F-124) instead of the positions it is read from.
        const moves = gameMoves({ final_fen, fen });
        return {
            ...game,
            ...(moves === null ? {} : { move_count: moves }),
            ...(openings?.has(game.id) ? { opening: openings.get(game.id)?.family ?? OTHER_OPENING } : {}),
        };
    });

    return NextResponse.json({ games: listed, profileId: profile.id });
}
