// @ts-check
/**
 * HTTP client for the FastAPI chess engine. Each call resolves the base URL,
 * the shared secret and the global `fetch` at call time (tests replace them
 * per test) and returns the raw `fetch` promise, so callers keep their own
 * `.ok` / `.json()` / error handling.
 *
 * Every request carries the shared secret in `X-Engine-Key` (the engine
 * rejects anything else). Without a secret no request is sent: the call
 * rejects instead (SEC-09). During an HTTP request the request id goes along
 * as `X-Request-Id` (requestContext).
 */
const { withRequestIdHeader } = require('../observability/requestContext');

const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });
const ENGINE_KEY_HEADER = 'X-Engine-Key';

/**
 * @param {object} deps
 * @param {() => string} deps.baseUrl returns the engine base URL (read per call).
 * @param {() => string | undefined} deps.sharedSecret returns `ENGINE_SHARED_SECRET` (read per call).
 */
function createEngineClient({ baseUrl, sharedSecret }) {
    /**
     * POST `body` as JSON to `${baseUrl}${path}` with the engine key.
     * @param {string} path
     * @param {object} body
     * @returns {Promise<Response>}
     */
    async function postJson(path, body) {
        const secret = sharedSecret();
        if (!secret) throw new Error('ENGINE_SHARED_SECRET is not set; refusing to call the engine');
        return fetch(`${baseUrl()}${path}`, {
            method: 'POST',
            headers: withRequestIdHeader({ ...JSON_HEADERS, [ENGINE_KEY_HEADER]: secret }),
            body: JSON.stringify(body),
        });
    }

    return {
        /**
         * Ask the engine whether `move` is legal in `fen`.
         * @param {{ fen: string, move: string }} params
         * @returns {Promise<Response>} body `{ valid, new_fen }` when ok
         */
        validateMove: ({ fen, move }) => postJson('/validate-move', { fen, move }),

        /**
         * Queue a full game review; the engine writes results to the games row.
         * @param {{ gameId: string, pgn: string, timeControl: string }} params
         * @returns {Promise<Response>}
         */
        analyseGame: ({ gameId, pgn, timeControl }) =>
            postJson('/analyse-game', { game_id: gameId, pgn, time_control: timeControl }),

        /**
         * Evaluate a single position.
         * @param {{ fen: string, depth: number }} params
         * @returns {Promise<Response>}
         */
        analyzePosition: ({ fen, depth }) => postJson('/analyze', { fen, depth }),
    };
}

module.exports = { createEngineClient };
