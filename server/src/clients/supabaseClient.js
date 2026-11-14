// @ts-check
/**
 * Factory for the service-role Supabase client. Logs the same start-up lines
 * as the original `server/supabase.js` and falls back to placeholder values so
 * the process still boots without credentials.
 */
const { createClient } = require('@supabase/supabase-js');
const { log } = require('../observability/log');
const { REQUEST_ID_HEADER, currentRequestId } = require('../observability/requestContext');

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder';

/**
 * The `fetch` the Supabase client uses: the global one, plus `X-Request-Id` while an HTTP
 * request is being served, so a PostgREST/Auth call can be matched to our request log line
 * (supabase-js `global.fetch`; the API gateway receives the header, whether it records it
 * is up to Supabase). Resolves `fetch` per call, so tests can replace it.
 * @param {string | URL | Request} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
function requestIdFetch(input, init = {}) {
    const requestId = currentRequestId();
    if (!requestId) return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return fetch(input, { ...init, headers });
}

/**
 * @param {object} settings
 * @param {string | undefined} settings.url Supabase project URL.
 * @param {string | undefined} settings.key secret key (`sb_secret_…`, or the legacy service_role JWT).
 * @param {string} settings.keySource name of the env variable the key came from (logged when a key is set).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient({ url, key, keySource }) {
    if (!url) {
        log.error('[supabase] FATAL: SUPABASE_URL is not set. DB operations will fail.');
    } else {
        log.info('[supabase] URL:', url);
    }

    if (!key) {
        log.error(
            '[supabase] FATAL: SUPABASE_SECRET_KEY is not set (nor the legacy SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY). All DB writes will fail (RLS will block them).',
        );
    } else {
        log.info(`[supabase] Using service key from ${keySource}`);
    }

    return createClient(url || PLACEHOLDER_URL, key || PLACEHOLDER_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: requestIdFetch },
    });
}

module.exports = { createSupabaseClient };
