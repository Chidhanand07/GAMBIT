// @ts-check
/**
 * Factory for the service-role Supabase client. Logs the same start-up lines
 * as the original `server/supabase.js` and falls back to placeholder values so
 * the process still boots without credentials.
 */
const { createClient } = require('@supabase/supabase-js');

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder';

/**
 * @param {object} settings
 * @param {string | undefined} settings.url Supabase project URL.
 * @param {string | undefined} settings.key service-role key.
 * @param {string} settings.keySource name of the env variable the key came from (logged when a key is set).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient({ url, key, keySource }) {
    if (!url) {
        console.error('[supabase] FATAL: SUPABASE_URL is not set. DB operations will fail.');
    } else {
        console.log('[supabase] URL:', url);
    }

    if (!key) {
        console.error(
            '[supabase] FATAL: Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set. All DB writes will fail (RLS will block them).',
        );
    } else {
        console.log(`[supabase] Using service key from ${keySource}`);
    }

    return createClient(url || PLACEHOLDER_URL, key || PLACEHOLDER_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

module.exports = { createSupabaseClient };
