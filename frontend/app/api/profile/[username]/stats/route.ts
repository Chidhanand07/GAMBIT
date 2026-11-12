import { NextRequest, NextResponse } from 'next/server';
import { listFinishedGamesForStats } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { buildProfileStats } from '@/lib/server/profileStats';
import { getProfileStatsRow } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

// GET /api/profile/[username]/stats — totals, ratings and per-bucket results
export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();

    const { data: profile } = await getProfileStatsRow(admin, params.username);

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // Fetch all completed games for this user
    const { data: games } = await listFinishedGamesForStats(admin, profile.id);

    return NextResponse.json(buildProfileStats(profile, games ?? []));
}
