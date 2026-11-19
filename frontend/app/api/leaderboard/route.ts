import { NextRequest, NextResponse } from 'next/server';
import { countLeaderboardPlayers, listLeaderboard } from '@/lib/server/leaderboard';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// GET /api/leaderboard?field=rating_all|rating_<bucket> — top 50 (default All, F-125). The number of
// ranked players on that board (not just the 50 returned) is sent as `X-Total-Count` when known.
// PUBLIC on purpose: usernames, ratings and totals only, the same for every caller
// (docs/fixes/DECISIONS.md F-012).
export async function GET(request: NextRequest) {
    // `field` becomes a column name in the filter and the order clause: enum only.
    const field = parseInput(
        schemas.leaderboardField,
        request.nextUrl.searchParams.get('field') ?? 'rating_all',
        'Invalid field',
    );
    if (!field.ok) return field.response;

    const admin = createAdminClient();
    const [{ data, error }, total] = await Promise.all([
        listLeaderboard(admin, field.data),
        countLeaderboardPlayers(admin, field.data),
    ]);

    if (error) {
        console.error('[api/leaderboard] error:', error.message);
        return NextResponse.json([], { status: 200 });
    }

    // Without a count the page only shows the total when the list is not capped.
    const headers: Record<string, string> =
        !total.error && typeof total.count === 'number' ? { 'X-Total-Count': String(total.count) } : {};
    return NextResponse.json(data ?? [], { headers });
}
