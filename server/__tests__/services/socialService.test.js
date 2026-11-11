/**
 * src/services/socialService.js with fake private games, emitter and pending
 * store. Rematch and challenge accepts only work against a stored request,
 * and use the stored terms [S4] (NODE-10, NODE-11).
 */
const { createSocialService } = require('../../src/services/socialService');
const { fakeEmitter, result } = require('./fakes');

/** Map-backed PendingRequests port keyed like the Redis repository. */
function fakePending() {
    const store = new Map();
    const keyOf = ({ kind, requesterId, targetId }) => `${kind}:${requesterId}:${targetId}`;
    return {
        store,
        put: jest.fn(async ({ terms, ...key }) => {
            store.set(keyOf(key), terms);
        }),
        take: jest.fn(async (key) => {
            const terms = store.get(keyOf(key)) ?? null;
            store.delete(keyOf(key));
            return terms;
        }),
    };
}

function setup(random = 0.9) {
    const emitter = fakeEmitter();
    const privateGames = {
        createPrivateGame: jest.fn(async () => ({ id: 'g9', invite_token: 'tok' })),
        joinPrivateGame: jest.fn(async () => ({})),
    };
    const notificationsRepo = { insert: jest.fn(() => result()) };
    const pendingRequests = fakePending();
    const svc = createSocialService({
        privateGames,
        notificationsRepo,
        pendingRequests,
        emitter,
        random: () => random,
    });
    return { svc, emitter, privateGames, notificationsRepo, pendingRequests };
}

const request = { from_user_id: 'a', to_user_id: 'b', time_control: '5', is_rated: true, from_username: 'ay' };
/** What the accepter / decliner sends: who asked, and (set by the handler) who they are. */
const answer = { from_user_id: 'a', to_user_id: 'b' };

afterEach(() => jest.restoreAllMocks());

describe('rematch', () => {
    test('request is stored (requester → target, with its terms) and relayed to the target', async () => {
        const { svc, emitter, pendingRequests } = setup();
        expect(await svc.requestRematch(request)).toEqual({ ok: true });
        expect(pendingRequests.put).toHaveBeenCalledWith({
            kind: 'rematch',
            requesterId: 'a',
            targetId: 'b',
            terms: { time_control: '5', is_rated: true },
        });
        expect(emitter.sent).toEqual([{ room: 'user_b', event: 'rematch_request', args: [request] }]);
    });

    test('accept with a pending request: requester hosts with a random colour, both are told', async () => {
        const { svc, emitter, privateGames } = setup();
        await svc.requestRematch(request);
        expect(await svc.acceptRematch(answer)).toEqual({ ok: true });
        expect(privateGames.createPrivateGame).toHaveBeenCalledWith('a', '5', 'random', true);
        expect(privateGames.joinPrivateGame).toHaveBeenCalledWith('tok', 'b');
        expect(emitter.named('rematch_ready')).toEqual([
            { room: 'user_a', event: 'rematch_ready', args: [{ game_id: 'g9' }] },
            { room: 'user_b', event: 'rematch_ready', args: [{ game_id: 'g9' }] },
        ]);
    });

    test('accept WITHOUT a pending request creates nothing [S4]', async () => {
        const { svc, emitter, privateGames } = setup();
        expect(await svc.acceptRematch(answer)).toEqual({ ok: false, error: 'no_pending_request' });
        expect(privateGames.createPrivateGame).not.toHaveBeenCalled();
        expect(emitter.sent).toEqual([]);
    });

    test('only the user the request was sent to can accept it [S4]', async () => {
        const { svc, privateGames } = setup();
        await svc.requestRematch(request); // a → b
        expect(await svc.acceptRematch({ from_user_id: 'a', to_user_id: 'mallory' })).toEqual({
            ok: false,
            error: 'no_pending_request',
        });
        // The requester cannot accept their own request either.
        expect(await svc.acceptRematch({ from_user_id: 'b', to_user_id: 'a' })).toEqual({
            ok: false,
            error: 'no_pending_request',
        });
        expect(privateGames.createPrivateGame).not.toHaveBeenCalled();
    });

    test('the game uses the STORED terms, not the ones in the accept payload [S4]', async () => {
        const { svc, privateGames } = setup();
        await svc.requestRematch({ ...request, time_control: '10', is_rated: false });
        await svc.acceptRematch({ ...answer, time_control: '1', is_rated: true });
        expect(privateGames.createPrivateGame).toHaveBeenCalledWith('a', '10', 'random', false);
    });

    test('a request can be accepted only once', async () => {
        const { svc, privateGames } = setup();
        await svc.requestRematch(request);
        await svc.acceptRematch(answer);
        expect(await svc.acceptRematch(answer)).toEqual({ ok: false, error: 'no_pending_request' });
        expect(privateGames.createPrivateGame).toHaveBeenCalledTimes(1);
    });

    test('decline tells the requester (not the decliner) and removes the request', async () => {
        const { svc, emitter, pendingRequests } = setup();
        await svc.requestRematch(request);
        emitter.sent.length = 0;
        expect(await svc.declineRematch(answer)).toEqual({ ok: true });
        expect(emitter.sent).toEqual([{ room: 'user_a', event: 'rematch_declined', args: [] }]);
        expect(pendingRequests.store.size).toBe(0);
        expect(await svc.acceptRematch(answer)).toEqual({ ok: false, error: 'no_pending_request' });
    });

    test('decline without a pending request notifies nobody [S4]', async () => {
        const { svc, emitter } = setup();
        expect(await svc.declineRematch(answer)).toEqual({ ok: false, error: 'no_pending_request' });
        expect(emitter.sent).toEqual([]);
    });

    test('a request to yourself is refused', async () => {
        const { svc, emitter, pendingRequests } = setup();
        expect(await svc.requestRematch({ ...request, to_user_id: 'a' })).toEqual({
            ok: false,
            error: 'invalid_target',
        });
        expect(pendingRequests.put).not.toHaveBeenCalled();
        expect(emitter.sent).toEqual([]);
    });
});

describe('challenge', () => {
    const challenge = { ...request, color: 'white' };

    test('request is stored with its colour, relayed, and saved as a notification', async () => {
        const { svc, emitter, notificationsRepo, pendingRequests } = setup();
        expect(await svc.requestChallenge(challenge)).toEqual({ ok: true });
        expect(pendingRequests.put).toHaveBeenCalledWith({
            kind: 'challenge',
            requesterId: 'a',
            targetId: 'b',
            terms: { time_control: '5', is_rated: true, color: 'white' },
        });
        expect(emitter.sent).toEqual([{ room: 'user_b', event: 'challenge_request', args: [challenge] }]);
        expect(notificationsRepo.insert).toHaveBeenCalledWith({
            user_id: 'b',
            type: 'challenge',
            payload: { from_user_id: 'a', from_username: 'ay', time_control: '5', is_rated: true, color: 'white' },
            read: false,
            created_at: expect.any(String),
        });
    });

    test.each([
        // [challenger's colour, roll, host (white), joiner (black)]
        ['white', 0.1, 'a', 'b'],
        ['black', 0.9, 'b', 'a'],
        ['random', 0.9, 'a', 'b'],
        ['random', 0.1, 'b', 'a'],
        [undefined, 0.9, 'a', 'b'], // no colour given → random
    ])('accept: stored challenger colour %p (roll %p) → white %p, black %p', async (color, roll, host, joiner) => {
        const { svc, privateGames, emitter } = setup(roll);
        await svc.requestChallenge({ ...request, color });
        // The accepter claims the opposite colour; it is ignored.
        await svc.acceptChallenge({ ...answer, color: 'black', time_control: '1', is_rated: false });
        expect(privateGames.createPrivateGame).toHaveBeenCalledWith(host, '5', 'white', true);
        expect(privateGames.joinPrivateGame).toHaveBeenCalledWith('tok', joiner);
        expect(emitter.named('challenge_ready')).toHaveLength(2);
    });

    test('accept without a pending challenge creates nothing [S4]', async () => {
        const { svc, privateGames, emitter } = setup();
        expect(await svc.acceptChallenge(answer)).toEqual({ ok: false, error: 'no_pending_request' });
        expect(privateGames.createPrivateGame).not.toHaveBeenCalled();
        expect(emitter.sent).toEqual([]);
    });

    test('a rematch request cannot be answered as a challenge (kinds are separate)', async () => {
        const { svc, privateGames } = setup();
        await svc.requestRematch(request);
        expect(await svc.acceptChallenge(answer)).toEqual({ ok: false, error: 'no_pending_request' });
        expect(privateGames.createPrivateGame).not.toHaveBeenCalled();
    });

    test('decline tells the challenger who declined and removes the request', async () => {
        const { svc, emitter } = setup();
        await svc.requestChallenge(challenge);
        emitter.sent.length = 0;
        expect(await svc.declineChallenge({ ...answer, by_username: 'bee' })).toEqual({ ok: true });
        expect(emitter.sent).toEqual([{ room: 'user_a', event: 'challenge_declined', args: [{ by: 'bee' }] }]);
        expect(await svc.acceptChallenge(answer)).toEqual({ ok: false, error: 'no_pending_request' });
    });

    test('decline without a pending challenge notifies nobody [S4]', async () => {
        const { svc, emitter } = setup();
        expect(await svc.declineChallenge({ ...answer, by_username: 'bee' })).toEqual({
            ok: false,
            error: 'no_pending_request',
        });
        expect(emitter.sent).toEqual([]);
    });
});

describe('failures', () => {
    test('a failing pending store rejects (the socket wrapper acks internal_error); nothing is created', async () => {
        const { svc, pendingRequests, privateGames } = setup();
        pendingRequests.take.mockRejectedValue(new Error('redis down'));
        await expect(svc.acceptRematch(answer)).rejects.toThrow('redis down');
        expect(privateGames.createPrivateGame).not.toHaveBeenCalled();
    });

    test('a request that cannot be stored is not relayed', async () => {
        const { svc, pendingRequests, emitter } = setup();
        pendingRequests.put.mockRejectedValue(new Error('redis down'));
        await expect(svc.requestRematch(request)).rejects.toThrow('redis down');
        expect(emitter.sent).toEqual([]);
    });

    test('game creation failure propagates and the request stays consumed', async () => {
        const { svc, privateGames, emitter } = setup();
        await svc.requestRematch(request);
        emitter.sent.length = 0;
        privateGames.createPrivateGame.mockRejectedValue(new Error('db'));
        await expect(svc.acceptRematch(answer)).rejects.toThrow('db');
        expect(emitter.sent).toEqual([]);
    });
});

test('announceGameStart emits game_start to the game room', () => {
    const { svc, emitter } = setup();
    svc.announceGameStart({ id: 'g1', status: 'active' });
    expect(emitter.sent).toEqual([{ room: 'game_g1', event: 'game_start', args: [{ id: 'g1', status: 'active' }] }]);
});
