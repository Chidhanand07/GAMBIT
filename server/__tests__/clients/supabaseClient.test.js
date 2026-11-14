/**
 * server/src/clients/supabaseClient.js — same createClient arguments and log lines.
 */
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ fake: true })) }));

const { createClient } = require('@supabase/supabase-js');
const { createSupabaseClient } = require('../../src/clients/supabaseClient');
const { log } = require('../../src/observability/log');

// global.fetch: adds X-Request-Id during an HTTP request [OBSERVABILITY]. Was: auth options only.
const AUTH_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: expect.any(Function) } };
let logSpy;
let errSpy;
beforeEach(() => {
    createClient.mockClear();
    logSpy = jest.spyOn(log, 'info');
    errSpy = jest.spyOn(log, 'error');
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

describe('X-Request-Id on Supabase calls [OBSERVABILITY]', () => {
    const { runWithRequestId } = require('../../src/observability/requestContext');
    const realSupabase = jest.requireActual('@supabase/supabase-js');

    /** A real supabase-js client built with the options our factory passes. */
    function realClient() {
        createSupabaseClient({ url: 'https://x.supabase.co', key: 'k', keySource: 'SUPABASE_SECRET_KEY' });
        const [url, key, options] = createClient.mock.calls[0];
        return realSupabase.createClient(url, key, options);
    }

    const okResponse = () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });

    test('a PostgREST call made while serving a request carries its id', async () => {
        const spy = jest.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
        const client = realClient();
        await runWithRequestId('req-7', async () => client.from('profiles').select('id'));
        const headers = new Headers(spy.mock.calls[0][1].headers);
        expect(headers.get('X-Request-Id')).toBe('req-7');
        // The client's own headers are kept.
        expect(headers.get('apikey')).toBe('k');
    });

    test('outside a request no X-Request-Id is added', async () => {
        const spy = jest.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
        await realClient().from('profiles').select('id');
        expect(new Headers(spy.mock.calls[0][1].headers).get('X-Request-Id')).toBeNull();
    });
});
