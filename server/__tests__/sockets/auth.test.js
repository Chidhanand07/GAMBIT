/**
 * src/sockets/auth.js — handshake identity [S2] (NODE-10, SEC-09).
 */
const { createHandshakeAuth } = require('../../src/sockets/auth');
const { log } = require('../../src/observability/log');

const socketWith = (auth) => ({ handshake: { auth }, data: {} });

function run(middleware, socket) {
    return new Promise((resolve) => middleware(socket, (err) => resolve(err)));
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('a verified token stores the user id on socket.data and lets the connection through', async () => {
    const verifyToken = jest.fn(async () => 'user-1');
    const socket = socketWith({ token: 'good-token' });
    expect(await run(createHandshakeAuth({ verifyToken }), socket)).toBeUndefined();
    expect(verifyToken).toHaveBeenCalledWith('good-token');
    expect(socket.data.userId).toBe('user-1');
});

test.each([
    ['no auth object', undefined],
    ['no token', {}],
    ['empty token', { token: '' }],
    ['non-string token', { token: { sub: 'user-1' } }],
    ['oversized token', { token: 'x'.repeat(8193) }],
    ['a user id instead of a token', { userId: 'user-1' }],
])('%s is rejected as unauthorized without calling the verifier', async (_name, auth) => {
    const verifyToken = jest.fn(async () => 'user-1');
    const socket = socketWith(auth);
    const err = await run(createHandshakeAuth({ verifyToken }), socket);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('unauthorized');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(socket.data.userId).toBeUndefined();
});

test('a token the verifier does not recognise is rejected', async () => {
    const socket = socketWith({ token: 'forged' });
    const err = await run(createHandshakeAuth({ verifyToken: async () => null }), socket);
    expect(err.message).toBe('unauthorized');
    expect(socket.data.userId).toBeUndefined();
});

test('fails closed when the verifier throws (auth service unavailable)', async () => {
    const verifyToken = async () => {
        throw new Error('supabase unreachable');
    };
    const socket = socketWith({ token: 'good-token' });
    const err = await run(createHandshakeAuth({ verifyToken }), socket);
    expect(err.message).toBe('unauthorized');
    expect(socket.data.userId).toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('[socket] token verification failed:', 'supabase unreachable');
});

test('the deadline of the token is recorded next to the user id [TOKEN-LIFETIME]', async () => {
    const verifyToken = jest.fn(async () => 'user-1');
    const tokenDeadline = jest.fn(() => 1_700_000_900_000);
    const socket = socketWith({ token: 'good-token' });
    expect(await run(createHandshakeAuth({ verifyToken, tokenDeadline }), socket)).toBeUndefined();
    expect(tokenDeadline).toHaveBeenCalledWith('good-token');
    expect(socket.data).toEqual({ userId: 'user-1', tokenExpiresAt: 1_700_000_900_000 });
});

test('no deadline is computed for a token that was not verified', async () => {
    const tokenDeadline = jest.fn();
    const socket = socketWith({ token: 'bad' });
    await run(createHandshakeAuth({ verifyToken: async () => null, tokenDeadline }), socket);
    expect(tokenDeadline).not.toHaveBeenCalled();
    expect(socket.data.tokenExpiresAt).toBeUndefined();
});

test('a verifier failure (not a bad token) raises an alert (SEC-12) [OBSERVABILITY]', async () => {
    const { setErrorReporter } = require('../../src/observability/errorReporter');
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    try {
        const failure = new Error('supabase unreachable');
        await run(createHandshakeAuth({ verifyToken: async () => Promise.reject(failure) }), socketWith({ token: 't' }));
        await run(createHandshakeAuth({ verifyToken: async () => null }), socketWith({ token: 'forged' }));
        // Only the outage is reported; a forged token is an ordinary refusal.
        expect(report.mock.calls).toEqual([[failure, { where: 'socket:handshake' }]]);
    } finally {
        setErrorReporter(undefined);
    }
});
