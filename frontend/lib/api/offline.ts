// Client-side fetch helper for the MAVERICK computer-play page (app/offline).

export type MaverickDifficulty = 'easy' | 'medium' | 'hard';

/** POST /api/maverick-move response (proxied from the engine's /computer-move). */
export interface MaverickMoveResponse {
    uci: string;
    san?: string;
    difficulty?: MaverickDifficulty;
}

interface MaverickErrorBody {
    detail?: string;
    error?: string;
}

/**
 * Asks MAVERICK for a move in `fen`. Throws an Error whose message is the
 * response's `detail`, else `error`, else `Engine error (<status>)` when the
 * response is not ok (same request and messages as the original page code).
 */
export async function requestMaverickMove(fen: string, difficulty: MaverickDifficulty): Promise<MaverickMoveResponse> {
    const res = await fetch('/api/maverick-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, difficulty }),
    });
    if (!res.ok) {
        const body: MaverickErrorBody = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `Engine error (${res.status})`);
    }
    return res.json();
}
