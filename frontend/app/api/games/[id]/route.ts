import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getGameParticipants, getGameWithPlayers, pickClientWritableFields, updateGame } from '@/lib/server/games';
import { getSessionUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import type { SeatColor } from '@/types/game';

type Params = { params: { id: string } };

// GET /api/games/[id] — the game with both players plus the caller's seat
export async function GET(_req: Request, { params }: Params) {
    const user = await getSessionUser(cookies());

    const { data: game, error } = await getGameWithPlayers(createAdminClient(), params.id);

    if (error || !game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Determine caller's color
    let myColor: SeatColor = 'spectator';
    if (user) {
        if (game.white_id === user.id) myColor = 'white';
        else if (game.black_id === user.id) myColor = 'black';
    }

    return NextResponse.json({ ...game, myColor });
}

// PATCH /api/games/[id] — participants may set draw_offer / rematch_requested only
export async function PATCH(req: Request, { params }: Params) {
    const user = await getSessionUser(cookies());
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const admin = createAdminClient();

    // Verify caller is a participant in this game before allowing any update
    const { data: game } = await getGameParticipants(admin, params.id);

    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    if (game.white_id !== user.id && game.black_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filtered = pickClientWritableFields(await req.json());
    if (Object.keys(filtered).length === 0) {
        return NextResponse.json({ error: 'No writable fields' }, { status: 400 });
    }

    const { data, error } = await updateGame(admin, params.id, filtered);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
