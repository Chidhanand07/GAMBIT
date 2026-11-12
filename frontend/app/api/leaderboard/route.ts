import { NextRequest, NextResponse } from 'next/server';
import { listLeaderboard } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// GET /api/leaderboard?field=rating_<bucket> — top 50 (default rapid)
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

    const { data, error } = await listLeaderboard(createAdminClient(), field.data);

    if (error) {
        console.error('[api/leaderboard] error:', error.message);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data ?? []);
}
