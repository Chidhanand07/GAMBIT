// @ts-check
/**
 * The only module that reads `process.env` (NODE-05). Names and defaults are
 * unchanged from the pre-refactor code.
 *
 * Every setting is an accessor that reads `process.env` when it is called,
 * not when this module loads. The original code read ENGINE_URL and
 * FRONTEND_URL on every request and PORT/REDIS_URL/SUPABASE_* when their
 * modules loaded (after `dotenv` ran); call-time accessors keep each read at
 * exactly that moment (ADR 0101).
 */

const DEFAULT_ENGINE_URL = 'http://localhost:8001';
const DEFAULT_PORT = 3001;
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

/**
 * @typedef {object} Env
 * @property {() => string} engineUrl chess-engine base URL (`ENGINE_URL`).
 * @property {() => string | undefined} frontendUrl extra CORS origin (`FRONTEND_URL`).
 * @property {() => string | number} port HTTP port (`PORT`, default 3001).
 * @property {() => string} redisUrl `REDIS_URL`, default local Redis.
 * @property {() => string | undefined} supabaseUrl `SUPABASE_URL`.
 * @property {() => string | undefined} supabaseServiceKey
 *   `SUPABASE_SERVICE_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`.
 * @property {() => string} supabaseServiceKeySource name of the variable the key came from.
 */

/** @type {Readonly<Env>} */
const env = Object.freeze({
    engineUrl: () => process.env.ENGINE_URL || DEFAULT_ENGINE_URL,
    frontendUrl: () => process.env.FRONTEND_URL,
    port: () => process.env.PORT || DEFAULT_PORT,
    redisUrl: () => process.env.REDIS_URL || DEFAULT_REDIS_URL,
    supabaseUrl: () => process.env.SUPABASE_URL,
    supabaseServiceKey: () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseServiceKeySource: () =>
        process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY' : 'SUPABASE_SERVICE_ROLE_KEY',
});

module.exports = env;
