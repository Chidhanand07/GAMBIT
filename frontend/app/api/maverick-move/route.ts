import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/server/clientIp';
import { requestComputerMove } from '@/lib/server/engine';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { schemas } from '@/lib/server/validation';

// PUBLIC on purpose: the offline "play the computer" page works signed out and no user data
// is read or written (docs/fixes/DECISIONS.md F-012).
// POST /api/maverick-move — proxies to the chess-engine /computer-move endpoint so
// the browser never needs the engine URL directly (avoids CORS + keeps it server-side).
// Body: { fen: string, difficulty: 'easy' | 'medium' | 'hard' }
// Returns: { uci, san, difficulty }

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** 'easy' | 'medium' | 'hard'; anything else (or missing) becomes 'medium'. */
const pickDifficulty = (requested: string | undefined) =>
    DIFFICULTIES.includes(requested || '') ? requested : 'medium';

/** `e?.message ?? String(e)` of whatever the failed fetch threw. */
const errorDetail = (e: unknown) => (e as { message?: string } | null | undefined)?.message ?? String(e);

/** A Retry-After the engine sent, when it is plain delay-seconds (anything else is dropped). */
const RETRY_AFTER_SECONDS = /^\d{1,4}$/;

/**
 * The engine's error, relayed: 400 stays 400; 503 (pool saturated, "Engine busy") stays 503
 * with the engine's Retry-After so the client can back off; anything else is a 502.
 */
async function engineErrorResponse(res: Response): Promise<NextResponse> {
    const detail = await res.text().catch(() => '');
    if (res.status === HTTP_SERVICE_UNAVAILABLE) {
        const retryAfter = res.headers.get('Retry-After');
        const headers = retryAfter && RETRY_AFTER_SECONDS.test(retryAfter) ? { 'Retry-After': retryAfter } : undefined;
        return NextResponse.json({ error: 'Engine busy', detail }, { status: HTTP_SERVICE_UNAVAILABLE, headers });
    }
    const status = res.status === HTTP_BAD_REQUEST ? HTTP_BAD_REQUEST : HTTP_BAD_GATEWAY;
    return NextResponse.json({ error: 'Engine error', detail }, { status });
}

export async function POST(req: Request) {
    // Per client IP, before anything reaches the engine (RATE-LIMITS).
    const limited = await enforceRateLimit(clientIp(req.headers), RATE_LIMITS.maverickMove);
    if (limited) return limited;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: HTTP_BAD_REQUEST });
    }

    const parsed = schemas.computerMove.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Missing fen' }, { status: HTTP_BAD_REQUEST });
    }

    const difficulty = pickDifficulty(parsed.data.difficulty);

    try {
        const res = await requestComputerMove(parsed.data.fen, difficulty);
        if (!res) {
            console.error('[maverick-move] ENGINE_SHARED_SECRET is not set; the engine cannot be called');
            return NextResponse.json({ error: 'Engine not configured' }, { status: HTTP_SERVICE_UNAVAILABLE });
        }
        if (!res.ok) return engineErrorResponse(res);
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e: unknown) {
        return NextResponse.json({ error: 'Engine unreachable', detail: errorDetail(e) }, { status: HTTP_BAD_GATEWAY });
    }
}
