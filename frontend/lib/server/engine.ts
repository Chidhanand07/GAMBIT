import 'server-only';

// Server-side client for the chess engine. The engine only answers callers that present the
// shared secret in X-Engine-Key, so the secret lives here (server-only; never NEXT_PUBLIC_).

const DEFAULT_ENGINE_URL = 'http://localhost:8001';
const ENGINE_KEY_HEADER = 'X-Engine-Key';

/** Canonical name GAMBIT_ENGINE_URL; ENGINE_URL is still read for existing deployments. */
function engineUrl(): string {
    return process.env.GAMBIT_ENGINE_URL || process.env.ENGINE_URL || DEFAULT_ENGINE_URL;
}

/**
 * POSTs a position to the chess engine's /computer-move endpoint.
 * Resolves to null, without sending anything, when ENGINE_SHARED_SECRET is not set: the
 * engine would refuse the call anyway (fail closed).
 */
export async function requestComputerMove(fen: string, difficulty: string | undefined): Promise<Response | null> {
    const secret = process.env.ENGINE_SHARED_SECRET;
    if (!secret) return null;
    return fetch(`${engineUrl()}/computer-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ENGINE_KEY_HEADER]: secret },
        body: JSON.stringify({ fen, difficulty }),
    });
}
