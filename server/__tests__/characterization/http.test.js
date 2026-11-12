/**
 * Characterization: the HTTP endpoints that have frontend/deploy callers, plus
 * CORS for Express and the Socket.IO handshake. Dead endpoints (register-profile,
 * private/create, PUT /api/profile, friends/*, notifications/*) are deliberately
 * not covered here (see ../http.test.js).
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const request = require('supertest');
const { supabase } = require('../../supabase');
const { getGame, setGame, getActiveGameIds } = require('../../lib/gameStore');
const { useServer, once, record, sleep, opsFor, compact, makeGame, ISO_DATE, START_FEN } = require('./harness');

const ctx = useServer();

// Clearly fake bearer token for the auth mock (not a real credential).
const AUTH = { Authorization: 'Bearer fake-test-token' };
const BY_TOKEN_SELECT = '*,white:profiles!white_id(username,avatar_url),black:profiles!black_id(username,avatar_url)';
const MINUTE_MS = 60 * 1000;

const inMinutes = (m) => new Date(Date.now() + m * MINUTE_MS).toISOString();

/** What a browser may see of a games row: no invite token, no expiry [S8]. */
function publicView({ invite_token: _token, invite_expires_at: _expires, ...rest }) {
    return rest;
}

function waitingGame(overrides = {}) {
    return {
        id: 'pg-1',
        white_id: 'alice',
        black_id: null,
        time_control: '5+2',
        status: 'waiting',
        invite_token: 'tok1234567',
        invite_expires_at: inMinutes(60),
        is_rated: true,
        white: { username: 'alice', avatar_url: null },
        black: null,
        ...overrides,
    };
}

const normalisedOps = (ops) => ops.map((op) => (op[0] === 'select' && op[1] ? ['select', compact(op[1])] : op));

describe('GET /api/health', () => {
    test('200 { status: "ok" } as JSON', async () => {
        const res = await request(ctx.app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(res.body).toEqual({ status: 'ok' });
    });
});

describe('GET /api/matchmaking/status', () => {
    test('reports the live queue size', async () => {
        expect((await request(ctx.app).get('/api/matchmaking/status')).body).toEqual({ players_searching: 0 });
        const s = await ctx.connect('p1');
        supabase.queue('profiles', { data: { id: 'p1', username: 'p1', rating_rapid: 1500, games_played: 9 }, error: null });
        s.emit('join_queue', { user: { id: 'p1' }, time_control: '10' });
        await once(s, 'queue_joined');
        const res = await request(ctx.app).get('/api/matchmaking/status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ players_searching: 1 });
    });
});

describe('GET /api/users/check-username', () => {
    test('queries profiles.username with .single(); no row → available', async () => {
        const res = await request(ctx.app).get('/api/users/check-username?u=newbie');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ available: true });
        expect(opsFor('profiles')).toEqual([[['select', 'username'], ['eq', 'username', 'newbie'], ['single']]]);
    });

    test('row found → { available: false }', async () => {
        supabase.queue('profiles', { data: { username: 'bob' }, error: null });
        expect((await request(ctx.app).get('/api/users/check-username?u=bob')).body).toEqual({ available: false });
    });

    test('a DB error result is reported as available (pinned)', async () => {
        supabase.queue('profiles', { data: null, error: { message: 'db down' } });
        const res = await request(ctx.app).get('/api/users/check-username?u=bob');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ available: true });
    });

    test('a thrown error → 500 { error: message }', async () => {
        supabase.queue('profiles', () => {
            throw new Error('client exploded');
        });
        const res = await request(ctx.app).get('/api/users/check-username?u=bob');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'client exploded' });
    });

    test.each(['/api/users/check-username', '/api/users/check-username?u='])('%s → 400 without touching the DB', async (path) => {
        const res = await request(ctx.app).get(path);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Missing username parameter' });
        expect(supabase.calls).toEqual([]);
    });
});

describe('POST /api/analysis/engine', () => {
    test('proxies { fen, depth } to ENGINE /analyze and returns the engine JSON', async () => {
        ctx.fetch.mockResolvedValue({ ok: true, json: async () => ({ best_move: 'e2e4', eval: 0.3 }) });
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN, depth: 12, ignored: true });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ best_move: 'e2e4', eval: 0.3 });
        expect(ctx.fetch.mock.calls).toEqual([
            [
                'http://localhost:8001/analyze',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fen: START_FEN, depth: 12 }),
                },
            ],
        ]);
    });

    test('depth 0 / missing → 18; ENGINE_URL is honoured', async () => {
        process.env.ENGINE_URL = 'http://engine.test:9000';
        ctx.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
        await request(ctx.app).post('/api/analysis/engine').send({ fen: 'F', depth: 0 });
        await request(ctx.app).post('/api/analysis/engine').send({});
        expect(ctx.fetch.mock.calls.map(([url, opts]) => [url, opts.body])).toEqual([
            ['http://engine.test:9000/analyze', JSON.stringify({ fen: 'F', depth: 18 })],
            ['http://engine.test:9000/analyze', JSON.stringify({ depth: 18 })],
        ]);
    });

    test('engine error status is NOT propagated: 200 with the engine body (pinned)', async () => {
        ctx.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'busy' }) });
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ detail: 'busy' });
    });

    test('unparseable engine body → 500 { error }', async () => {
        ctx.fetch.mockResolvedValue({
            ok: true,
            json: async () => {
                throw new SyntaxError('Unexpected token < in JSON');
            },
        });
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Unexpected token < in JSON' });
    });

    test('engine unreachable → 500 { error }', async () => {
        ctx.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: 'F' });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'ECONNREFUSED' });
    });

    test('malformed JSON request body → 400 from express.json (HTML error page)', async () => {
        const res = await request(ctx.app).post('/api/analysis/engine').set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(ctx.fetch).not.toHaveBeenCalled();
    });
});

describe('GET /api/games/join/:token', () => {
    test('returns the public view of the game (no invite_token / invite_expires_at); looks it up by invite_token [S8]', async () => {
        const row = waitingGame();
        supabase.queue('games', { data: row, error: null });
        const res = await request(ctx.app).get('/api/games/join/tok1234567');
        expect(res.status).toBe(200);
        // Was: the whole row, token and expiry included.
        expect(res.body).toEqual(publicView(row));
        expect(res.text).not.toContain('invite_token');
        expect(res.text).not.toContain('invite_expires_at');
        expect(opsFor('games').map(normalisedOps)).toEqual([
            [['select', BY_TOKEN_SELECT], ['eq', 'invite_token', 'tok1234567'], ['maybeSingle']],
        ]);
    });

    test('expired less than 5 minutes ago is still served (grace period)', async () => {
        supabase.queue('games', { data: waitingGame({ invite_expires_at: inMinutes(-4) }), error: null });
        expect((await request(ctx.app).get('/api/games/join/t')).status).toBe(200);
    });

    test.each([
        ['not found', { data: null, error: null }],
        ['expired > 5 min', { data: waitingGame({ invite_expires_at: inMinutes(-6) }), error: null }],
        ['null expiry (epoch)', { data: waitingGame({ invite_expires_at: null }), error: null }],
        ['DB error', { data: null, error: { message: 'boom' } }],
    ])('%s → 404 { error: "Not found or expired" }', async (_label, result) => {
        supabase.queue('games', result);
        const res = await request(ctx.app).get('/api/games/join/t');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Not found or expired' });
    });

    test('a thrown error → 400 { error }', async () => {
        supabase.queue('games', () => {
            throw new Error('kaput');
        });
        const res = await request(ctx.app).get('/api/games/join/t');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'kaput' });
    });

    test('a non-waiting game is still returned (status not checked on GET)', async () => {
        supabase.queue('games', { data: waitingGame({ status: 'completed' }), error: null });
        expect((await request(ctx.app).get('/api/games/join/t')).body).toMatchObject({ status: 'completed' });
    });
});

describe('POST /api/games/join/:token', () => {
    /** A socket that is already in room game_<id> (via join_game on a Redis game). */
    async function roomListener(gameId) {
        await setGame(gameId, makeGame({ id: gameId, whiteId: 'alice', blackId: 'someone' }));
        const s = await ctx.connect('alice');
        s.emit('join_game', gameId);
        await once(s, 'game_state_sync');
        return s;
    }

    test('joins as the missing colour, returns the updated row, emits game_start to game_<id>, seeds Redis', async () => {
        const host = await roomListener('pg-1');
        const outsider = await ctx.connect('carol');
        // After the sockets are connected: setUsers replaces the handshake token verifier too.
        supabase.setUsers({ 'fake-test-token': 'bob' });
        const outsiderGot = record(outsider, 'game_start');
        const row = waitingGame();
        const joined = { ...row, black_id: 'bob', status: 'active', started_at: '2026-01-01T00:00:00.000Z' };
        supabase.queue('games', { data: row, error: null }, { data: joined, error: null });

        const started = once(host, 'game_start');
        const res = await request(ctx.app).post('/api/games/join/tok1234567').set(AUTH);
        expect(res.status).toBe(200);
        // Response and game_start broadcast both carry the public view only [S8].
        expect(res.body).toEqual(publicView(joined));
        expect(res.text).not.toContain('tok1234567');
        expect(await started).toEqual(publicView(joined));
        await sleep(30);
        expect(outsiderGot).toEqual([]);

        expect(supabase.auth.getUser).toHaveBeenCalledWith('fake-test-token');
        expect(opsFor('games').map(normalisedOps)).toEqual([
            [['select', BY_TOKEN_SELECT], ['eq', 'invite_token', 'tok1234567'], ['maybeSingle']],
            [
                ['update', { white_id: 'alice', black_id: 'bob', status: 'active', started_at: ISO_DATE }],
                ['eq', 'id', 'pg-1'],
                ['eq', 'status', 'waiting'],
                ['select'],
                ['maybeSingle'],
            ],
        ]);
        expect(await getGame('pg-1')).toEqual({
            id: 'pg-1',
            fen: START_FEN,
            startFen: START_FEN,
            whiteId: 'alice',
            blackId: 'bob',
            whiteClockMs: 300000,
            blackClockMs: 300000,
            activeSide: 'w',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: '5+2',
            incrementMs: 2000,
            isRated: true,
            lastMoveAt: null,
            disconnectInfo: null,
        });
        expect(await getActiveGameIds()).toEqual(['pg-1']);
    });

    test('host waiting as black: joiner becomes white', async () => {
        supabase.setUsers({ 'fake-test-token': 'bob' });
        const row = waitingGame({ white_id: null, black_id: 'alice' });
        supabase.queue('games', { data: row, error: null }, { data: { ...row, white_id: 'bob' }, error: null });
        await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(supabase.op(supabase.callsFor('games')[1], 'update')[0]).toMatchObject({ white_id: 'bob', black_id: 'alice' });
    });

    test('the creator re-joining gets the waiting row back, with NO update — game_start still emitted (pinned)', async () => {
        const host = await roomListener('pg-1');
        supabase.setUsers({ 'fake-test-token': 'alice' });
        const row = waitingGame();
        supabase.queue('games', { data: row, error: null });
        const started = once(host, 'game_start');
        const res = await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(publicView(row));
        expect(await started).toEqual(publicView(row));
        expect(opsFor('games')).toHaveLength(1);
    });

    test.each([
        ['game not waiting', [{ data: waitingGame({ status: 'active' }), error: null }], 'Game already started'],
        ['update matched no row', [{ data: waitingGame(), error: null }, { data: null, error: null }], 'Game already started or not found'],
        ['update error', [{ data: waitingGame(), error: null }, { data: null, error: { message: 'rls denied' } }], 'rls denied'],
        ['unknown token', [{ data: null, error: null }], 'Invalid or expired token'],
    ])('%s → 400 { error: %p }', async (_label, results, message) => {
        supabase.setUsers({ 'fake-test-token': 'bob' });
        supabase.queue('games', ...results);
        const res = await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: message });
    });
});

describe('CORS (Express)', () => {
    test.each([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://gambit.vercel.app',
        'https://anyone-else.vercel.app', // any vercel.app subdomain, with credentials (pinned)
    ])('allows %s with credentials', async (origin) => {
        const res = await request(ctx.app).get('/api/health').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers.vary).toBe('Origin');
    });

    test('FRONTEND_URL is read per request', async () => {
        const origin = 'https://gambit.example.org';
        expect((await request(ctx.app).get('/api/health').set('Origin', origin)).status).toBe(500);
        process.env.FRONTEND_URL = origin;
        const res = await request(ctx.app).get('/api/health').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
    });

    test('no Origin header → allowed, no allow-origin header', async () => {
        const res = await request(ctx.app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    test('allowed preflight → 204 with the default method list', async () => {
        const res = await request(ctx.app)
            .options('/api/games/join/t')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'POST');
        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-methods']).toBe('GET,HEAD,PUT,PATCH,POST,DELETE');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    test.each(['https://evil.example.com', 'http://localhost:3001', 'https://vercel.app'])(
        'rejected origin %s → 500 HTML error page, route never runs (pinned)',
        async (origin) => {
            const res = await request(ctx.app).post('/api/analysis/engine').set('Origin', origin).send({ fen: 'F' });
            expect(res.status).toBe(500);
            expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
            expect(res.headers['access-control-allow-origin']).toBeUndefined();
            expect(res.text).toContain('Error: Not allowed by CORS');
            expect(ctx.fetch).not.toHaveBeenCalled();
        },
    );
});

describe('CORS (Socket.IO handshake)', () => {
    test('every origin is accepted with credentials (permissive fallback, pinned)', async () => {
        const res = await request(ctx.server)
            .get('/socket.io/?EIO=4&transport=polling')
            .set('Origin', 'https://evil.example.com');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('https://evil.example.com');
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.text).toMatch(/^0\{"sid":/);
    });
});
