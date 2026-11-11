// @ts-check
/**
 * The Express app: CORS and JSON body parsing exactly as before (NODE-04:
 * separate from the http server / Socket.IO bootstrap). Routes are added by
 * `routes/index.js`.
 *
 * Known issues kept on purpose: any *.vercel.app origin is allowed with
 * credentials, and a rejected origin surfaces as Express's 500 error page.
 */
const express = require('express');
const cors = require('cors');

const LOCAL_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const VERCEL_ORIGIN = /\.vercel\.app$/;

/**
 * @param {object} deps
 * @param {() => string | undefined} deps.frontendUrl extra allowed origin, read per request
 * @returns {import('express').Express}
 */
function createApp({ frontendUrl }) {
    const app = express();
    app.use(
        cors({
            origin: (origin, callback) => {
                const allowed = [...LOCAL_ORIGINS, frontendUrl()].filter(Boolean);
                // Allow any vercel.app subdomain
                if (!origin || allowed.includes(origin) || VERCEL_ORIGIN.test(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
        }),
    );
    app.use(express.json());
    return app;
}

module.exports = { createApp };
