import 'server-only';

// Read once at module load, as the /api/maverick-move handler did.
const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:8001';

/** POSTs a position to the chess engine's /computer-move endpoint. */
export function requestComputerMove(fen: string, difficulty: string | undefined): Promise<Response> {
    return fetch(`${ENGINE_URL}/computer-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, difficulty }),
    });
}
