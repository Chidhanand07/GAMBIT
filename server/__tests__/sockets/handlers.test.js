/**
 * src/sockets — each event is a thin call into the right service, with the
 * socket id or a ClientPort (never the socket itself).
 */
const { registerSocketHandlers } = require('../../src/sockets');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { log } = require('../../src/observability/log');

function connect(deps, userId = 'u1') {
    let onConnection;
    const middlewares = [];
    registerSocketHandlers({ on: (event, cb) => (onConnection = cb), use: (mw) => middlewares.push(mw) }, deps);
    const handlers = {};
    const socket = {
        id: 'sock-1',
        // What the handshake middleware stores after verifying the token.
        data: { userId, tokenExpiresAt: Date.now() + 3_600_000 },
        on: (event, cb) => (handlers[event] = cb),
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
    };
    onConnection(socket);
    return { socket, handlers, middlewares };
}

function deps() {
    const fn = () => jest.fn(async () => {});
    return {
        sessions: createSessionRegistry(),
        matchmaking: { requestMatch: fn(), leaveQueue: jest.fn(), leaveQueueBySocket: jest.fn() },
        gameService: {
            reconnect: fn(),
            handleDisconnect: fn(),
            joinGame: fn(),
            spectate: fn(),
            makeMove: fn(),
            resign: fn(),
        },
        chatService: { sendMessage: fn() },
        verifyToken: jest.fn(async () => 'u1'),
        // Other instances hold no socket of this player unless a test says so.
        countPlayerSockets: jest.fn(async () => 0),
        socialService: {
            requestRematch: fn(),
            acceptRematch: fn(),
            declineRematch: jest.fn(),
            requestChallenge: fn(),
            acceptChallenge: fn(),
            declineChallenge: jest.fn(),
        },
    };
}

beforeEach(() => jest.spyOn(log, 'info'));
afterEach(() => jest.restoreAllMocks());

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('registers the handshake middleware and exactly the supported events (no `authenticate`, no client `game_end`)', () => {
    const { handlers, middlewares, socket } = connect(deps());
    expect(middlewares).toHaveLength(1);
    expect(Object.keys(handlers).sort()).toEqual(
        [
            'join_queue',
            'leave_queue',
            'join_game',
            'spectate_game',
            'make_move',
            'send_message',
            'resign',
            'rematch_request',
            'rematch_accept',
            'rematch_decline',
            'challenge_request',
            'challenge_accept',
            'challenge_decline',
            'disconnect',
        ].sort(),
    );
    // socket.data is serialized by the Redis adapter for connection-state recovery: plain data
    // only. Was: a pino child logger stored there, which made every disconnect throw [MULTI-INSTANCE].
    expect(() => structuredClone(socket.data)).not.toThrow();
});

test('the handshake middleware rejects a connection without a valid token [S2]', async () => {
    const d = deps();
    d.verifyToken.mockResolvedValue(null);
    const { middlewares } = connect(d);
    const socket = { handshake: { auth: { token: 'forged' } }, data: {} };
    const err = await new Promise((resolve) => middlewares[0](socket, resolve));
    expect(err.message).toBe('unauthorized');
    expect(socket.data.userId).toBeUndefined();
});

test('a connection registers the verified user, joins user_<id>, then resumes their game [S2]', async () => {
    const d = deps();
    const { socket } = connect(d, 'u1');
    await flush();
    expect(d.sessions.userIdOf('sock-1')).toBe('u1');
    expect(socket.join).toHaveBeenCalledWith('user_u1');
    expect(socket.emit).not.toHaveBeenCalledWith('authenticated', expect.anything());
    expect(d.gameService.reconnect).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'sock-1' }));
    const client = d.gameService.reconnect.mock.calls[0][1];
    client.emit('rematch_declined');
    expect(socket.emit).toHaveBeenLastCalledWith('rematch_declined');
});

test('a failing reconnect on connection is logged, not thrown [S15]', async () => {
    const d = deps();
    d.gameService.reconnect.mockRejectedValue(new Error('redis down'));
    const error = jest.spyOn(log, 'error');
    connect(d);
    await flush();
    expect(error).toHaveBeenCalledWith('[socket] connection failed:', 'redis down');
});

test('validated payloads go to the services; the actor is always the verified user [S2]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    const data = { game_id: 'g' };
    const move = { game_id: 'g', from: 'e2', to: 'e4' };
    await handlers.join_queue({ user: { id: 'victim' }, time_control: '10' });
    await handlers.join_game('g');
    await handlers.make_move({ ...move, fen: 'client-fen', san: 'e4' });
    await handlers.send_message({ ...data, text: 'hello' });
    await handlers.resign({ ...data, result: 'White wins' });
    await handlers.leave_queue('victim');
    expect(d.matchmaking.requestMatch).toHaveBeenCalledWith({ time_control: '10', user: { id: 'u1' } }, 'sock-1');
    expect(d.gameService.joinGame).toHaveBeenCalledWith('g', expect.objectContaining({ id: 'sock-1' }), 'u1');
    expect(d.gameService.makeMove).toHaveBeenCalledWith(move, 'u1', expect.objectContaining({ id: 'sock-1' }));
    // The chat service gets the validated message and the verified user (not a socket id) [G6].
    expect(d.chatService.sendMessage).toHaveBeenCalledWith({ game_id: 'g', text: 'hello' }, 'u1');
    expect(d.gameService.resign).toHaveBeenCalledWith(data, 'u1');
    expect(d.matchmaking.leaveQueue).toHaveBeenCalledWith('u1');
});

test('social events: requests are sent *from*, and answers given *by*, the verified user [S2][S4]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    await handlers.rematch_request({ from_user_id: 'victim', to_user_id: 'u2', time_control: '5' });
    await handlers.challenge_request({ from_user_id: 'victim', to_user_id: 'u2', color: 'white' });
    await handlers.rematch_accept({ from_user_id: 'u2', to_user_id: 'victim' });
    await handlers.challenge_accept({ from_user_id: 'u2', to_user_id: 'victim' });
    await handlers.rematch_decline({ from_user_id: 'u2', to_user_id: 'victim' });
    await handlers.challenge_decline({ from_user_id: 'u2', by_username: 'me' });
    expect(d.socialService.requestRematch).toHaveBeenCalledWith({
        from_user_id: 'u1',
        to_user_id: 'u2',
        time_control: '5',
    });
    expect(d.socialService.requestChallenge).toHaveBeenCalledWith({
        from_user_id: 'u1',
        to_user_id: 'u2',
        color: 'white',
    });
    expect(d.socialService.acceptRematch).toHaveBeenCalledWith({ from_user_id: 'u2', to_user_id: 'u1' });
    expect(d.socialService.acceptChallenge).toHaveBeenCalledWith({ from_user_id: 'u2', to_user_id: 'u1' });
    expect(d.socialService.declineRematch).toHaveBeenCalledWith({ from_user_id: 'u2', to_user_id: 'u1' });
    expect(d.socialService.declineChallenge).toHaveBeenCalledWith({ from_user_id: 'u2', by_username: 'me', to_user_id: 'u1' });
});

test('an invalid payload never reaches a service and is acked as invalid_payload [S15]', async () => {
    const d = deps();
    const { handlers } = connect(d);
    const ack = jest.fn();
    await handlers.make_move(null, ack);
    await handlers.resign({ game_id: 123 }, ack);
    await handlers.send_message('not an object', ack);
    expect(d.gameService.makeMove).not.toHaveBeenCalled();
    expect(d.gameService.resign).not.toHaveBeenCalled();
    expect(d.chatService.sendMessage).not.toHaveBeenCalled();
    expect(ack.mock.calls).toEqual(Array(3).fill([{ ok: false, error: 'invalid_payload' }]));
});

test('a failing service is logged and acked, not thrown [S15]', async () => {
    const d = deps();
    d.gameService.makeMove.mockRejectedValue(new Error('redis down'));
    d.gameService.handleDisconnect.mockRejectedValue(new Error('redis down'));
    jest.spyOn(log, 'error');
    const { handlers } = connect(d);
    const ack = jest.fn();
    await expect(handlers.make_move({ game_id: 'g', from: 'e2', to: 'e4' }, ack)).resolves.toBeUndefined();
    await expect(handlers.disconnect()).resolves.toBeUndefined();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'internal_error' });
});

test('disconnect leaves the queue, forgets the session, then handles the game the player has no socket left in', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    d.sessions.linkSocket('sock-1', 'g');
    await handlers.disconnect();
    expect(d.matchmaking.leaveQueueBySocket).toHaveBeenCalledWith('sock-1');
    expect(d.sessions.userIdOf('sock-1')).toBeUndefined();
    expect(d.gameService.handleDisconnect.mock.calls).toEqual([['u1', 'g']]);
});

test('a socket that was not at any board disconnects without touching a game [MULTI-SOCKET]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    await handlers.disconnect();
    expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
});

test('closing one of two tabs on the same game does not start the countdown [MULTI-SOCKET]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    d.sessions.register('u1', 'other-tab');
    d.sessions.linkSocket('sock-1', 'g');
    d.sessions.linkSocket('other-tab', 'g');
    await handlers.disconnect();
    expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
});

describe('a socket closed because its token expired [TOKEN-LIFETIME]', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function expiredAtTheBoard() {
        const d = deps();
        const { socket, handlers } = connect(d, 'u1');
        d.sessions.linkSocket('sock-1', 'g');
        socket.data.tokenExpired = true; // set by watchTokenExpiry just before it disconnects
        return { d, handlers };
    }

    test('the abandonment countdown does not start at once: the client is on its way back', async () => {
        const { d, handlers } = expiredAtTheBoard();
        await handlers.disconnect();
        expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
    });

    test('back within the grace period with a fresh token and re-joined: nothing happens', async () => {
        const { d, handlers } = expiredAtTheBoard();
        await handlers.disconnect();
        d.sessions.register('u1', 'sock-2');
        d.sessions.linkSocket('sock-2', 'g');
        await jest.advanceTimersByTimeAsync(5000);
        expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
    });

    test('not back after the grace period: the player has left, the countdown starts', async () => {
        const { d, handlers } = expiredAtTheBoard();
        await handlers.disconnect();
        await jest.advanceTimersByTimeAsync(4999);
        expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(1);
        expect(d.gameService.handleDisconnect.mock.calls).toEqual([['u1', 'g']]);
    });

    test('the expiry timer of a socket is cancelled when it disconnects', async () => {
        const d = deps();
        const { socket, handlers } = connect(d, 'u1');
        await handlers.disconnect();
        await jest.advanceTimersByTimeAsync(4_000_000);
        expect(socket.disconnect).not.toHaveBeenCalled();
    });
});

describe('the countdown needs every instance to agree the player is gone [MULTI-INSTANCE]', () => {
    test('a player socket on another instance keeps the game alive', async () => {
        const d = { ...deps(), countPlayerSockets: jest.fn(async () => 1) };
        const { handlers } = connect(d, 'u1');
        d.sessions.linkSocket('sock-1', 'g');
        await handlers.disconnect();
        expect(d.countPlayerSockets).toHaveBeenCalledWith('u1', 'g');
        expect(d.gameService.handleDisconnect).not.toHaveBeenCalled();
    });

    test('no player socket anywhere: the countdown starts', async () => {
        const d = { ...deps(), countPlayerSockets: jest.fn(async () => 0) };
        const { handlers } = connect(d, 'u1');
        d.sessions.linkSocket('sock-1', 'g');
        await handlers.disconnect();
        expect(d.gameService.handleDisconnect.mock.calls).toEqual([['u1', 'g']]);
    });
});
