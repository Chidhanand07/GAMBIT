import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { viewerStanding } from '@/lib/server/leaderboard';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/leaderboard/me?field=rating_all|rating_<bucket> — the signed-in player's rank on that
// board (beyond the top 50 too), rating and pool (F-125). The player is the verified session's user.
export async function GET(request: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const field = parseInput(
        schemas.leaderboardField,
        request.nextUrl.searchParams.get('field') ?? 'rating_all',
        'Invalid field',
    );
    if (!field.ok) return field.response;

    const standing = await viewerStanding(createAdminClient(), auth.userId, field.data);
    if (!standing) return NextResponse.json({ error: 'Could not load your standing' }, { status: 500 });
    return NextResponse.json(standing);
}
