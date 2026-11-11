/**
 * src/services/privateGameService.js with injected token, randomness and ports.
 */
const { createPrivateGameService } = require('../../src/services/privateGameService');
const { fakeGameStore, result } = require('./fakes');

const FUTURE = new Date(Date.now() + 3600_000).toISOString();

function setup({ random = 0.9, row = null } = {}) {
    const gameStore = fakeGameStore();
    const gamesRepo = {
        insertReturning: jest.fn((r) => result({ id: 'g1', ...r })),
        findByInviteToken: jest.fn(() => result(row)),
        startIfWaiting: jest.fn((id, fields) => result({ ...row, ...fields })),
    };
    const svc = createPrivateGameService({ gamesRepo, gameStore, random: () => random, generateToken: () => 'tok' });
    return { svc, gamesRepo, gameStore };
}

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test.each([
    ['White', 0.1, { white_id: 'u', black_id: null }],
    ['black', 0.9, { white_id: null, black_id: 'u' }],
    ['random', 0.9, { white_id: 'u', black_id: null }],
    [undefined, 0.2, { white_id: null, black_id: 'u' }],
])('create: colour %p with roll %p seats the creator', async (color, roll, seats) => {
    const { svc, gamesRepo } = setup({ random: roll });
    await svc.createPrivateGame('u', '10', color, true);
    expect(gamesRepo.insertReturning.mock.calls[0][0]).toMatchObject({
        ...seats,
        invite_token: 'tok',
        status: 'waiting',
    });
});

test('create rethrows the insert error', async () => {
    const { svc, gamesRepo } = setup();
    gamesRepo.insertReturning.mockReturnValue(result(null, { message: 'nope' }));
    await expect(svc.createPrivateGame('u', '10')).rejects.toEqual({ message: 'nope' });
});

test('getGameByToken: null on error or long-expired invite', async () => {
    const { svc, gamesRepo } = setup();
    gamesRepo.findByInviteToken.mockReturnValueOnce(result(null, { message: 'db' }));
    expect(await svc.getGameByToken('t')).toBeNull();
    gamesRepo.findByInviteToken.mockReturnValueOnce(result({ invite_expires_at: '2000-01-01T00:00:00Z' }));
    expect(await svc.getGameByToken('t')).toBeNull();
});

test('join seats the joiner in the empty colour and writes Redis state', async () => {
    const row = {
        id: 'g1',
        white_id: 'host',
        black_id: null,
        status: 'waiting',
        time_control: '3+2',
        invite_expires_at: FUTURE,
    };
    const { svc, gamesRepo, gameStore } = setup({ row });
    const started = await svc.joinPrivateGame('tok', 'guest');
    expect(gamesRepo.startIfWaiting.mock.calls[0][1]).toEqual({
        white_id: 'host',
        black_id: 'guest',
        status: 'active',
        started_at: expect.any(String),
    });
    expect(started.black_id).toBe('guest');
    expect(gameStore.state.get('g1')).toMatchObject({
        whiteId: 'host',
        blackId: 'guest',
        isRated: false,
        incrementMs: 2000,
    });
});

test('join: creator re-join returns the row untouched; errors are thrown', async () => {
    const row = { id: 'g1', white_id: 'host', black_id: null, status: 'waiting', invite_expires_at: FUTURE };
    const { svc, gamesRepo } = setup({ row });
    expect(await svc.joinPrivateGame('tok', 'host')).toBe(row);
    expect(gamesRepo.startIfWaiting).not.toHaveBeenCalled();

    gamesRepo.findByInviteToken.mockReturnValue(result({ ...row, status: 'active' }));
    await expect(svc.joinPrivateGame('tok', 'x')).rejects.toThrow('Game already started');
    gamesRepo.findByInviteToken.mockReturnValue(result(null));
    await expect(svc.joinPrivateGame('tok', 'x')).rejects.toThrow('Invalid or expired token');
});
