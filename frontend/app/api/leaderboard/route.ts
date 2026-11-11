import { NextRequest, NextResponse } from 'next/server';
import { listLeaderboard } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import type { RatingField } from '@/types/timeControl';

const VALID_FIELDS = new Set<string>(['rating_rapid', 'rating_bullet', 'rating_blitz', 'rating_classical']);

const isRatingField = (field: string): field is RatingField => VALID_FIELDS.has(field);

// GET /api/leaderboard?field=rating_<bucket> — top 50 (default rapid)
export async function GET(request: NextRequest) {
    const field = request.nextUrl.searchParams.get('field') ?? 'rating_rapid';

    if (!isRatingField(field)) {
        return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    const { data, error } = await listLeaderboard(createAdminClient(), field);

    if (error) {
        console.error('[api/leaderboard] error:', error.message);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data ?? []);
}
