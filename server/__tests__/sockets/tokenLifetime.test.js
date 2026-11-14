/**
 * src/sockets/tokenLifetime.js — a socket does not outlive the token it was opened with
 * [TOKEN-LIFETIME] (NODE-10).
 */
const { watchTokenExpiry, TOKEN_EXPIRED, TOKEN_RECONNECT_GRACE_MS } = require('../../src/sockets/tokenLifetime');

function fakeSocket(tokenExpiresAt) {
    return { data: { userId: 'u1', tokenExpiresAt }, emit: jest.fn(), disconnect: jest.fn() };
}

beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
afterEach(() => jest.useRealTimers());

test('at the expiry the client is told why and the socket is closed by the server', () => {
    const socket = fakeSocket(1_000_000 + 60_000);
    watchTokenExpiry(socket);

    jest.advanceTimersByTime(59_999);
    expect(socket.disconnect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(socket.emit).toHaveBeenCalledWith('token_expired', { reason: TOKEN_EXPIRED });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.data.tokenExpired).toBe(true);
    // The reason is announced before the connection is cut.
    expect(socket.emit.mock.invocationCallOrder[0]).toBeLessThan(socket.disconnect.mock.invocationCallOrder[0]);
});

test('a token that is already expired closes the socket on the next tick', () => {
    const socket = fakeSocket(1_000_000 - 5);
    watchTokenExpiry(socket);
    jest.advanceTimersByTime(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});

test('the grace period for coming back with a fresh token is short and named', () => {
    expect(TOKEN_RECONNECT_GRACE_MS).toBe(5000);
});

test('a socket that disconnects first cancels its timer', () => {
    const socket = fakeSocket(1_000_000 + 60_000);
    const cancel = watchTokenExpiry(socket);
    cancel();
    jest.advanceTimersByTime(120_000);
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

test('a socket without a recorded expiry is closed at once (fail closed)', () => {
    const socket = fakeSocket(undefined);
    watchTokenExpiry(socket);
    jest.advanceTimersByTime(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
