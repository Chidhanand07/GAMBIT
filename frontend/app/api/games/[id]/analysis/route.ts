import { NextResponse } from 'next/server';
import { loadGameAnalysis } from '@/lib/server/gameAnalysis';
import { requireUser } from '@/lib/server/identity';
import { createAdminClient } from '@/lib/server/supabase';
import { parseInput, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/games/[id]/analysis — a finished game's moves, accuracies and move classifications for
// /analysis?game=<id>. Players always; anyone signed in for a public game; never a private game
// to a non-player (ADR F-134).
export async function GET(_req: Request, props: Params) {
    const params = await props.params;
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const id = parseInput(schemas.uuid, params.id, 'Game not found');
    if (!id.ok) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

    const result = await loadGameAnalysis(createAdminClient(), id.data, auth.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
}
