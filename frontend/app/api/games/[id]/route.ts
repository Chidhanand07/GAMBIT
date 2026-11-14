import { NextResponse } from 'next/server';
import { toGameDto } from '@/lib/server/dto';
import { getGameParticipants, getGameWithPlayers, pickClientWritableFields, updateGame } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, parseJsonBody, schemas } from '@/lib/server/validation';
import type { SeatColor } from '@/types/game';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/games/[id] — the game with both players plus the caller's seat (signed-in callers only)
export async function GET(_req: Request, props: Params) {
    const params = await props.params;
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const id = parseInput(schemas.uuid, params.id, 'Game not found');
    if (!id.ok) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

    const { data: game, error } = await getGameWithPlayers(createAdminClient(), id.data);

    if (error || !game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Determine caller's color
    let myColor: SeatColor = 'spectator';
    if (game.white_id === auth.userId) myColor = 'white';
    else if (game.black_id === auth.userId) myColor = 'black';

    // Minimal DTO: never the invite token or other internal columns (S8).
    return NextResponse.json({ ...toGameDto(game), myColor });
}

// PATCH /api/games/[id] — participants may set draw_offer / rematch_requested only
export async function PATCH(req: Request, props: Params) {
    const params = await props.params;
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const id = parseInput(schemas.uuid, params.id, 'Game not found');
    if (!id.ok) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

    const admin = createAdminClient();

    // Verify caller is a participant in this game before allowing any update
    const { data: game } = await getGameParticipants(admin, id.data);

    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    if (game.white_id !== auth.userId && game.black_id !== auth.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await parseJsonBody(req, schemas.gamePatch, 'No writable fields');
    if (!body.ok) return body.response;
    const filtered = pickClientWritableFields(body.data);
    if (Object.keys(filtered).length === 0) {
        return NextResponse.json({ error: 'No writable fields' }, { status: 400 });
    }

    const { data, error } = await updateGame(admin, id.data, filtered);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ? toGameDto(data) : data);
}
