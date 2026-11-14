/** @jest-environment node */
/**
 * Input validation at the route boundary [S7] (NX-07, NODE-08): hostile route
 * params, query values and bodies are rejected before any query is built, and
 * nothing a caller sends can reach a PostgREST `.or()` filter string.
 */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { DELETE as unfriend, PUT as respond } from '@/app/api/friends/[id]/route'
import { POST as sendRequest } from '@/app/api/friends/request/route'
import { GET as listFriends } from '@/app/api/friends/route'
import { GET as friendStatus } from '@/app/api/friends/status/[username]/route'
import { GET as getGame, PATCH as patchGame } from '@/app/api/games/[id]/route'
import { POST as createPrivate } from '@/app/api/games/private/create/route'
import { GET as leaderboard } from '@/app/api/leaderboard/route'
import { POST as maverick } from '@/app/api/maverick-move/route'
import { GET as profileGames } from '@/app/api/profile/[username]/games/route'
import { GET as profile } from '@/app/api/profile/[username]/route'
import { GET as profileStats } from '@/app/api/profile/[username]/stats/route'
import { PATCH as patchMe } from '@/app/api/profile/me/route'
import { db, req, resetHarness, signInWithCookie, uid } from '../helpers/routeHarness'

const ME = uid('me')
/** What an attacker would put where an id belongs to widen a PostgREST `or` filter. */
const INJECTION = `${uid('victim')},status.eq.pending`

beforeEach(() => {
    resetHarness()
    signInWithCookie(ME)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

/** Every recorded `.or(...)` argument, across all queries of the test. */
const orFilters = () => db.calls.flatMap((c) => c.ops.filter((o) => o[0] === 'or').map((o) => o[1] as string))

describe('PostgREST filter injection', () => {
    test('GET /api/friends?userId=<injection> → 400, no query (was: interpolated into .or())', async () => {
        const res = await listFriends(req(`/api/friends?userId=${encodeURIComponent(INJECTION)}`))
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test.each([['me'], ['*'], ['x)'], ['']])('GET /api/friends?userId=%p is not a UUID → no filter is built', async (value) => {
        const res = await listFriends(req(`/api/friends?userId=${encodeURIComponent(value)}`))
        expect(res.status).toBe(400)
        expect(orFilters()).toEqual([])
    })

    test('GET /api/friends without userId lists the verified caller’s friends', async () => {
        await listFriends(req('/api/friends'))
        expect(orFilters()).toEqual([`requester_id.eq.${ME},addressee_id.eq.${ME}`])
    })

    test('every .or() filter the friends and games routes build contains only UUIDs', async () => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null }, { data: { id: uid('bob') }, error: null })
        await listFriends(req(`/api/friends?userId=${uid('other')}`))
        await friendStatus(req('/x'), { params: Promise.resolve({ username: 'bob' }) })
        await sendRequest(req('/x', { method: 'POST', body: { addressee_username: 'bob' } }))
        await unfriend(req('/x', { method: 'DELETE' }), { params: Promise.resolve({ id: uid('f1') }) })
        const filters = orFilters()
        expect(filters.length).toBeGreaterThanOrEqual(4)
        const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        for (const filter of filters) {
            expect(filter.replace(new RegExp(UUID, 'g'), '')).toMatch(/^[a-z_.,()]*$/)
        }
    })
})

describe('route params', () => {
    test.each([['f1'], [INJECTION], ['../etc'], ['']])('friends/[id] = %p → 400 and no write', async (id) => {
        expect((await respond(req('/x?action=accept', { method: 'PUT' }), { params: Promise.resolve({ id }) })).status).toBe(400)
        expect((await unfriend(req('/x', { method: 'DELETE' }), { params: Promise.resolve({ id }) })).status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test('friends/[id] with an unknown action → 400', async () => {
        const res = await respond(req('/x?action=block', { method: 'PUT' }), { params: Promise.resolve({ id: uid('f1') }) })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Invalid action' })
        expect(db.calls).toEqual([])
    })

    test.each([['g1'], [INJECTION], ['null']])('games/[id] = %p → 404 without querying', async (id) => {
        expect((await getGame(req('/x'), { params: Promise.resolve({ id }) })).status).toBe(404)
        expect((await patchGame(req('/x', { method: 'PATCH', body: { draw_offer: true } }), { params: Promise.resolve({ id }) })).status).toBe(404)
        expect(db.calls).toEqual([])
    })

    test.each([['a b'], ['bob,id.neq.x'], ['x'.repeat(41)], ['bob"']])('username %p → not found, no query', async (username) => {
        expect((await profile(req('/x'), { params: Promise.resolve({ username }) })).status).toBe(404)
        expect((await profileGames(req('/x'), { params: Promise.resolve({ username }) })).status).toBe(404)
        expect((await profileStats(req('/x'), { params: Promise.resolve({ username }) })).status).toBe(404)
        expect(await (await friendStatus(req('/x'), { params: Promise.resolve({ username }) })).json()).toEqual({ status: 'none' })
        expect(db.calls).toEqual([])
    })
})

describe('query parameters', () => {
    test.each([['rating_rapid; drop table profiles'], ['password'], ['id'], ['']])('leaderboard field %p → 400', async (field) => {
        const res = await leaderboard(req(`/api/leaderboard?field=${encodeURIComponent(field)}`))
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })
})

describe('request bodies', () => {
    const post = (handler: (r: never) => Promise<Response>, body: unknown) =>
        handler(req('/x', { method: 'POST', body: body as object }) as never)

    test.each([
        ['null', 'null'],
        ['an array', '[]'],
        ['malformed JSON', '{oops'],
        ['wrong types', { email: { $ne: null }, password: ['x'] }],
    ])('login with %s → 400 (was: a thrown error / 500 for null)', async (_label, body) => {
        expect((await post(login, body)).status).toBe(400)
        expect(db.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    test.each([['ab'], ['x'.repeat(21)], ['first.last'], ['<script>'], ['sp ace']])(
        'signup with username %p → 400 before any account is created',
        async (username) => {
            const res = await post(signup, { email: 'a@b.c', password: 'secret123', username })
            expect(res.status).toBe(400)
            expect(db.auth.admin.createUser).not.toHaveBeenCalled()
            expect(db.calls).toEqual([])
        },
    )

    test.each([
        ['no time control', {}],
        ['a negative clock', { timeControl: '-5' }],
        ['zero minutes', { timeControl: '0' }],
        ['an absurd clock', { timeControl: '9999' }],
        ['more than a day', { timeControl: '1441' }],
        ['an absurd increment', { timeControl: '10+181' }],
        ['an unknown preset name', { timeControl: 'hyperbullet' }],
        ['injected text', { timeControl: '10; drop' }],
        ['a number', { timeControl: 10 }],
        ['an unknown colour', { timeControl: '10', color: 'purple' }],
        ['a non-boolean rated flag', { timeControl: '10', isRated: 'yes' }],
    ])('private game with %s → 400 and no insert', async (_label, body) => {
        expect((await post(createPrivate, body)).status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test.each([
        ['a non-string bio', { bio: { $set: 'x' } }],
        ['an oversized bio', { bio: 'x'.repeat(501) }],
        ['an oversized display name', { displayName: 'x'.repeat(51) }],
        ['an array', []],
    ])('profile PATCH with %s → 400 and no update', async (_label, body) => {
        const res = await patchMe(req('/api/profile/me', { method: 'PATCH', body: body as object }))
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test('profile PATCH cannot set rating or stats columns (unknown keys are dropped)', async () => {
        db.queue('profiles', { data: { id: ME }, error: null })
        await patchMe(req('/api/profile/me', { method: 'PATCH', body: { bio: 'hi', rating_rapid: 3000, wins: 999 } }))
        // F18 (was: { display_name: null, bio: 'hi', country: null }): omitted fields are no longer nulled.
        expect(db.op(db.callsFor('profiles')[0], 'update')![0]).toEqual({ bio: 'hi' })
    })

    test.each([['add friend with a non-string name', { addressee_username: 42 }], ['add friend with nothing', {}]])(
        '%s → 400',
        async (_label, body) => {
            expect((await post(sendRequest, body)).status).toBe(400)
            expect(db.calls).toEqual([])
        },
    )

    test.each([
        ['no fen', {}],
        ['a non-string fen', { fen: 42 }],
        ['an oversized fen', { fen: 'x'.repeat(101) }],
    ])('maverick-move with %s → 400 and the engine is not called', async (_label, body) => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'))
        expect((await post(maverick, body)).status).toBe(400)
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
