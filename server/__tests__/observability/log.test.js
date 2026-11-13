/**
 * src/observability/log.js — structured JSON logs with secrets redacted [OBSERVABILITY] (NODE-20).
 */
const { Writable } = require('node:stream');
const { createLogger } = require('../../src/observability/log');

function capture() {
    const lines = [];
    const destination = new Writable({
        write(chunk, _enc, done) {
            lines.push(JSON.parse(chunk.toString()));
            done();
        },
    });
    return { lines, log: createLogger({ level: 'info', destination }) };
}

test('one JSON object per line with level, time, service and message', async () => {
    const { lines, log } = capture();
    log.error('[clock] ticker error:', 'redis down');
    expect(lines[0]).toMatchObject({ level: 50, service: 'gambit-server', msg: '[clock] ticker error:', detail: 'redis down' });
    expect(typeof lines[0].time).toBe('string');
});

test('child loggers add their context to every line', () => {
    const { lines, log } = capture();
    log.child({ socketId: 's1', userId: 'u1' }).child({ gameId: 'g1' }).info('joined');
    expect(lines[0]).toMatchObject({ socketId: 's1', userId: 'u1', gameId: 'g1', msg: 'joined' });
});

test.each([
    ['an Authorization header', { req: { headers: { authorization: 'Bearer eyJsecret' } } }],
    ['a cookie', { req: { headers: { cookie: 'sb-ref-auth-token=eyJsecret' } } }],
    ['the engine key', { req: { headers: { 'x-engine-key': 'eyJsecret' } } }],
    ['a token field', { detail: { token: 'eyJsecret' } }],
    ['an access token', { session: { access_token: 'eyJsecret', refresh_token: 'eyJsecret' } }],
])('%s is redacted', (_label, object) => {
    const { lines, log } = capture();
    log.pino.info(object, 'request');
    expect(JSON.stringify(lines[0])).not.toContain('eyJsecret');
    expect(JSON.stringify(lines[0])).toContain('[REDACTED]');
});
