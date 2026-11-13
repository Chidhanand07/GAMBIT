// @ts-check
/**
 * The only module that reads `process.env` (NODE-05).
 *
 * Every setting is an accessor that reads `process.env` when it is called,
 * not when this module loads. The original code read ENGINE_URL and
 * FRONTEND_URL on every request and PORT/REDIS_URL/SUPABASE_* when their
 * modules loaded (after `dotenv` ran); call-time accessors keep each read at
 * exactly that moment (ADR 0101).
 *
 * The engine URL's canonical name is `GAMBIT_ENGINE_URL` (the name every
 * `.env.example` and deploy guide documents). `ENGINE_URL` is still read as a
 * deprecated fallback so existing deployments keep working (G5; docs/fixes/DECISIONS.md F-002).
 */

const { parseOrigins } = require('./origins');

const DEFAULT_ENGINE_URL = 'http://localhost:8001';
const DEFAULT_PORT = 3001;
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

/** Warnings already logged; the accessors run per request, so each is logged once. */
const warned = new Set();

/**
 * @param {string} key
 * @param {string} message
 */
function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
}

/**
 * `GAMBIT_ENGINE_URL`, else the deprecated `ENGINE_URL`, else the local default.
 * @returns {string}
 */
function engineUrl() {
    if (process.env.GAMBIT_ENGINE_URL) return process.env.GAMBIT_ENGINE_URL;
    if (process.env.ENGINE_URL) {
        warnOnce('engine-legacy', '[config] ENGINE_URL is deprecated; rename it to GAMBIT_ENGINE_URL.');
        return process.env.ENGINE_URL;
    }
    if (process.env.NODE_ENV === 'production') {
        warnOnce('engine-missing', `[config] GAMBIT_ENGINE_URL is not set; using ${DEFAULT_ENGINE_URL}.`);
    }
    return DEFAULT_ENGINE_URL;
}

/**
 * @typedef {object} Env
 * @property {() => string} engineUrl chess-engine base URL (`GAMBIT_ENGINE_URL`, fallback `ENGINE_URL`).
 * @property {() => string | undefined} engineSharedSecret sent to the engine as `X-Engine-Key`
 *   (`ENGINE_SHARED_SECRET`); without it the engine client refuses to call the engine.
 * @property {() => string[]} corsOrigins browser origins allowed by CORS and the socket handshake (S13)
 * @property {() => string | undefined} corsPreviewPattern `CORS_PREVIEW_ORIGIN_REGEX`: this project's Vercel previews
 * @property {() => string | number} port HTTP port (`PORT`, default 3001).
 * @property {() => string} redisUrl `REDIS_URL`, default local Redis.
 * @property {() => string | undefined} supabaseUrl `SUPABASE_URL`.
 * @property {() => string | undefined} supabaseServiceKey the secret (RLS-bypassing) key:
 *   `SUPABASE_SECRET_KEY` (canonical; Supabase's new `sb_secret_…` key), falling back to the
 *   legacy `SUPABASE_SERVICE_KEY`, then `SUPABASE_SERVICE_ROLE_KEY`.
 * @property {() => string} supabaseServiceKeySource name of the variable the key came from.
 */

/**
 * `ENGINE_SHARED_SECRET`. The value is never logged.
 * @returns {string | undefined}
 */
function engineSharedSecret() {
    const secret = process.env.ENGINE_SHARED_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        warnOnce(
            'engine-secret-missing',
            '[config] ENGINE_SHARED_SECRET is not set; analysis and game review are disabled.',
        );
    }
    return secret;
}

/** Variables the secret Supabase key is read from, in order of preference (SEC-05). */
const SECRET_KEY_NAMES = Object.freeze(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);

/**
 * Name of the variable the secret key comes from. When none is set this is the
 * last (oldest) name, as before; `supabaseServiceKey()` is then undefined.
 * @returns {string}
 */
function supabaseSecretKeySource() {
    return SECRET_KEY_NAMES.find((name) => Boolean(process.env[name])) ?? SECRET_KEY_NAMES[SECRET_KEY_NAMES.length - 1];
}

/** Local development origins, allowed only outside production. */
const LOCAL_ORIGINS = Object.freeze(['http://localhost:3000', 'http://127.0.0.1:3000']);

/**
 * The browser origins allowed to call this server (NODE-09): `CORS_ORIGINS`
 * (comma-separated), else the legacy single `FRONTEND_URL`. Outside production
 * the local development origins are added. Production with neither set is a
 * configuration error (fail fast, NODE-05).
 * @returns {string[]}
 */
function corsOrigins() {
    const configured = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
    if (process.env.NODE_ENV === 'production') {
        if (!configured.trim()) throw new Error('[config] CORS_ORIGINS is required in production');
        return parseOrigins(configured);
    }
    return [...parseOrigins(configured), ...LOCAL_ORIGINS];
}

/** @type {Readonly<Env>} */
const env = Object.freeze({
    engineUrl,
    engineSharedSecret,
    corsOrigins,
    corsPreviewPattern: () => process.env.CORS_PREVIEW_ORIGIN_REGEX || undefined,
    port: () => process.env.PORT || DEFAULT_PORT,
    redisUrl: () => process.env.REDIS_URL || DEFAULT_REDIS_URL,
    supabaseUrl: () => process.env.SUPABASE_URL,
    supabaseServiceKey: () => process.env[supabaseSecretKeySource()],
    supabaseServiceKeySource: supabaseSecretKeySource,
});

module.exports = env;
