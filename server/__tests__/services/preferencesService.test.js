/**
 * SETTINGS-PREFS (ADR F-140): the preferences the game server enforces. Privacy checks fail
 * closed; notifications are sent only when the player's switch is known to be on.
 */
const {
    DEFAULT_PREFERENCES,
    preferencesOf,
    challengeRefusal,
    isDailyTimeControl,
} = require('../../src/domain/preferences');
const { createPreferencesService, UNAVAILABLE } = require('../../src/services/preferencesService');
const { createSocialService } = require('../../src/services/socialService');
const { createGameService } = require('../../src/services/gameService');
const { createMoveRecorder } = require('../../src/services/moveRecorder');
const { applyResultEffects } = require('../../src/services/gameResultEffects');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** Preferences service over fake tables: `rows` by user id, `friends` as "a|b" pairs. */
function prefsSetup({ rows = {}, friends = [], readError = null, friendsError = null, insertError = null } = {}) {
    const preferencesRepo = {
        findByUserIds: jest.fn(async (ids) =>
            readError
                ? { data: null, error: readError }
                : { data: ids.filter((id) => rows[id]).map((id) => ({ user_id: id, ...rows[id] })), error: null },
        ),
    };
    const friendshipsRepo = {
        findAcceptedBetween: jest.fn(async (a, b) =>
            friendsError
                ? { data: null, error: friendsError }
                : { data: friends.includes(`${a}|${b}`) || friends.includes(`${b}|${a}`) ? [{ id: 'f' }] : [], error: null },
        ),
    };
    const notificationsRepo = { insert: jest.fn(async () => ({ data: null, error: insertError })) };
    const svc = createPreferencesService({ preferencesRepo, friendshipsRepo, notificationsRepo });
    return { svc, preferencesRepo, friendshipsRepo, notificationsRepo };
}

describe('domain/preferences', () => {
    test('no row or a malformed row reads as the defaults (the table\'s column defaults)', () => {
        expect(preferencesOf(null)).toEqual(DEFAULT_PREFERENCES);
        expect(preferencesOf({ challenge_policy: 'strangers', allow_spectators: 'no' })).toEqual(DEFAULT_PREFERENCES);
        expect(preferencesOf({ challenge_policy: 'nobody', notify_your_turn: false })).toMatchObject({
            challenge_policy: 'nobody',
            notify_your_turn: false,
            allow_spectators: true,
        });
    });

    test.each([
        ['everyone', false, null],
        ['friends', true, null],
        ['friends', false, 'friends_only'],
        ['nobody', true, 'challenges_closed'],
    ])('challengeRefusal(%p, friends=%p) → %p', (policy, friends, expected) => {
        expect(challengeRefusal(policy, friends)).toBe(expected);
    });

    test.each([
        ['1440', true],
        ['1440+0', true],
        ['30', false],
        ['3+2', false],
    ])('isDailyTimeControl(%p) → %p', (tc, expected) => {
        expect(isDailyTimeControl(tc)).toBe(expected);
    });
});

describe('challengeRefusal', () => {
    test('everyone (no row): allowed; friendships are not even read', async () => {
        const { svc, friendshipsRepo } = prefsSetup();
        expect(await svc.challengeRefusal('a', 'b')).toBeNull();
        expect(friendshipsRepo.findAcceptedBetween).not.toHaveBeenCalled();
    });

    test('nobody: refused', async () => {
        const { svc } = prefsSetup({ rows: { b: { challenge_policy: 'nobody' } } });
        expect(await svc.challengeRefusal('a', 'b')).toBe('challenges_closed');
    });

    test('friends: a friend (either direction) may, anyone else may not', async () => {
        const { svc } = prefsSetup({ rows: { b: { challenge_policy: 'friends' } }, friends: ['b|a'] });
        expect(await svc.challengeRefusal('a', 'b')).toBeNull();
        expect(await svc.challengeRefusal('c', 'b')).toBe('friends_only');
    });

    test('fail closed: preferences or friendships unreadable → refused', async () => {
        expect(await prefsSetup({ readError: { message: 'down' } }).svc.challengeRefusal('a', 'b')).toBe(UNAVAILABLE);
        const friendsDown = prefsSetup({ rows: { b: { challenge_policy: 'friends' } }, friendsError: { message: 'down' } });
        expect(await friendsDown.svc.challengeRefusal('a', 'b')).toBe(UNAVAILABLE);
    });
});

describe('spectatingAllowed', () => {
    test('true only when both players allow it; a read error is false', async () => {
        expect(await prefsSetup().svc.spectatingAllowed(['w', 'b'])).toBe(true);
        expect(await prefsSetup({ rows: { b: { allow_spectators: false } } }).svc.spectatingAllowed(['w', 'b'])).toBe(false);
        expect(await prefsSetup({ readError: { message: 'x' } }).svc.spectatingAllowed(['w', 'b'])).toBe(false);
    });
});

describe('notify', () => {
    const n = { userId: 'b', column: 'notify_game_results', type: 'game_result', payload: { message: 'You won' } };

    test('switch on (default): one unread row with a timestamp', async () => {
        const { svc, notificationsRepo } = prefsSetup();
        expect(await svc.notify(n)).toBe(true);
        expect(notificationsRepo.insert).toHaveBeenCalledWith({
            user_id: 'b',
            type: 'game_result',
            payload: { message: 'You won' },
            read: false,
            created_at: expect.any(String),
        });
    });

    test('switch off, unreadable preference or failed insert: false, never throws', async () => {
        const off = prefsSetup({ rows: { b: { notify_game_results: false } } });
        expect(await off.svc.notify(n)).toBe(false);
        expect(off.notificationsRepo.insert).not.toHaveBeenCalled();
        const down = prefsSetup({ readError: { message: 'x' } });
        expect(await down.svc.notify(n)).toBe(false);
        expect(down.notificationsRepo.insert).not.toHaveBeenCalled();
        expect(await prefsSetup({ insertError: { message: 'x' } }).svc.notify(n)).toBe(false);
    });
});

describe('challenges honour "Who can challenge me" and "Challenges"', () => {
    function social(prefs) {
        const emitter = fakeEmitter();
        const pendingRequests = { put: jest.fn(async () => {}), take: jest.fn(async () => null) };
        const svc = createSocialService({
            privateGames: { createPrivateGame: jest.fn(), joinPrivateGame: jest.fn() },
            notificationsRepo: prefs.notificationsRepo,
            pendingRequests,
            emitter,
            preferences: prefs.svc,
        });
        return { svc, emitter, pendingRequests };
    }
    const challenge = { from_user_id: 'a', to_user_id: 'b', from_username: 'ay', time_control: '5', is_rated: true };

    test.each([
        [{ challenge_policy: 'nobody' }, 'challenges_closed'],
        [{ challenge_policy: 'friends' }, 'friends_only'],
    ])('refused (%p): not stored, not relayed, no notification', async (row, error) => {
        const prefs = prefsSetup({ rows: { b: row } });
        const { svc, emitter, pendingRequests } = social(prefs);
        expect(await svc.requestChallenge(challenge)).toEqual({ ok: false, error });
        expect(pendingRequests.put).not.toHaveBeenCalled();
        expect(emitter.sent).toEqual([]);
        expect(prefs.notificationsRepo.insert).not.toHaveBeenCalled();
    });

    test('"Challenges" off: the challenge is relayed (it can still be accepted) but no bell row is stored', async () => {
        const prefs = prefsSetup({ rows: { b: { notify_challenges: false } } });
        const { svc, emitter } = social(prefs);
        expect(await svc.requestChallenge(challenge)).toEqual({ ok: true });
        expect(emitter.named('challenge_request')).toHaveLength(1);
        expect(prefs.notificationsRepo.insert).not.toHaveBeenCalled();
    });
});

describe('spectators honour "Allow spectators"', () => {
    function game(prefs, games) {
        const deps = {
            gameStore: fakeGameStore(games),
            gamesRepo: { findForRestore: jest.fn(() => result(null)), updateById: jest.fn(() => result()) },
            movesRepo: { insert: jest.fn(() => result()) },
            ratingService: { processGameEnd: jest.fn(async () => null) },
            reviewService: { triggerGameReview: jest.fn() },
            sessions: createSessionRegistry(),
            emitter: fakeEmitter(),
            preferences: prefs.svc,
        };
        return createGameService(deps);
    }

    test('a stranger is refused an active game: no room, no state', async () => {
        const svc = game(prefsSetup({ rows: { 'black-user': { allow_spectators: false } } }), { g: makeGame({ id: 'g' }) });
        const client = fakeClient('s');
        expect(await svc.joinGame('g', client, 'stranger')).toEqual({ ok: false, error: 'spectating_off' });
        expect(await svc.spectate('g', client)).toEqual({ ok: false, error: 'spectating_off' });
        expect(client.joined).toEqual([]);
        expect(client.emitted).toEqual([]);
    });

    test('the players themselves always join; a finished game is public', async () => {
        const prefs = prefsSetup({ rows: { 'black-user': { allow_spectators: false } } });
        const svc = game(prefs, { g: makeGame({ id: 'g' }), done: makeGame({ id: 'done', status: 'completed', result: 'white' }) });
        const player = fakeClient('p');
        await svc.joinGame('g', player, 'black-user');
        expect(player.joined).toContain('game_g');
        const viewer = fakeClient('v');
        await svc.joinGame('done', viewer, 'stranger');
        expect(viewer.joined).toEqual(['game_done']);
    });

    test('fail closed: the preferences cannot be read → refused', async () => {
        const svc = game(prefsSetup({ readError: { message: 'down' } }), { g: makeGame({ id: 'g' }) });
        const client = fakeClient('s');
        expect(await svc.joinGame('g', client, 'stranger')).toEqual({ ok: false, error: 'spectating_off' });
        expect(client.joined).toEqual([]);
    });
});

describe('"Game results" notifications', () => {
    const job = { gameId: 'g', outcome: 'white', whiteId: 'w', blackId: 'b', timeControl: '3', isRated: true, moveLog: [] };
    const deps = (prefs) => ({
        ratingService: { processGameEnd: jest.fn(async () => ({ white: { change: 8 }, black: { change: -8 } })) },
        reviewService: { triggerGameReview: jest.fn() },
        emitter: fakeEmitter(),
        preferences: prefs.svc,
    });

    test('one row per player with their result and rating change, each honouring their own switch', async () => {
        const prefs = prefsSetup({ rows: { b: { notify_game_results: false } } });
        await applyResultEffects(deps(prefs), job, { review: true });
        expect(prefs.notificationsRepo.insert).toHaveBeenCalledTimes(1);
        expect(prefs.notificationsRepo.insert.mock.calls[0][0]).toMatchObject({
            user_id: 'w',
            type: 'game_result',
            payload: { message: 'You won', result: 'win', game_id: 'g', time_control: '3', rating_change: 8 },
        });
    });

    test('a re-drive that did not finish the row, or an aborted game, notifies nobody', async () => {
        const prefs = prefsSetup();
        await applyResultEffects(deps(prefs), job, { review: false });
        await applyResultEffects(deps(prefs), { ...job, outcome: 'aborted' }, { review: true });
        expect(prefs.notificationsRepo.insert).not.toHaveBeenCalled();
    });

    test('a draw is a draw for both', async () => {
        const prefs = prefsSetup();
        await applyResultEffects(deps(prefs), { ...job, outcome: 'draw' }, { review: true });
        expect(prefs.notificationsRepo.insert.mock.calls.map((c) => c[0].payload.message)).toEqual(['Draw', 'Draw']);
    });
});

describe('"Your turn (daily games)" notifications', () => {
    function recorder(prefs, game) {
        const gameStore = fakeGameStore({ [game.id]: game });
        return createMoveRecorder({
            gameStore,
            gamesRepo: { updateById: jest.fn(() => result()) },
            movesRepo: { insert: jest.fn(() => result()) },
            emitter: fakeEmitter(),
            preferences: prefs.svc,
            now: () => 2_000_000,
        });
    }

    test('after a move in a daily game, the player to move is reminded', async () => {
        const prefs = prefsSetup();
        const r = recorder(prefs, makeGame({ id: 'g', timeControl: '1440' }));
        expect((await r.submit({ game_id: 'g', from: 'e2', to: 'e4' }, 'white-user')).accepted).toBe(true);
        await flush();
        expect(prefs.notificationsRepo.insert).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: 'black-user', type: 'your_turn', payload: expect.objectContaining({ message: 'Your move', game_id: 'g' }) }),
        );
    });

    test('no reminder in a non-daily game, or when the switch is off', async () => {
        const blitz = prefsSetup();
        await recorder(blitz, makeGame({ id: 'g', timeControl: '3' })).submit({ game_id: 'g', from: 'e2', to: 'e4' }, 'white-user');
        const off = prefsSetup({ rows: { 'black-user': { notify_your_turn: false } } });
        await recorder(off, makeGame({ id: 'g', timeControl: '1440' })).submit({ game_id: 'g', from: 'e2', to: 'e4' }, 'white-user');
        await flush();
        expect(blitz.notificationsRepo.insert).not.toHaveBeenCalled();
        expect(off.notificationsRepo.insert).not.toHaveBeenCalled();
    });
});
