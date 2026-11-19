import { NextRequest, NextResponse } from 'next/server';
import { countLeaderboardPlayers, listLeaderboard } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// GET /api/leaderboard?field=rating_<bucket> — top 50 (default rapid). The number of ranked
// players (all of them, not just the 50 returned) is sent as `X-Total-Count` when it is known.
// PUBLIC on purpose: usernames, ratings and totals only, the same for every caller
// (docs/fixes/DECISIONS.md F-012).
export async function GET(request: NextRequest) {
    // `field` becomes a column name in the select list and the order clause: enum only.
    const field = parseInput(
        schemas.ratingField,
        request.nextUrl.searchParams.get('field') ?? 'rating_rapid',
        'Invalid field',
    );
    if (!field.ok) return field.response;

    const admin = createAdminClient();
    const [{ data, error }, total] = await Promise.all([
        listLeaderboard(admin, field.data),
        countLeaderboardPlayers(admin),
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
