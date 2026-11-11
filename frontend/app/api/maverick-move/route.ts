import { NextResponse } from 'next/server';
import { requestComputerMove } from '@/lib/server/engine';

// POST /api/maverick-move — proxies to the chess-engine /computer-move endpoint so
// the browser never needs the engine URL directly (avoids CORS + keeps it server-side).
// Body: { fen: string, difficulty: 'easy' | 'medium' | 'hard' }
// Returns: { uci, san, difficulty }

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;

/** 'easy' | 'medium' | 'hard'; anything else (or missing) becomes 'medium'. */
const pickDifficulty = (requested: string | undefined) =>
    DIFFICULTIES.includes(requested || '') ? requested : 'medium';

/** `e?.message ?? String(e)` of whatever the failed fetch threw. */
const errorDetail = (e: unknown) => (e as { message?: string } | null | undefined)?.message ?? String(e);

export async function POST(req: Request) {
    let body: { fen?: string; difficulty?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: HTTP_BAD_REQUEST });
    }

    if (!body?.fen) {
        return NextResponse.json({ error: 'Missing fen' }, { status: HTTP_BAD_REQUEST });
    }

    const difficulty = pickDifficulty(body.difficulty);

    try {
        const res = await requestComputerMove(body.fen, difficulty);
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            return NextResponse.json(
                { error: 'Engine error', detail },
                { status: res.status === HTTP_BAD_REQUEST ? HTTP_BAD_REQUEST : HTTP_BAD_GATEWAY },
            );
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e: unknown) {
        return NextResponse.json({ error: 'Engine unreachable', detail: errorDetail(e) }, { status: HTTP_BAD_GATEWAY });
    }
}
