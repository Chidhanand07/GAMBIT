/**
 * src/clients/webhookErrorReporter.js — error reports POSTed to ERROR_WEBHOOK_URL (SEC-12, ADR F-069).
 */
const { createWebhookErrorReporter } = require('../../src/clients/webhookErrorReporter');
const { log } = require('../../src/observability/log');

const URL = 'https://hooks.example.com/services/T000/B000/secret-part';
const ORIGIN = { service: 'gambit-server', release: 'abc123', hostname: 'replica-1' };
const okFetch = () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });

afterEach(() => jest.restoreAllMocks());

test('POSTs one JSON document with a summary line, the error and the redacted context', async () => {
    const spy = okFetch();
    const reporter = createWebhookErrorReporter({ url: URL, origin: ORIGIN, now: () => Date.UTC(2026, 10, 14) });
    const error = new Error('insert failed');
    await reporter.report(error, { where: 'http', route: 'POST /x', token: 'eyJ...', apiKey: 'k' });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
        text: '[gambit-server] error in http: insert failed',
        content: '[gambit-server] error in http: insert failed',
        service: 'gambit-server',
        release: 'abc123',
        hostname: 'replica-1',
        level: 'error',
        time: '2026-11-14T00:00:00.000Z',
        error: { name: 'Error', message: 'insert failed' },
        context: { where: 'http', route: 'POST /x', token: '[REDACTED]', apiKey: '[REDACTED]' },
    });
    expect(body.error.stack).toContain('insert failed');
    expect(init.body).not.toContain('eyJ');
});

test('a fatal report says so; a non-Error (Supabase { message }) is described by its message', async () => {
    const spy = okFetch();
    await createWebhookErrorReporter({ url: URL, origin: ORIGIN }).report(
        { message: 'connection refused', code: 'PGRST' },
        { level: 'fatal', where: 'process' },
    );
    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.text).toBe('[gambit-server] fatal in process: connection refused');
    expect(body.error).toEqual({ name: 'NonError', message: 'connection refused' });
});

test('at most maxPerMinute reports a minute; the rest are dropped and counted', async () => {
    const spy = okFetch();
    let now = 0;
    const reporter = createWebhookErrorReporter({ url: URL, origin: ORIGIN, maxPerMinute: 2, now: () => now });
    for (let i = 0; i < 5; i++) await reporter.report(new Error(`e${i}`), { where: 'test' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(reporter.dropped()).toBe(3);
    now = 60_000;
    await reporter.report(new Error('next minute'), { where: 'test' });
    expect(spy).toHaveBeenCalledTimes(3);
});

test('a failing or refusing webhook is logged at warn (without the URL) and never thrown', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ ok: false, status: 500 });
    const reporter = createWebhookErrorReporter({ url: URL, origin: ORIGIN });
    await expect(reporter.report(new Error('a'), { where: 'test' })).resolves.toBeUndefined();
    await expect(reporter.report(new Error('b'), { where: 'test' })).resolves.toBeUndefined();
    expect(log.warn.mock.calls).toEqual([
        ['[error-reporter] webhook failed:', 'timeout'],
        ['[error-reporter] webhook answered', 500],
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('secret-part');
});

test('the POST is aborted after timeoutMs', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
        (_url, init) =>
            new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    );
    const reporter = createWebhookErrorReporter({ url: URL, origin: ORIGIN, timeoutMs: 20 });
    await reporter.report(new Error('slow'), { where: 'test' });
    expect(log.warn).toHaveBeenCalledWith('[error-reporter] webhook failed:', expect.stringMatching(/abort|timeout/i));
});
