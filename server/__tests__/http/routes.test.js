/**
 * The HTTP surface after PR 06/13: live routes are mounted, the endpoints
 * deleted as dead code (ADR 0104) are gone, and a non-Bearer header is still
 * rejected on a protected route.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());

const request = require('supertest');
const { serveOnLoopback, closeLoopbackServers } = require('../helpers/loopback');
const { supabase } = require('../../supabase');

let ctx;
/** The app served on 127.0.0.1 (helpers/loopback.js, ADR F-067) [FLAKY]. */
let loopback;
beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    ctx = require('../../server');
    loopback = await serveOnLoopback(ctx.app);
});
afterAll(async () => {
    await closeLoopbackServers();
    ctx.matchmaking.destroy();
    require('../../services/clock').stopGlobalClock();
    ctx.io.close();
    jest.restoreAllMocks();
});
beforeEach(() => supabase.reset());

test('server.js exports the composition root and does not listen when required', () => {
    expect(Object.keys(ctx).sort()).toEqual(['app', 'buildPgnFromMoveLog', 'io', 'matchmaking', 'readiness', 'server', 'start']);
    expect(ctx.server.listening).toBe(false);
});

test('a non-Bearer Authorization header is rejected on a protected route', async () => {
    const res = await request(loopback).post('/api/games/join/tok').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing Authorization header' });
    expect(supabase.calls).toHaveLength(0);
});

test.each([
    ['post', '/api/auth/register-profile'],
    ['post', '/api/games/private/create'],
    ['put', '/api/profile'],
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
])('deleted dead endpoint %s %s → 404', async (method, path) => {
    const res = await request(loopback)[method](path).set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(404);
    expect(supabase.calls).toHaveLength(0);
});
