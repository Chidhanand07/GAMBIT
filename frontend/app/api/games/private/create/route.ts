import { NextRequest, NextResponse } from 'next/server';
import { deleteGame, insertGame, insertGameInvite } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { buildPrivateGameRow, newInvite } from '@/lib/server/privateGames';
import { createAdminClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// POST /api/games/private/create — body { timeControl, color?, isRated? } → invite token
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const body = await parseJsonBody(req, schemas.privateGame, 'timeControl required');
    if (!body.ok) return body.response;
    const { timeControl, color, isRated } = body.data;

    const admin = createAdminClient();
    const { data, error } = await insertGame(admin, buildPrivateGameRow(userId, { timeControl, color, isRated }));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // The token goes to game_invites, never onto the (publicly readable) games row.
    const invite = newInvite(data.id);
    const { error: inviteError } = await insertGameInvite(admin, invite);
    if (inviteError) {
        await deleteGame(admin, data.id);
        return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    // The creator is the only caller that ever receives the token, and only here.
    return NextResponse.json({ token: invite.token, game_id: data.id });
}
