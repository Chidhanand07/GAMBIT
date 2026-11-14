// @ts-check
/**
 * Single-position engine analysis for the analysis page.
 */
const { AppError } = require('./errors');

const DEFAULT_DEPTH = 18;

const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const HTTP_UNAVAILABLE = 503;

/** Engine statuses that mean "the position you sent is the problem". */
const CALLER_ERROR_STATUSES = new Set([400, 404, 422]);
/** Engine statuses that mean "try again shortly". */
const BUSY_STATUSES = new Set([429, 503]);

const engineUnavailable = (/** @type {string} */ detail) =>
    new AppError('engine_unavailable', HTTP_BAD_GATEWAY, detail);

/**
 * The error for an engine response that is not OK (G14: it used to be passed
 * on as a 200). A 401/403 means our own key was refused, which is a server
 * problem, so it is reported like any other upstream failure.
 * @param {number} status
 * @returns {AppError}
 */
function engineStatusError(status) {
    if (CALLER_ERROR_STATUSES.has(status)) return new AppError('engine_rejected', HTTP_BAD_REQUEST, `engine ${status}`);
    if (BUSY_STATUSES.has(status)) return new AppError('engine_busy', HTTP_UNAVAILABLE, `engine ${status}`);
    return engineUnavailable(`engine ${status}`);
}

/**
 * @param {object} deps
 * @param {{ analyzePosition: (p: { fen: string, depth: number }) =>
 *   Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }> }} deps.engineClient
 */
function createAnalysisService({ engineClient }) {
    return {
        /**
         * Engine evaluation of `fen` (no depth → 18).
         * @param {{ fen: string, depth?: number }} params
         * @returns {Promise<unknown>} the engine's JSON body
         * @throws {AppError} engine_rejected (400), engine_busy (503) or engine_unavailable (502)
         */
        async analysePosition({ fen, depth }) {
            let response;
            try {
                response = await engineClient.analyzePosition({ fen, depth: depth || DEFAULT_DEPTH });
            } catch (e) {
                throw engineUnavailable(/** @type {Error} */ (e).message);
            }
            if (!response.ok) throw engineStatusError(response.status);
            try {
                return await response.json();
            } catch (e) {
                throw engineUnavailable(`unreadable engine response: ${/** @type {Error} */ (e).message}`);
            }
        },
    };
}

module.exports = { createAnalysisService };
