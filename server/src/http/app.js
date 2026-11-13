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

const HTTP_FORBIDDEN = 403;
const ORIGIN_NOT_ALLOWED = Object.freeze({ error: 'origin_not_allowed' });

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
    app.use(express.json());
    return app;
}

module.exports = { createApp };
