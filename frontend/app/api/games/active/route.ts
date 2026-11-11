import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { abandonActiveGame, findActiveGame, isStaleActiveGame } from '@/lib/server/games';
import { getUserId } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';

// GET /api/games/active — returns the caller's active game row, or null.
// Also cleans up stale games whose clock_deadline has passed (server restart survivors).
export async function GET() {
    const userId = getUserId(cookies());
    if (!userId) return NextResponse.json(null);

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
