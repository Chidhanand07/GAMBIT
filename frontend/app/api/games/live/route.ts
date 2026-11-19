import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { listLiveGames } from '@/lib/server/liveGames';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// Changes with every move: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/games/live?limit=<1..20> — active public games, newest first (the lobby's
// "Live games" card). Signed-in callers only, like the lobby itself.
export async function GET(request: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const query = parseInput(schemas.liveGames, { limit: request.nextUrl.searchParams.get('limit') }, 'Invalid limit');
    if (!query.ok) return query.response;

    const { data, error } = await listLiveGames(createAdminClient(), query.data.limit);
    if (error) {
        console.error('[api/games/live] error:', error.message);
        return NextResponse.json([]);
    }
    return NextResponse.json(data);
}
