/**
 * src/services/privateGameService.js with injected token, randomness and ports.
 *
 * INV-TOKEN: the invite token lives in `game_invites` (service-role only), not
 * on the world-readable `games` row. The game is inserted without any token
 * column, the invite is stored separately, and lookups go token → invite → game.
 */
const { createPrivateGameService } = require('../../src/services/privateGameService');
const { fakeGameStore, result } = require('./fakes');

const FUTURE = new Date(Date.now() + 3600_000).toISOString();

function setup({ random = 0.9, row = null, invite = { game_id: 'g1', expires_at: FUTURE } } = {}) {
    const gameStore = fakeGameStore();
    const gamesRepo = {
        insertReturning: jest.fn((r) => result({ id: 'g1', ...r })),
        findByIdWithPlayers: jest.fn(() => result(row)),
        startIfWaiting: jest.fn((id, fields) => result({ ...row, ...fields })),
        deleteById: jest.fn(() => result()),
    };
    const invitesRepo = {
        insert: jest.fn(() => result()),
        findByToken: jest.fn(() => result(invite)),
    };
    const svc = createPrivateGameService({
        gamesRepo,
        invitesRepo,
        gameStore,
        random: () => random,
        generateToken: () => 'tok',
    });
    return { svc, gamesRepo, invitesRepo, gameStore };
}

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('create', () => {
    test.each([
        ['White', 0.1, { white_id: 'u', black_id: null }],
        ['black', 0.9, { white_id: null, black_id: 'u' }],
        ['random', 0.9, { white_id: 'u', black_id: null }],
        [undefined, 0.2, { white_id: null, black_id: 'u' }],
    ])('colour %p with roll %p seats the creator', async (color, roll, seats) => {
        const { svc, gamesRepo } = setup({ random: roll });
        await svc.createPrivateGame('u', '10', color, true);
        expect(gamesRepo.insertReturning.mock.calls[0][0]).toMatchObject({ ...seats, status: 'waiting' });
    });

    test('the games row is inserted WITHOUT a token; the invite goes to game_invites [INV-TOKEN]', async () => {
        const { svc, gamesRepo, invitesRepo } = setup();
        const before = Date.now();
        const game = await svc.createPrivateGame('u', '5+3', 'white', false);

        expect(gamesRepo.insertReturning.mock.calls[0][0]).toEqual({
            white_id: 'u',
            black_id: null,
            time_control: '5+3',
            status: 'waiting',
            is_rated: false,
        });
        const invite = invitesRepo.insert.mock.calls[0][0];
        expect(invite).toEqual({ game_id: 'g1', token: 'tok', expires_at: expect.any(String) });
        const hours = (new Date(invite.expires_at).getTime() - before) / 3600_000;
        expect(hours).toBeGreaterThan(47.9);
        expect(hours).toBeLessThan(48.1);
        // The caller (the socket service, the HTTP route) still gets the token back, in memory only.
        expect(game).toMatchObject({ id: 'g1', invite_token: 'tok', invite_expires_at: invite.expires_at });
    });

    test('rethrows the game insert error and stores no invite', async () => {
        const { svc, gamesRepo, invitesRepo } = setup();
        gamesRepo.insertReturning.mockReturnValue(result(null, { message: 'nope' }));
        await expect(svc.createPrivateGame('u', '10')).rejects.toEqual({ message: 'nope' });
        expect(invitesRepo.insert).not.toHaveBeenCalled();
    });

    test('if the invite cannot be stored, the orphan game is removed and the error rethrown', async () => {
        const { svc, gamesRepo, invitesRepo } = setup();
        invitesRepo.insert.mockReturnValue(result(null, { message: 'invite insert failed' }));
        await expect(svc.createPrivateGame('u', '10')).rejects.toEqual({ message: 'invite insert failed' });
        expect(gamesRepo.deleteById).toHaveBeenCalledWith('g1');
    });
});

describe('getGameByToken', () => {
    const row = { id: 'g1', white_id: 'host', black_id: null, status: 'waiting', time_control: '10' };

    test('token → invite → game (with players); the expiry rides along for the caller', async () => {
        const { svc, gamesRepo, invitesRepo } = setup({ row });
        expect(await svc.getGameByToken('tok')).toEqual({ ...row, invite_expires_at: FUTURE });
        expect(invitesRepo.findByToken).toHaveBeenCalledWith('tok');
        expect(gamesRepo.findByIdWithPlayers).toHaveBeenCalledWith('g1');
    });

    test.each([
        ['an unknown token', result(null)],
        ['a database error', result(null, { message: 'db' })],
        ['an invite that expired long ago', result({ game_id: 'g1', expires_at: '2000-01-01T00:00:00Z' })],
        ['an invite with no expiry (treated as expired, as before)', result({ game_id: 'g1', expires_at: null })],
    ])('%s → null, and the game is never read', async (_label, inviteResult) => {
        const { svc, gamesRepo, invitesRepo } = setup({ row });
        invitesRepo.findByToken.mockReturnValue(inviteResult);
        expect(await svc.getGameByToken('t')).toBeNull();
        expect(gamesRepo.findByIdWithPlayers).not.toHaveBeenCalled();
    });

    test('an invite that expired less than 5 minutes ago is still honoured (clock skew)', async () => {
        const justExpired = new Date(Date.now() - 4 * 60_000).toISOString();
        const { svc } = setup({ row, invite: { game_id: 'g1', expires_at: justExpired } });
        expect(await svc.getGameByToken('tok')).toMatchObject({ id: 'g1' });
    });

    test('a game lookup error or a missing game → null', async () => {
        const { svc, gamesRepo } = setup({ row });
        gamesRepo.findByIdWithPlayers.mockReturnValueOnce(result(null, { message: 'db' }));
        expect(await svc.getGameByToken('tok')).toBeNull();
        gamesRepo.findByIdWithPlayers.mockReturnValueOnce(result(null));
        expect(await svc.getGameByToken('tok')).toBeNull();
    });
});

describe('join', () => {
    test('seats the joiner in the empty colour and writes Redis state', async () => {
        const row = { id: 'g1', white_id: 'host', black_id: null, status: 'waiting', time_control: '3+2' };
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

    test('creator re-join returns the row untouched; errors are thrown', async () => {
        const row = { id: 'g1', white_id: 'host', black_id: null, status: 'waiting' };
        const { svc, gamesRepo, invitesRepo } = setup({ row });
        expect(await svc.joinPrivateGame('tok', 'host')).toMatchObject(row);
        expect(gamesRepo.startIfWaiting).not.toHaveBeenCalled();

        gamesRepo.findByIdWithPlayers.mockReturnValue(result({ ...row, status: 'active' }));
        await expect(svc.joinPrivateGame('tok', 'x')).rejects.toThrow('Game already started');
        invitesRepo.findByToken.mockReturnValue(result(null));
        await expect(svc.joinPrivateGame('tok', 'x')).rejects.toThrow('Invalid or expired token');
    });
});

describe('time control of a private game is canonical "M+S" [TIME-CONTROL, F9]', () => {
    test.each([
        ['10', '10+0'],
        ['5+3', '5+3'],
        [3, '3+0'],
        [undefined, '10+0'],
        // A lobby preset name used to be stored as the time control and played as 10 minutes.
        ['rapid', '10+0'],
        ['-5', '10+0'],
    ])('%p is stored as %p', async (given, stored) => {
        const { svc, gamesRepo } = setup();
        await svc.createPrivateGame('u', given, 'white', false);
        expect(gamesRepo.insertReturning.mock.calls[0][0].time_control).toBe(stored);
    });
});
