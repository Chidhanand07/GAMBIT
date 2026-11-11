// @ts-check
/**
 * Single-position engine analysis for the analysis page.
 */

const DEFAULT_DEPTH = 18;

/**
 * @param {object} deps
 * @param {{ analyzePosition: (p: { fen: string, depth: number }) => Promise<{ json: () => Promise<unknown> }> }} deps.engineClient
 */
function createAnalysisService({ engineClient }) {
    return {
        /**
         * Engine evaluation of `fen` (falsy depth → 18). The engine's HTTP status
         * is not checked: an error body is returned as-is (known bug, pinned).
         * @param {{ fen: string, depth?: number }} params
         * @returns {Promise<unknown>} the engine's JSON body
         * @throws when the engine is unreachable or the body is not JSON
         */
        async analysePosition({ fen, depth }) {
            const response = await engineClient.analyzePosition({ fen, depth: depth || DEFAULT_DEPTH });
            return response.json();
        },
    };
}

module.exports = { createAnalysisService };
