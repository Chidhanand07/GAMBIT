/**
 * server/src/clients/supabaseClient.js — same createClient arguments and log lines.
 */
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ fake: true })) }));

const { createClient } = require('@supabase/supabase-js');
const { createSupabaseClient } = require('../../src/clients/supabaseClient');

const AUTH_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false } };
let logSpy;
let errSpy;
beforeEach(() => {
    createClient.mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('configured: logs URL and key source, passes them through', () => {
    const client = createSupabaseClient({ url: 'https://x.supabase.co', key: 'k', keySource: 'SUPABASE_SERVICE_KEY' });
    expect(client).toEqual({ fake: true });
    expect(createClient).toHaveBeenCalledWith('https://x.supabase.co', 'k', AUTH_OPTIONS);
    expect(logSpy.mock.calls).toEqual([
        ['[supabase] URL:', 'https://x.supabase.co'],
        ['[supabase] Using service key from SUPABASE_SERVICE_KEY'],
    ]);
    expect(errSpy).not.toHaveBeenCalled();
});

test('unconfigured: logs both FATAL lines and uses placeholders', () => {
    createSupabaseClient({ url: undefined, key: undefined, keySource: 'SUPABASE_SERVICE_ROLE_KEY' });
    expect(createClient).toHaveBeenCalledWith('https://placeholder.supabase.co', 'placeholder', AUTH_OPTIONS);
    expect(errSpy.mock.calls).toEqual([
        ['[supabase] FATAL: SUPABASE_URL is not set. DB operations will fail.'],
        [
            '[supabase] FATAL: SUPABASE_SECRET_KEY is not set (nor the legacy SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY). All DB writes will fail (RLS will block them).',
        ],
    ]);
    expect(logSpy).not.toHaveBeenCalled();
});
