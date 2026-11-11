import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { insertGame } from '@/lib/server/games';
import { getUserId } from '@/lib/server/identity';
import { buildPrivateGameRow } from '@/lib/server/privateGames';
import { createAdminClient } from '@/lib/server/supabase';

// POST /api/games/private/create — body { timeControl, color?, isRated? } → invite token
export async function POST(req: NextRequest) {
    const userId = getUserId(cookies());
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { timeControl, color, isRated } = await req.json();
    if (!timeControl) return NextResponse.json({ error: 'timeControl required' }, { status: 400 });

    const row = buildPrivateGameRow(userId, { timeControl, color, isRated });

    const { data, error } = await insertGame(createAdminClient(), row);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ token: data.invite_token, game_id: data.id });
}
