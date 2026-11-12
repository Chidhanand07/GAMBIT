import { NextResponse } from 'next/server';
import { getGameParticipants, getGameWithPlayers, pickClientWritableFields, updateGame } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import type { SeatColor } from '@/types/game';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

// GET /api/games/[id] — the game with both players plus the caller's seat (signed-in callers only)
export async function GET(_req: Request, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const { data: game, error } = await getGameWithPlayers(createAdminClient(), params.id);

    if (error || !game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Determine caller's color
    let myColor: SeatColor = 'spectator';
    if (game.white_id === auth.userId) myColor = 'white';
    else if (game.black_id === auth.userId) myColor = 'black';

    return NextResponse.json({ ...game, myColor });
}

// PATCH /api/games/[id] — participants may set draw_offer / rematch_requested only
export async function PATCH(req: Request, { params }: Params) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();

    // Verify caller is a participant in this game before allowing any update
    const { data: game } = await getGameParticipants(admin, params.id);

    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    if (game.white_id !== auth.userId && game.black_id !== auth.userId) {
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
