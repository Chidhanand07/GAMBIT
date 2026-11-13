/**
 * Express 5 and the central error handler [EXPRESS-5] (NODE-02, NODE-07).
 * Async route handlers may throw; Express 5 forwards the rejection to one error middleware.
 */
const express = require('express');
const { loopbackRequest, closeLoopbackServers } = require('../helpers/loopback');
const { version } = require('express/package.json');
const { createApp, attachErrorHandler } = require('../../src/http/app');
const { AppError } = require('../../src/services/errors');
const { log } = require('../../src/observability/log');

const allowAll = () => ({ isAllowed: () => true, allowsRequest: () => true });

function appWith(route) {
    const app = createApp({ originPolicy: allowAll });
    route(app);
    attachErrorHandler(app);
    return app;
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(async () => {
    jest.restoreAllMocks();
    // Each app is served on 127.0.0.1 (helpers/loopback.js, ADR F-067) [FLAKY].
    await closeLoopbackServers();
});

test('the server runs Express 5', () => {
    expect(Number(version.split('.')[0])).toBe(5);
    expect(typeof express.Router).toBe('function');
});

test('an async handler that throws an AppError → its status and code, as JSON', async () => {
    const app = appWith((a) =>
        a.get('/x', async () => {
            throw new AppError('engine_busy', 503);
        }),
    );
    const res = await (await loopbackRequest(app)).get('/x');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'engine_busy' });
});

test('an async handler that throws anything else → 500 internal_error, logged, no message or stack sent', async () => {
    const app = appWith((a) =>
        a.get('/x', async () => {
            throw new Error('db password is hunter2');
        }),
    );
    const res = await (await loopbackRequest(app)).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error' });
    expect(res.text).not.toContain('hunter2');
    expect(log.error).toHaveBeenCalledWith('[http] GET /x failed:', 'db password is hunter2');
});

test('a malformed JSON body → 400 invalid_request JSON (was Express 4\'s HTML error page)', async () => {
    const app = appWith((a) => a.post('/x', (req, res) => res.json(req.body)));
    const res = await (await loopbackRequest(app)).post('/x').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ error: 'invalid_request' });
});

test('a body over 16 KB → 413 payload_too_large (NODE-12)', async () => {
    const app = appWith((a) => a.post('/x', (req, res) => res.json({ ok: true })));
    const res = await (await loopbackRequest(app))
        .post('/x')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ fen: 'x'.repeat(17 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large' });
});

test('an unknown route → 404 JSON', async () => {
    const res = await (await loopbackRequest(appWith(() => {}))).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
});

test('X-Powered-By is not sent', async () => {
    const res = await (await loopbackRequest(appWith((a) => a.get('/x', (req, res) => res.json({}))))).get('/x');
    expect(res.headers['x-powered-by']).toBeUndefined();
});

test('an unexpected 500 is reported to the error tracker; an AppError is not (SEC-12) [OBSERVABILITY]', async () => {
    const { setErrorReporter } = require('../../src/observability/errorReporter');
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    try {
        const failure = new Error('db password is hunter2');
        const app = appWith((a) => {
            a.get('/boom', async () => {
                throw failure;
            });
            a.get('/busy', async () => {
                throw new AppError('engine_busy', 503);
            });
        });
        const client = await loopbackRequest(app);
        expect((await client.get('/boom')).status).toBe(500);
        expect((await client.get('/busy')).status).toBe(503);
        expect(report.mock.calls).toEqual([[failure, { where: 'http', route: 'GET /boom' }]]);
    } finally {
        setErrorReporter(undefined);
    }
});
