/**
 * src/sockets — each event is a thin call into the right service, with the
 * socket id or a ClientPort (never the socket itself).
 */
const { registerSocketHandlers } = require('../../src/sockets');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');

function connect(deps, userId = 'u1') {
    let onConnection;
    const middlewares = [];
    registerSocketHandlers({ on: (event, cb) => (onConnection = cb), use: (mw) => middlewares.push(mw) }, deps);
    const handlers = {};
    const socket = {
        id: 'sock-1',
        // What the handshake middleware stores after verifying the token.
        data: { userId },
        on: (event, cb) => (handlers[event] = cb),
        join: jest.fn(),
        emit: jest.fn(),
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
            endGame: fn(),
        },
        chatService: { sendMessage: fn() },
        verifyToken: jest.fn(async () => 'u1'),
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

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('registers the handshake middleware and exactly the supported events (no `authenticate`)', () => {
    const { handlers, middlewares } = connect(deps());
    expect(middlewares).toHaveLength(1);
    expect(Object.keys(handlers).sort()).toEqual(
        [
            'join_queue',
            'leave_queue',
            'join_game',
            'spectate_game',
            'make_move',
            'send_message',
            'game_end',
            'rematch_request',
            'rematch_accept',
            'rematch_decline',
            'challenge_request',
            'challenge_accept',
            'challenge_decline',
            'disconnect',
        ].sort(),
    );
    expect(console.log).toHaveBeenCalledWith('Client connected:', 'sock-1');
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
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    connect(d);
    await flush();
    expect(error).toHaveBeenCalledWith('[socket] connection failed:', 'redis down');
});

test('validated payloads go to the services; the actor is always the verified user [S2]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    const data = { game_id: 'g' };
    await handlers.join_queue({ user: { id: 'victim' }, time_control: '10' });
    await handlers.make_move(data);
    await handlers.send_message(data);
    await handlers.game_end(data);
    await handlers.leave_queue('victim');
    expect(d.matchmaking.requestMatch).toHaveBeenCalledWith({ time_control: '10', user: { id: 'u1' } }, 'sock-1');
    expect(d.gameService.makeMove).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.chatService.sendMessage).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.gameService.endGame).toHaveBeenCalledWith(data);
    expect(d.matchmaking.leaveQueue).toHaveBeenCalledWith('u1');
});

test('social events: requests are sent *from*, and accepts made *by*, the verified user [S2]', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    await handlers.rematch_request({ from_user_id: 'victim', to_user_id: 'u2', time_control: '5' });
    await handlers.challenge_request({ from_user_id: 'victim', to_user_id: 'u2', color: 'white' });
    await handlers.rematch_accept({ from_user_id: 'u2', to_user_id: 'victim' });
    await handlers.challenge_accept({ from_user_id: 'u2', to_user_id: 'victim' });
    await handlers.rematch_decline({ to_user_id: 'u2' });
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
    expect(d.socialService.declineRematch).toHaveBeenCalledWith({ to_user_id: 'u2' });
});

test('an invalid payload never reaches a service and is acked as invalid_payload [S15]', async () => {
    const d = deps();
    const { handlers } = connect(d);
    const ack = jest.fn();
    await handlers.make_move(null, ack);
    await handlers.game_end({ game_id: 'g', result: 123 }, ack);
    await handlers.send_message('not an object', ack);
    expect(d.gameService.makeMove).not.toHaveBeenCalled();
    expect(d.gameService.endGame).not.toHaveBeenCalled();
    expect(d.chatService.sendMessage).not.toHaveBeenCalled();
    expect(ack.mock.calls).toEqual(Array(3).fill([{ ok: false, error: 'invalid_payload' }]));
});

test('a failing service is logged and acked, not thrown [S15]', async () => {
    const d = deps();
    d.gameService.makeMove.mockRejectedValue(new Error('redis down'));
    d.gameService.handleDisconnect.mockRejectedValue(new Error('redis down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { handlers } = connect(d);
    const ack = jest.fn();
    await expect(handlers.make_move({ game_id: 'g' }, ack)).resolves.toBeUndefined();
    await expect(handlers.disconnect()).resolves.toBeUndefined();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'internal_error' });
});

test('disconnect leaves the queue, forgets the session, then handles the game', async () => {
    const d = deps();
    const { handlers } = connect(d, 'u1');
    await handlers.disconnect();
    expect(d.matchmaking.leaveQueueBySocket).toHaveBeenCalledWith('sock-1');
    expect(d.sessions.userIdOf('sock-1')).toBeUndefined();
    expect(d.gameService.handleDisconnect).toHaveBeenCalledWith('u1');
});
