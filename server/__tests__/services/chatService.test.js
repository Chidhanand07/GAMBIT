/**
 * src/services/chatService.js — in-game chat [G6] (NODE-08, NODE-11).
 * The message text is the `text` the web client sends; only the two players of an ACTIVE
 * game may chat; the sender is the verified user.
 */
const { createChatService } = require('../../src/services/chatService');
const { fakeEmitter, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

function setup(game = makeGame({ id: 'g' })) {
    const emitter = fakeEmitter();
    const messagesRepo = { insert: jest.fn(() => result()) };
    const svc = createChatService({ gameStore: fakeGameStore({ g: game }), messagesRepo, emitter });
    return { svc, emitter, messagesRepo };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('the text the client sent is what is stored and broadcast, with the verified sender [G6]', async () => {
    const { svc, emitter, messagesRepo } = setup();
    const ack = await svc.sendMessage({ game_id: 'g', from: 'whitey', text: 'gl hf' }, 'white-user');

    expect(ack).toEqual({ ok: true });
    // Was `content: undefined`: the server read `message`, the client sends `text`.
    expect(messagesRepo.insert).toHaveBeenCalledWith({
        game_id: 'g',
        user_id: 'white-user',
        content: 'gl hf',
        created_at: expect.any(String),
    });
    expect(emitter.sent).toEqual([
        {
            room: 'game_g',
            event: 'chat_message',
            args: [{ game_id: 'g', from: 'whitey', text: 'gl hf', from_user_id: 'white-user' }],
        },
    ]);
});

test('only the fields of the chat DTO are broadcast: nothing else a client adds is relayed', async () => {
    const { svc, emitter } = setup();
    await svc.sendMessage({ game_id: 'g', text: 'hi', from_user_id: 'forged', admin: true }, 'black-user');
    expect(emitter.sent[0].args[0]).toEqual({ game_id: 'g', text: 'hi', from_user_id: 'black-user' });
});

test.each([
    ['a stranger', 'stranger', makeGame({ id: 'g' }), 'not_a_player'],
    ['a finished game', 'white-user', makeGame({ id: 'g', status: 'completed', result: 'white' }), 'game_not_active'],
    ['an aborted game', 'white-user', makeGame({ id: 'g', status: 'completed', result: 'aborted' }), 'game_not_active'],
])('%s → refused with a reason; nothing stored, nothing broadcast', async (_label, userId, game, reason) => {
    const { svc, emitter, messagesRepo } = setup(game);
    expect(await svc.sendMessage({ game_id: 'g', text: 'hi' }, userId)).toEqual({ ok: false, error: reason });
    expect(emitter.sent).toEqual([]);
    expect(messagesRepo.insert).not.toHaveBeenCalled();
});

test('an unknown game → game_not_found', async () => {
    const { svc } = setup();
    expect(await svc.sendMessage({ game_id: 'nope', text: 'hi' }, 'white-user')).toEqual({ ok: false, error: 'game_not_found' });
});

test('a persist error is logged after the broadcast; the message was still delivered', async () => {
    const { svc, messagesRepo, emitter } = setup();
    messagesRepo.insert.mockReturnValue(result(null, { message: 'rls' }));
    expect(await svc.sendMessage({ game_id: 'g', text: 'hi' }, 'white-user')).toEqual({ ok: true });
    await flush();
    expect(console.error).toHaveBeenCalledWith('[send_message] persist:', 'rls');
    expect(emitter.named('chat_message')).toHaveLength(1);
});
