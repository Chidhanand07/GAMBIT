/**
 * src/services/socialService.js with fake private games and emitter.
 */
const { createSocialService } = require('../../src/services/socialService');
const { fakeEmitter, result } = require('./fakes');

function setup(random = 0.9) {
    const emitter = fakeEmitter();
    const privateGames = {
        createPrivateGame: jest.fn(async () => ({ id: 'g9', invite_token: 'tok' })),
        joinPrivateGame: jest.fn(async () => ({})),
    };
    const notificationsRepo = { insert: jest.fn(() => result()) };
    const svc = createSocialService({ privateGames, notificationsRepo, emitter, random: () => random });
    return { svc, emitter, privateGames, notificationsRepo };
}

const data = { from_user_id: 'a', to_user_id: 'b', time_control: '5', is_rated: true, by_username: 'bee' };

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('rematch: relay, accept (requester hosts, random colour), decline without payload', async () => {
    const { svc, emitter, privateGames } = setup();
    await svc.requestRematch(data);
    await svc.acceptRematch(data);
    svc.declineRematch(data);

    expect(privateGames.createPrivateGame).toHaveBeenCalledWith('a', '5', 'random', true);
    expect(privateGames.joinPrivateGame).toHaveBeenCalledWith('tok', 'b');
    expect(emitter.sent).toEqual([
        { room: 'user_b', event: 'rematch_request', args: [data] },
        { room: 'user_a', event: 'rematch_ready', args: [{ game_id: 'g9' }] },
        { room: 'user_b', event: 'rematch_ready', args: [{ game_id: 'g9' }] },
        { room: 'user_b', event: 'rematch_declined', args: [] },
    ]);
});

test.each([
    ['white', 0.1, 'a', 'b'],
    ['black', 0.9, 'b', 'a'],
    ['random', 0.9, 'a', 'b'],
    ['random', 0.1, 'b', 'a'],
])('challenge accept: challenger colour %p (roll %p) → host %p', async (color, roll, host, joiner) => {
    const { svc, privateGames, emitter } = setup(roll);
    await svc.acceptChallenge({ ...data, color });
    expect(privateGames.createPrivateGame).toHaveBeenCalledWith(host, '5', 'white', true);
    expect(privateGames.joinPrivateGame).toHaveBeenCalledWith('tok', joiner);
    expect(emitter.named('challenge_ready')).toHaveLength(2);
});

test('challenge request relays and stores a notification; decline tells the challenger', async () => {
    const { svc, emitter, notificationsRepo } = setup();
    await svc.requestChallenge({ ...data, from_username: 'ay', color: 'white' });
    svc.declineChallenge(data);
    expect(notificationsRepo.insert).toHaveBeenCalledWith({
        user_id: 'b',
        type: 'challenge',
        payload: { from_user_id: 'a', from_username: 'ay', time_control: '5', is_rated: true, color: 'white' },
        read: false,
        created_at: expect.any(String),
    });
    expect(emitter.sent.at(-1)).toEqual({ room: 'user_a', event: 'challenge_declined', args: [{ by: 'bee' }] });
});

test('accept failures are logged, not thrown', async () => {
    const { svc, privateGames } = setup();
    privateGames.createPrivateGame.mockRejectedValue(new Error('db'));
    await svc.acceptRematch(data);
    await svc.acceptChallenge({ ...data, color: 'white' });
    expect(console.error).toHaveBeenCalledWith('[rematch_accept] error:', 'db');
    expect(console.error).toHaveBeenCalledWith('[challenge_accept] error:', 'db');
});

test('announceGameStart emits game_start to the game room', () => {
    const { svc, emitter } = setup();
    svc.announceGameStart({ id: 'g1', status: 'active' });
    expect(emitter.sent).toEqual([{ room: 'game_g1', event: 'game_start', args: [{ id: 'g1', status: 'active' }] }]);
});
