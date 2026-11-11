// @ts-check
/**
 * HTTP client for the FastAPI chess engine. Each call resolves the base URL
 * and the global `fetch` at call time (tests replace both per test) and
 * returns the raw `fetch` promise, so callers keep their own `.ok` / `.json()`
 * / error handling exactly as before.
 */

const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });

/**
 * POST `body` as JSON to `${baseUrl}${path}`.
 * @param {string} url
 * @param {object} body
 * @returns {Promise<Response>}
 */
function postJson(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { ...JSON_HEADERS },
        body: JSON.stringify(body),
    });
}

/**
 * @param {object} deps
 * @param {() => string} deps.baseUrl returns the engine base URL (read per call).
 */
function createEngineClient({ baseUrl }) {
    return {
        /**
         * Ask the engine whether `move` is legal in `fen`.
         * @param {{ fen: string, move: string }} params
         * @returns {Promise<Response>} body `{ valid, new_fen }` when ok
         */
        validateMove: ({ fen, move }) => postJson(`${baseUrl()}/validate-move`, { fen, move }),

        /**
         * Queue a full game review; the engine writes results to the games row.
         * @param {{ gameId: string, pgn: string, timeControl: string }} params
         * @returns {Promise<Response>}
         */
        analyseGame: ({ gameId, pgn, timeControl }) =>
            postJson(`${baseUrl()}/analyse-game`, { game_id: gameId, pgn, time_control: timeControl }),

        /**
         * Evaluate a single position.
         * @param {{ fen: string, depth: number }} params
         * @returns {Promise<Response>}
         */
        analyzePosition: ({ fen, depth }) => postJson(`${baseUrl()}/analyze`, { fen, depth }),
    };
}

module.exports = { createEngineClient };
