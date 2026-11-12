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
    // The engine client refuses to call the engine without its shared secret (ENG-AUTH).
    process.env.ENGINE_SHARED_SECRET = 'test-engine-secret';
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
    ['post', '/api/games/join/tok'],
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
        const game = { id: 'g' };
        // INV-TOKEN: the token resolves through game_invites; an unknown token finds no invite.
        supabase.queue('game_invites', { data: { game_id: 'g', expires_at: new Date(Date.now() + 1e6).toISOString() }, error: null });
        supabase.queue('games', { data: game, error: null });
        expect((await request(app).get('/api/games/join/tok')).body).toMatchObject({ id: 'g' });
        expect((await request(app).get('/api/games/join/bad')).status).toBe(404);
    });
});

describe('private games', () => {
    test('join with a bad token returns 400 with the reason', async () => {
        supabase.queue('games', { data: null, error: null });
        const res = await request(app).post('/api/games/join/bad').set(AUTH);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid or expired token');
    });
});

describe('engine proxy', () => {
    test('forwards the position to the engine with default depth 18', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ best_move: 'e2e4' }) });
        const res = await request(app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.body).toEqual({ best_move: 'e2e4' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fen: 'F', depth: 18 });
    });

    test('engine down → 502 (an upstream failure, not this server crashing) [G14]', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
        const res = await request(app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.status).toBe(502);
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
