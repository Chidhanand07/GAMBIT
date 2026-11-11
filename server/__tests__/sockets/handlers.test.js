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

test('payloads go to the services unchanged, with the socket id where identity matters', () => {
    const d = deps();
    const { handlers } = connect(d);
    const data = { game_id: 'g' };
    handlers.join_queue(data);
    handlers.make_move(data);
    handlers.send_message(data);
    handlers.game_end(data);
    handlers.rematch_decline(data);
    handlers.leave_queue('u9');
    expect(d.matchmaking.requestMatch).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.gameService.makeMove).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.chatService.sendMessage).toHaveBeenCalledWith(data, 'sock-1');
    expect(d.gameService.endGame).toHaveBeenCalledWith(data);
    expect(d.socialService.declineRematch).toHaveBeenCalledWith(data);
    expect(d.matchmaking.leaveQueue).toHaveBeenCalledWith('u9');
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
