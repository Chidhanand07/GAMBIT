import { NextRequest, NextResponse } from 'next/server';
import { insertGame } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { buildPrivateGameRow } from '@/lib/server/privateGames';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// POST /api/games/private/create — body { timeControl, color?, isRated? } → invite token
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { timeControl, color, isRated } = await req.json();
    if (!timeControl) return NextResponse.json({ error: 'timeControl required' }, { status: 400 });

    const row = buildPrivateGameRow(userId, { timeControl, color, isRated });

    const { data, error } = await insertGame(createAdminClient(), row);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ token: data.invite_token, game_id: data.id });
}
