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
const { useServer, once, record, sleep, opsFor, compact, makeGame, ISO_DATE, START_FEN, ENGINE_HEADERS } = require('./harness');

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

/** The `game_invites` lookup the server does first: token → { game_id, expires_at } [INV-TOKEN]. */
const INVITE_LOOKUP = (token) => [['select', 'game_id, expires_at'], ['eq', 'token', token], ['maybeSingle']];

/** Queue the invite row a token resolves to (default: game pg-1, valid for another hour). */
function queueInvite(expiresAt = inMinutes(60), gameId = 'pg-1') {
    supabase.queue('game_invites', { data: { game_id: gameId, expires_at: expiresAt }, error: null });
}

function waitingGame(overrides = {}) {
    return {
        id: 'pg-1',
        white_id: 'alice',
        black_id: null,
        time_control: '5+2',
        status: 'waiting',
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
    test('queries profiles.username with .maybeSingle(); no row → available', async () => {
        const res = await request(ctx.app).get('/api/users/check-username?u=newbie');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ available: true });
        // maybeSingle: "no row" is a normal answer, so every error result is a real failure.
        expect(opsFor('profiles')).toEqual([[['select', 'username'], ['eq', 'username', 'newbie'], ['maybeSingle']]]);
    });

    test('row found → { available: false }', async () => {
        supabase.queue('profiles', { data: { username: 'bob' }, error: null });
        expect((await request(ctx.app).get('/api/users/check-username?u=bob')).body).toEqual({ available: false });
    });

    test('a DB error is never reported as available: 503 with an error code [G14]', async () => {
        // Was: "a DB error result is reported as available (pinned)" — 200 { available: true }.
        supabase.queue('profiles', { data: null, error: { message: 'db down' } });
        const res = await request(ctx.app).get('/api/users/check-username?u=bob');
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: 'username_check_unavailable' });
        expect(res.body).not.toHaveProperty('available');
    });

    test('a thrown error → 503, and the internal message is not sent to the caller', async () => {
        supabase.queue('profiles', () => {
            throw new Error('client exploded');
        });
        const res = await request(ctx.app).get('/api/users/check-username?u=bob');
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: 'username_check_unavailable' });
        expect(JSON.stringify(res.body)).not.toContain('exploded');
    });

    test.each(['/api/users/check-username', '/api/users/check-username?u=', `/api/users/check-username?u=${'x'.repeat(65)}`])(
        '%s → 400 without touching the DB',
        async (path) => {
            const res = await request(ctx.app).get(path);
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'invalid_request' });
            expect(supabase.calls).toEqual([]);
        },
    );
});

describe('POST /api/analysis/engine', () => {
    test('proxies { fen, depth } to ENGINE /analyze and returns the engine JSON', async () => {
        ctx.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ best_move: 'e2e4', eval: 0.3 }) });
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN, depth: 12, ignored: true });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ best_move: 'e2e4', eval: 0.3 });
        expect(ctx.fetch.mock.calls).toEqual([
            [
                'http://localhost:8001/analyze',
                {
                    method: 'POST',
                    headers: ENGINE_HEADERS,
                    body: JSON.stringify({ fen: START_FEN, depth: 12 }),
                },
            ],
        ]);
    });

    test('missing depth → 18; ENGINE_URL is honoured', async () => {
        process.env.ENGINE_URL = 'http://engine.test:9000';
        ctx.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
        await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN });
        expect(ctx.fetch.mock.calls.map(([url, opts]) => [url, opts.body])).toEqual([
            ['http://engine.test:9000/analyze', JSON.stringify({ fen: START_FEN, depth: 18 })],
        ]);
    });

    test.each([
        ['no fen', {}],
        ['a non-string fen', { fen: { $ne: 1 } }],
        ['an oversized fen', { fen: 'x'.repeat(200) }],
        ['depth 0', { fen: START_FEN, depth: 0 }],
        ['an absurd depth', { fen: START_FEN, depth: 99 }],
        ['a fractional depth', { fen: START_FEN, depth: 12.5 }],
    ])('%s → 400 before the engine is called [G14]', async (_label, body) => {
        const res = await request(ctx.app).post('/api/analysis/engine').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_request' });
        expect(ctx.fetch).not.toHaveBeenCalled();
    });

    test('an engine error status is propagated, not returned as 200 [G14]', async () => {
        // Was: "engine error status is NOT propagated: 200 with the engine body (pinned)".
        ctx.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'busy' }) });
        const busy = await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN });
        expect(busy.status).toBe(503);
        expect(busy.body).toEqual({ error: 'engine_busy' });

        ctx.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ detail: 'Invalid FEN' }) });
        const rejected = await request(ctx.app).post('/api/analysis/engine').send({ fen: 'not a fen' });
        expect(rejected.status).toBe(400);
        expect(rejected.body).toEqual({ error: 'engine_rejected' });
    });

    test('unparseable engine body → 502, without the parser message', async () => {
        ctx.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError('Unexpected token < in JSON');
            },
        });
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN });
        expect(res.status).toBe(502);
        expect(res.body).toEqual({ error: 'engine_unavailable' });
    });

    test('engine unreachable → 502, without the socket error', async () => {
        ctx.fetch.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:8001'));
        const res = await request(ctx.app).post('/api/analysis/engine').send({ fen: START_FEN });
        expect(res.status).toBe(502);
        expect(res.body).toEqual({ error: 'engine_unavailable' });
        expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    });

    test('malformed JSON request body → 400 from express.json (HTML error page)', async () => {
        const res = await request(ctx.app).post('/api/analysis/engine').set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(ctx.fetch).not.toHaveBeenCalled();
    });
});

describe('GET /api/games/join/:token', () => {
    test('returns the public view of the game (no invite_token / invite_expires_at); token → game_invites → games by id [S8][INV-TOKEN]', async () => {
        const row = waitingGame();
        queueInvite();
        supabase.queue('games', { data: row, error: null });
        const res = await request(ctx.app).get('/api/games/join/tok1234567');
        expect(res.status).toBe(200);
        // Was: the whole row, token and expiry included.
        expect(res.body).toEqual(publicView(row));
        expect(res.text).not.toContain('invite_token');
        expect(res.text).not.toContain('invite_expires_at');
        // Was: games filtered by invite_token. The token is now only ever compared in game_invites.
        expect(opsFor('game_invites')).toEqual([INVITE_LOOKUP('tok1234567')]);
        expect(opsFor('games').map(normalisedOps)).toEqual([
            [['select', BY_TOKEN_SELECT], ['eq', 'id', 'pg-1'], ['maybeSingle']],
        ]);
    });

    test('expired less than 5 minutes ago is still served (grace period)', async () => {
        queueInvite(inMinutes(-4));
        supabase.queue('games', { data: waitingGame(), error: null });
        expect((await request(ctx.app).get('/api/games/join/t')).status).toBe(200);
    });

    test.each([
        ['not found', () => ({ data: null, error: null })],
        ['expired > 5 min', () => ({ data: { game_id: 'pg-1', expires_at: inMinutes(-6) }, error: null })],
        ['DB error', () => ({ data: null, error: { message: 'boom' } })],
    ])('%s → 404 { error: "Not found or expired" }, and the game is never read', async (_label, invite) => {
        supabase.queue('game_invites', invite());
        supabase.queue('games', { data: waitingGame(), error: null });
        const res = await request(ctx.app).get('/api/games/join/t');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Not found or expired' });
        expect(opsFor('games')).toEqual([]);
    });

    test('an invite without an expiry is served: null means "does not expire" [G15]', async () => {
        // Was listed above as "null expiry (epoch)" → 404.
        supabase.queue('game_invites', { data: { game_id: 'pg-1', expires_at: null }, error: null });
        supabase.queue('games', { data: waitingGame(), error: null });
        expect((await request(ctx.app).get('/api/games/join/t')).status).toBe(200);
    });

    test.each(['active', 'completed', 'aborted'])('the invite page of a game that is %s → 404: only waiting games are invites [G15]', async (status) => {
        queueInvite();
        supabase.queue('games', { data: waitingGame({ status, black_id: 'bob' }), error: null });
        const res = await request(ctx.app).get('/api/games/join/t');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Not found or expired' });
    });

    test('the invite exists but its game does not (or cannot be read) → 404', async () => {
        queueInvite();
        supabase.queue('games', { data: null, error: null });
        expect((await request(ctx.app).get('/api/games/join/t')).status).toBe(404);
        queueInvite();
        supabase.queue('games', { data: null, error: { message: 'boom' } });
        expect((await request(ctx.app).get('/api/games/join/t')).status).toBe(404);
    });

    test('a thrown error → 400 { error }', async () => {
        supabase.queue('game_invites', () => {
            throw new Error('kaput');
        });
        const res = await request(ctx.app).get('/api/games/join/t');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'kaput' });
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
        queueInvite();
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
        expect(opsFor('game_invites')).toEqual([INVITE_LOOKUP('tok1234567')]);
        expect(opsFor('games').map(normalisedOps)).toEqual([
            [['select', BY_TOKEN_SELECT], ['eq', 'id', 'pg-1'], ['maybeSingle']],
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
            startedAt: expect.any(Number),
        });
        expect(await getActiveGameIds()).toEqual(['pg-1']);
    });

    test('host waiting as black: joiner becomes white', async () => {
        supabase.setUsers({ 'fake-test-token': 'bob' });
        const row = waitingGame({ white_id: null, black_id: 'alice' });
        queueInvite();
        supabase.queue('games', { data: row, error: null }, { data: { ...row, white_id: 'bob' }, error: null });
        await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(supabase.op(supabase.callsFor('games')[1], 'update')[0]).toMatchObject({ white_id: 'bob', black_id: 'alice' });
    });

    test('the creator re-joining gets the waiting row back, with NO update and NO game_start [G15]', async () => {
        // Was: "game_start still emitted (pinned)" — the creator was sent into a game with no opponent.
        const host = await roomListener('pg-1');
        supabase.setUsers({ 'fake-test-token': 'alice' });
        const row = waitingGame();
        queueInvite();
        supabase.queue('games', { data: row, error: null });
        const starts = record(host, 'game_start');
        const res = await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(publicView(row));
        await sleep(60);
        expect(starts).toEqual([]);
        expect(opsFor('games')).toHaveLength(1);
    });

    test.each([
        ['game not waiting', [{ data: waitingGame({ status: 'active' }), error: null }], 'Game already started'],
        ['update matched no row', [{ data: waitingGame(), error: null }, { data: null, error: null }], 'Game already started or not found'],
        ['update error', [{ data: waitingGame(), error: null }, { data: null, error: { message: 'rls denied' } }], 'rls denied'],
        ['unknown token', [{ data: null, error: null }], 'Invalid or expired token'],
    ])('%s → 400 { error: %p }', async (_label, results, message) => {
        supabase.setUsers({ 'fake-test-token': 'bob' });
        if (message !== 'Invalid or expired token') queueInvite();
        supabase.queue('games', ...results);
        const res = await request(ctx.app).post('/api/games/join/t').set(AUTH);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: message });
    });
});

describe('CORS (Express) [S13]', () => {
    // The harness runs with NODE_ENV=test and no CORS_ORIGINS: the local development origins apply.
    test.each(['http://localhost:3000', 'http://127.0.0.1:3000'])('allows %s with credentials', async (origin) => {
        const res = await request(ctx.app).get('/api/health').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers.vary).toBe('Origin');
    });

    test('CORS_ORIGINS lists the allowed origins exactly (read per request)', async () => {
        const origin = 'https://gambit.example.org';
        expect((await request(ctx.app).get('/api/health').set('Origin', origin)).status).toBe(403);
        process.env.CORS_ORIGINS = `${origin}, https://www.gambit.example.org`;
        const res = await request(ctx.app).get('/api/health').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        delete process.env.CORS_ORIGINS;
    });

    test('FRONTEND_URL still works as a one-origin fallback when CORS_ORIGINS is not set', async () => {
        const origin = 'https://legacy.example.org';
        process.env.FRONTEND_URL = origin;
        expect((await request(ctx.app).get('/api/health').set('Origin', origin)).status).toBe(200);
        delete process.env.FRONTEND_URL;
    });

    test('no Origin header → allowed, no allow-origin header', async () => {
        const res = await request(ctx.app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
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

    test.each([
        'https://evil.example.com',
        'http://localhost:3001',
        'https://vercel.app',
        // Was allowed with credentials (pinned): any *.vercel.app subdomain.
        'https://gambit.vercel.app',
        'https://anyone-else.vercel.app',
    ])('rejected origin %s → 403 JSON, no stack trace, route never runs', async (origin) => {
        // Was: 500 HTML error page with "Error: Not allowed by CORS" and a stack trace (pinned).
        const res = await request(ctx.app).post('/api/analysis/engine').set('Origin', origin).send({ fen: START_FEN });
        expect(res.status).toBe(403);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.body).toEqual({ error: 'origin_not_allowed' });
        expect(res.text).not.toMatch(/at \w+ \(|node_modules|Error:/);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(ctx.fetch).not.toHaveBeenCalled();
    });
});

describe('CORS (Socket.IO handshake) [S13]', () => {
    test('an origin that is not on the list is refused by allowRequest', async () => {
        // Was: "every origin is accepted with credentials (permissive fallback, pinned)".
        const res = await request(ctx.server)
            .get('/socket.io/?EIO=4&transport=polling')
            .set('Origin', 'https://evil.example.com');
        expect(res.status).toBe(403);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.text).not.toMatch(/"sid"/);
    });

    test('an allowed origin gets the handshake with credentials', async () => {
        const res = await request(ctx.server)
            .get('/socket.io/?EIO=4&transport=polling')
            .set('Origin', 'http://localhost:3000');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.text).toMatch(/^0\{"sid":/);
    });

    test('a client without an Origin header (a native client, the tests) connects', async () => {
        const res = await request(ctx.server).get('/socket.io/?EIO=4&transport=polling');
        expect(res.status).toBe(200);
    });
});
