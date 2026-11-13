import { NextRequest, NextResponse } from 'next/server';
import { listFinishedGamesForStats } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { buildProfileStats } from '@/lib/server/profileStats';
import { getProfileStatsRow } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

// GET /api/profile/[username]/stats — totals, ratings and per-bucket results
export async function GET(_req: NextRequest, props: { params: Promise<{ username: string }> }) {
    const params = await props.params;
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const username = parseInput(schemas.usernameParam, params.username);
    if (!username.ok) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const admin = createAdminClient();

    const { data: profile } = await getProfileStatsRow(admin, username.data);

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // Fetch all completed games for this user
    const { data: games } = await listFinishedGamesForStats(admin, profile.id);

    return NextResponse.json(buildProfileStats(profile, games ?? []));
}
