import { NextResponse } from 'next/server';
import { abandonActiveGame, findActiveGame, isStaleActiveGame } from '@/lib/server/games';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// GET /api/games/active — returns the caller's active game row, or null.
// Also cleans up stale games whose clock_deadline has passed (server restart survivors).
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const admin = createAdminClient();
    const { data } = await findActiveGame(admin, userId);

    if (!data) return NextResponse.json(null);

    // The game timed out while the server was down, or never got a move: mark it
    // abandoned (no winner — we can't know who ran out of time without the FEN).
    if (isStaleActiveGame(data)) {
        await abandonActiveGame(admin, data.id);
        return NextResponse.json(null);
    }

    return NextResponse.json(data);
}
