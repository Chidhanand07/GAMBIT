/**
 * src/sockets — each event is a thin call into the right service, with the
 * socket id or a ClientPort (never the socket itself).
 */
const { registerSocketHandlers } = require('../../src/sockets');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');

function connect(deps) {
    let onConnection;
    registerSocketHandlers({ on: (event, cb) => (onConnection = cb) }, deps);
    const handlers = {};
    const socket = {
        id: 'sock-1',
        on: (event, cb) => (handlers[event] = cb),
        join: jest.fn(),
        emit: jest.fn(),
    };
    onConnection(socket);
    return { socket, handlers };
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

test('registers exactly the original events', () => {
    const { handlers } = connect(deps());
    expect(Object.keys(handlers).sort()).toEqual(
        [
            'authenticate',
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

test('authenticate registers the session, joins user_<id>, acks, then reconnects', async () => {
    const d = deps();
    const { socket, handlers } = connect(d);
    await handlers.authenticate('u1');
    expect(d.sessions.userIdOf('sock-1')).toBe('u1');
    expect(socket.join).toHaveBeenCalledWith('user_u1');
    expect(socket.emit).toHaveBeenCalledWith('authenticated', { userId: 'u1' });
    const client = d.gameService.reconnect.mock.calls[0][1];
    expect(client.id).toBe('sock-1');
    client.emit('rematch_declined');
    expect(socket.emit).toHaveBeenLastCalledWith('rematch_declined');
});

test('validated payloads go to the services, with the socket id where identity matters', async () => {
    const d = deps();
    const { handlers } = connect(d);
    const data = { game_id: 'g' };
    const queue = { user: { id: 'u9' }, time_control: '10' };
    const decline = { to_user_id: 'u2' };
    await handlers.join_queue(queue);
    await handlers.make_move(data);
    await handlers.send_message(data);
    await handlers.game_end(data);
    await handlers.rematch_decline(decline);
    await handlers.leave_queue('u9');
    expect(d.matchmaking.requestMatch).toHaveBeenCalledWith(queue, 'sock-1');
    expect(d.gameService.makeMove).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.chatService.sendMessage).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.gameService.endGame).toHaveBeenCalledWith(data);
    expect(d.socialService.declineRematch).toHaveBeenCalledWith(decline);
    expect(d.matchmaking.leaveQueue).toHaveBeenCalledWith('u9');
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
    const { handlers } = connect(d);
    await handlers.authenticate('u1');
    await handlers.disconnect();
    expect(d.matchmaking.leaveQueueBySocket).toHaveBeenCalledWith('sock-1');
    expect(d.sessions.userIdOf('sock-1')).toBeUndefined();
    expect(d.gameService.handleDisconnect).toHaveBeenCalledWith('u1');
});
