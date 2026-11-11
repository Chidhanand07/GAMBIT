/**
 * src/services/chatService.js.
 */
const { createChatService } = require('../../src/services/chatService');
const { fakeEmitter, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

function setup(userId = 'white-user') {
    const emitter = fakeEmitter();
    const messagesRepo = { insert: jest.fn(() => result()) };
    const sessions = { userIdOf: () => userId };
    const svc = createChatService({
        gameStore: fakeGameStore({ g: makeGame({ id: 'g' }) }),
        messagesRepo,
        sessions,
        emitter,
    });
    return { svc, emitter, messagesRepo };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('a player message is persisted and broadcast with the session identity', async () => {
    const { svc, emitter, messagesRepo } = setup();
    await svc.sendMessage({ game_id: 'g', message: 'hi', from_user_id: 'forged' }, 's');
    expect(messagesRepo.insert).toHaveBeenCalledWith({
        game_id: 'g',
        user_id: 'white-user',
        content: 'hi',
        created_at: expect.any(String),
    });
    expect(emitter.sent).toEqual([
        { room: 'game_g', event: 'chat_message', args: [{ game_id: 'g', message: 'hi', from_user_id: 'white-user' }] },
    ]);
});

test('strangers and unauthenticated sockets are ignored', async () => {
    for (const who of ['stranger', null]) {
        const { svc, emitter, messagesRepo } = setup(who);
        await svc.sendMessage({ game_id: 'g', message: 'hi' }, 's');
        expect(emitter.sent).toHaveLength(0);
        expect(messagesRepo.insert).not.toHaveBeenCalled();
    }
});

test('a persist error is logged after the broadcast', async () => {
    const { svc, messagesRepo } = setup();
    messagesRepo.insert.mockReturnValue(result(null, { message: 'rls' }));
    await svc.sendMessage({ game_id: 'g', message: 'hi' }, 's');
    await flush();
    expect(console.error).toHaveBeenCalledWith('[send_message] persist:', 'rls');
});
