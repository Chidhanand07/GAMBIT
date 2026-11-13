// @ts-check
/**
 * The Express app: origin check, CORS and JSON body parsing (NODE-04:
 * separate from the http server / Socket.IO bootstrap). Routes are added by
 * `routes/index.js`.
 *
 * A browser origin that is not on the allow-list gets a plain 403 before any
 * route runs (S13). The policy is the one the Socket.IO handshake uses.
 */
const express = require('express');
const cors = require('cors');

const { sendError } = require('./respond');

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const ORIGIN_NOT_ALLOWED = Object.freeze({ error: 'origin_not_allowed' });
/** NODE-12: request bodies here are a FEN and a depth; nothing legitimate comes close. */
const JSON_BODY_LIMIT = '16kb';

/**
 * @typedef {{ isAllowed: (origin: string) => boolean, allowsRequest: (origin: string | undefined) => boolean }} OriginPolicy
 */

/**
 * @param {object} deps
 * @param {() => OriginPolicy} deps.originPolicy the current policy (read per request, so config changes apply)
 * @returns {import('express').Express}
 */
function createApp({ originPolicy }) {
    const app = express();
    // Railway terminates TLS in front of the app: one proxy hop, so req.ip is the client (rate limits).
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        if (originPolicy().allowsRequest(req.headers.origin)) return next();
        res.status(HTTP_FORBIDDEN).json(ORIGIN_NOT_ALLOWED);
    });
    app.use(
        cors({
            // Only allowed origins reach this point; echo them back with credentials.
            origin: (origin, callback) => callback(null, Boolean(origin && originPolicy().isAllowed(origin))),
            credentials: true,
        }),
    );
    app.use(express.json({ limit: JSON_BODY_LIMIT }));
    return app;
}

/**
 * The last two pieces of the app, added after the routes: a JSON 404, and the one
 * error middleware. Express 5 forwards a rejected async handler here by itself (NODE-02),
 * so routes just throw; `sendError` answers AppErrors with their status and code and
 * anything else with a generic 500 (NODE-07).
 * @param {import('express').Express} app
 */
function attachErrorHandler(app) {
    app.use((req, res) => {
        res.status(HTTP_NOT_FOUND).json({ error: 'not_found' });
    });
    app.use(
        (
            /** @type {unknown} */ error,
            /** @type {import('express').Request} */ req,
            /** @type {import('express').Response} */ res,
            /** @type {import('express').NextFunction} */ _next,
        ) => {
            sendError(res, `${req.method} ${req.path}`, error);
        },
    );
}

module.exports = { createApp, attachErrorHandler };
