// @ts-check
/**
 * Request parsing and error responses shared by the routes (NODE-07, NODE-08).
 */
const { AppError } = require('../services/errors');
const { log } = require('../observability/log');

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;
const INVALID_REQUEST = Object.freeze({ error: 'invalid_request' });
const INTERNAL_ERROR = Object.freeze({ error: 'internal_error' });
const HTTP_PAYLOAD_TOO_LARGE = 413;

/** Errors raised by express.json() before a route runs, by their `type`. */
const BODY_ERRORS = Object.freeze({
    'entity.parse.failed': { status: HTTP_BAD_REQUEST, code: 'invalid_request' },
    'entity.too.large': { status: HTTP_PAYLOAD_TOO_LARGE, code: 'payload_too_large' },
});

/**
 * Parse `input` with a zod schema. On failure a 400 is sent and null returned.
 * @template T
 * @param {import('express').Response} res
 * @param {{ safeParse: (input: unknown) => { success: true, data: T } | { success: false } }} schema
 * @param {unknown} input
 * @returns {T | null}
 */
function parseOrReject(res, schema, input) {
    const parsed = schema.safeParse(input);
    if (parsed.success) return parsed.data;
    res.status(HTTP_BAD_REQUEST).json(INVALID_REQUEST);
    return null;
}

/**
 * Answer a failed request: an AppError with its own status and code; anything
 * else is logged and answered with a generic 500 (no internal message).
 * @param {import('express').Response} res
 * @param {string} route for the log line
 * @param {unknown} error
 */
function sendError(res, route, error) {
    const bodyError = BODY_ERRORS[/** @type {{ type?: string }} */ (error)?.type ?? ''];
    if (bodyError) {
        res.status(bodyError.status).json({ error: bodyError.code });
        return;
    }
    if (error instanceof AppError) {
        res.status(error.httpStatus).json({ error: error.code });
        return;
    }
    log.error(`[http] ${route} failed:`, /** @type {Error} */ (error)?.message ?? error);
    res.status(HTTP_INTERNAL_ERROR).json(INTERNAL_ERROR);
}

module.exports = { parseOrReject, sendError };
