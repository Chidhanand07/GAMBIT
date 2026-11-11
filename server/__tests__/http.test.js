/**
 * server/server.js — HTTP API (auth, validation, response shapes, CORS).
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());

const request = require('supertest');
const { supabase } = require('../supabase');
const redis = require('../lib/redis');

let app, io, matchmaking, buildPgnFromMoveLog;
const AUTH = { Authorization: 'Bearer good-token' };

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    ({ app, io, matchmaking, buildPgnFromMoveLog } = require('../server'));
});
afterAll(() => {
    matchmaking.destroy();
    require('../services/clock').stopGlobalClock();
    io.close();
});

beforeEach(() => {
    supabase.reset();
    redis._reset();
    supabase.setUsers({ 'good-token': 'me' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

/** Every route that must reject callers without a valid bearer token. */
const PROTECTED = [
    ['post', '/api/auth/register-profile'],
    ['post', '/api/games/private/create'],
    ['put', '/api/profile'],
    ['post', '/api/games/join/tok'],
    ['get', '/api/friends/status/bob'],
    ['post', '/api/friends/request'],
    ['get', '/api/friends'],
    ['put', '/api/friends/f1/accept'],
    ['delete', '/api/friends/f1'],
    ['get', '/api/friends/requests/pending'],
    ['put', '/api/friends/f1/decline'],
    ['get', '/api/notifications'],
    ['put', '/api/notifications/read-all'],
    ['put', '/api/notifications/n1/read'],
];

describe('authentication', () => {
    test.each(PROTECTED)('%s %s → 401 without a token', async (method, path) => {
        const res = await request(app)[method](path).send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Authorization/);
        expect(supabase.calls).toHaveLength(0);
    });

    test.each(PROTECTED)('%s %s → 401 with an invalid token', async (method, path) => {
        const res = await request(app)[method](path).set('Authorization', 'Bearer forged').send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Invalid or expired/);
    });

    test('a non-Bearer Authorization header is rejected', async () => {
        const res = await request(app).get('/api/friends').set('Authorization', 'Basic abc');
        expect(res.status).toBe(401);
    });
});

describe('public endpoints', () => {
    test('GET /api/health', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });

    test('GET /api/matchmaking/status reports the queue size', async () => {
        matchmaking.queue.set('x', {});
        const res = await request(app).get('/api/matchmaking/status');
        matchmaking.queue.clear();
        expect(res.body).toEqual({ players_searching: 1 });
    });

    test('check-username: available, taken, and missing param', async () => {
        supabase.queue('profiles', { data: null, error: null }, { data: { username: 'bob' }, error: null });
        expect((await request(app).get('/api/users/check-username?u=new')).body).toEqual({ available: true });
        expect((await request(app).get('/api/users/check-username?u=bob')).body).toEqual({ available: false });
        expect((await request(app).get('/api/users/check-username')).status).toBe(400);
    });

    test('GET /api/games/join/:token returns the game or 404', async () => {
        const game = { id: 'g', invite_expires_at: new Date(Date.now() + 1e6).toISOString() };
        supabase.queue('games', { data: game, error: null }, { data: null, error: null });
        expect((await request(app).get('/api/games/join/tok')).body).toMatchObject({ id: 'g' });
        expect((await request(app).get('/api/games/join/bad')).status).toBe(404);
    });
});

describe('profiles', () => {
    test('register-profile creates a profile with starting ratings for the token\'s user', async () => {
        const res = await request(app).post('/api/auth/register-profile').set(AUTH).send({ username: 'me1', id: 'someone-else' });
        expect(res.body).toEqual({ success: true });
        const row = supabase.op(supabase.callsFor('profiles')[0], 'insert')[0][0];
        expect(row).toMatchObject({ id: 'me', username: 'me1', rating_rapid: 1200, rating_blitz: 1200, games_played: 0 });
    });

    test('register-profile requires a username and surfaces DB errors', async () => {
        expect((await request(app).post('/api/auth/register-profile').set(AUTH).send({})).status).toBe(400);
        supabase.queue('profiles', { data: null, error: { message: 'duplicate key' } });
        const res = await request(app).post('/api/auth/register-profile').set(AUTH).send({ username: 'x' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('duplicate key');
    });

    test('PUT /api/profile only updates the caller\'s own row with whitelisted fields', async () => {
        const res = await request(app).put('/api/profile').set(AUTH).send({
            displayName: 'Me', bio: 'hi', country: 'IN', sex: 'x', isPublic: true, rating_rapid: 3000,
        });
        expect(res.body).toEqual({ success: true });
        const call = supabase.callsFor('profiles')[0];
        expect(supabase.op(call, 'update')[0]).toEqual({ display_name: 'Me', bio: 'hi', country: 'IN', sex: 'x', is_public: true });
        expect(supabase.op(call, 'eq')).toEqual(['id', 'me']);
    });
});

describe('private games', () => {
    test('create returns the token, id and join url', async () => {
        supabase.queue('games', (call) => ({ data: { id: 'g1', ...supabase.op(call, 'insert')[0] }, error: null }));
        const res = await request(app).post('/api/games/private/create').set(AUTH).send({ timeControl: '10', color: 'white', isRated: true });
        expect(res.status).toBe(200);
        expect(res.body.game_id).toBe('g1');
        expect(res.body.url).toBe(`/join/${res.body.token}`);
    });

    test('join with a bad token returns 400 with the reason', async () => {
        supabase.queue('games', { data: null, error: null });
        const res = await request(app).post('/api/games/join/bad').set(AUTH);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid or expired token');
    });
});

describe('friends', () => {
    test('status: none / self / friends / pending_sent / pending_received', async () => {
        const get = () => request(app).get('/api/friends/status/bob').set(AUTH);

        supabase.queue('profiles', { data: null, error: null });
        expect((await get()).body).toEqual({ status: 'none' });

        supabase.queue('profiles', { data: { id: 'me' }, error: null });
        expect((await get()).body).toEqual({ status: 'self' });

        const cases = [
            [{ status: 'accepted', requester_id: 'me' }, 'friends'],
            [{ status: 'pending', requester_id: 'me' }, 'pending_sent'],
            [{ status: 'pending', requester_id: 'bob-id' }, 'pending_received'],
            [{ status: 'declined', requester_id: 'me' }, 'none'],
        ];
        for (const [row, expected] of cases) {
            supabase.queue('profiles', { data: { id: 'bob-id' }, error: null });
            supabase.queue('friendships', { data: row, error: null });
            expect((await get()).body).toEqual({ status: expected });
        }
    });

    test('request: validates, blocks self-friending, and notifies the addressee', async () => {
        expect((await request(app).post('/api/friends/request').set(AUTH).send({})).status).toBe(400);

        supabase.queue('profiles', { data: null, error: null });
        expect((await request(app).post('/api/friends/request').set(AUTH).send({ addressee_username: 'ghost' })).status).toBe(404);

        supabase.queue('profiles', { data: { id: 'me' }, error: null });
        expect((await request(app).post('/api/friends/request').set(AUTH).send({ addressee_username: 'me1' })).status).toBe(400);

        supabase.reset();
        supabase.setUsers({ 'good-token': 'me' });
        supabase.queue('profiles', { data: { id: 'bob-id' }, error: null }, { data: { username: 'me1' }, error: null });
        const ok = await request(app).post('/api/friends/request').set(AUTH).send({ addressee_username: 'bob' });
        expect(ok.body).toEqual({ success: true });
        expect(supabase.op(supabase.callsFor('friendships')[0], 'insert')[0]).toEqual({ requester_id: 'me', addressee_id: 'bob-id' });
        expect(supabase.op(supabase.callsFor('notifications')[0], 'insert')[0]).toMatchObject({
            user_id: 'bob-id', type: 'friend_request', read: false, payload: { from_user_id: 'me', from_username: 'me1' },
        });
    });

    test('list returns each friend once, from either side of the friendship', async () => {
        supabase.queue('friendships', {
            data: [
                { id: 'f1', requester_id: 'me', addressee_id: 'a', requester: { username: 'me1' }, addressee: { username: 'alice' } },
                { id: 'f2', requester_id: 'b', addressee_id: 'me', requester: { username: 'bob' }, addressee: { username: 'me1' } },
                { id: 'f3', requester_id: 'a', addressee_id: 'me', requester: { username: 'alice' }, addressee: { username: 'me1' } },
                { id: 'f4', requester_id: 'me', addressee_id: 'gone', requester: { username: 'me1' }, addressee: null },
            ],
            error: null,
        });
        const res = await request(app).get('/api/friends').set(AUTH);
        expect(res.body).toEqual([
            { username: 'alice', friendship_id: 'f1' },
            { username: 'bob', friendship_id: 'f2' },
        ]);
    });

    test('accept/decline only touch requests addressed to the caller', async () => {
        await request(app).put('/api/friends/f1/accept').set(AUTH);
        await request(app).put('/api/friends/f2/decline').set(AUTH);
        const [accept, decline] = supabase.callsFor('friendships');
        expect(supabase.op(accept, 'update')[0]).toEqual({ status: 'accepted' });
        expect(accept.ops).toContainEqual(['eq', 'addressee_id', 'me']);
        expect(supabase.op(decline, 'update')[0]).toEqual({ status: 'declined' });
        expect(decline.ops).toContainEqual(['eq', 'addressee_id', 'me']);
    });

    test('delete is scoped to friendships the caller is part of', async () => {
        await request(app).delete('/api/friends/f1').set(AUTH);
        expect(supabase.callsFor('friendships')[0].ops).toContainEqual(['or', 'requester_id.eq.me,addressee_id.eq.me']);
    });

    test('pending requests: returns [] when there are none and 500 on DB error', async () => {
        expect((await request(app).get('/api/friends/requests/pending').set(AUTH)).body).toEqual([]);
        supabase.queue('friendships', { data: null, error: { message: 'x' } });
        expect((await request(app).get('/api/friends/requests/pending').set(AUTH)).status).toBe(500);
    });
});

describe('notifications', () => {
    test('list is the caller\'s latest 30', async () => {
        supabase.queue('notifications', { data: [{ id: 'n1' }], error: null });
        const res = await request(app).get('/api/notifications').set(AUTH);
        expect(res.body).toEqual([{ id: 'n1' }]);
        const call = supabase.callsFor('notifications')[0];
        expect(call.ops).toEqual(expect.arrayContaining([['eq', 'user_id', 'me'], ['limit', 30]]));
    });

    test('mark one / mark all read are scoped to the caller', async () => {
        await request(app).put('/api/notifications/n1/read').set(AUTH);
        await request(app).put('/api/notifications/read-all').set(AUTH);
        for (const call of supabase.callsFor('notifications')) {
            expect(supabase.op(call, 'update')[0]).toEqual({ read: true });
            expect(call.ops).toContainEqual(['eq', 'user_id', 'me']);
        }
    });
});

describe('engine proxy', () => {
    test('forwards the position to the engine with default depth 18', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ best_move: 'e2e4' }) });
        const res = await request(app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.body).toEqual({ best_move: 'e2e4' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fen: 'F', depth: 18 });
    });

    test('engine down → 500', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
        const res = await request(app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.status).toBe(500);
    });
});

describe('CORS', () => {
    test.each([
        'http://localhost:3000',
        'https://gambit-xyz.vercel.app',
    ])('allows %s', async (origin) => {
        const res = await request(app).get('/api/health').set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
    });

    test('rejects unknown origins', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('buildPgnFromMoveLog', () => {
    test('numbers moves and adds headers', () => {
        const pgn = buildPgnFromMoveLog([{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }]);
        expect(pgn).toBe('[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n1. e4 e5 2. Nf3 *');
    });

    test('returns null for an empty or SAN-less move log', () => {
        expect(buildPgnFromMoveLog([])).toBeNull();
        expect(buildPgnFromMoveLog(undefined)).toBeNull();
        expect(buildPgnFromMoveLog([{ move: 'e2e4' }])).toBeNull();
    });
});
