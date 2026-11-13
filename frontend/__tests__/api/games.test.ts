/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET as getGame, PATCH as patchGame } from '@/app/api/games/[id]/route'
import { GET as activeGame } from '@/app/api/games/active/route'
import { POST as createPrivate } from '@/app/api/games/private/create/route'
import { db, req, json, resetHarness, signInWithCookie, uid } from '../helpers/routeHarness'

const NOW = new Date('2026-01-01T12:00:00Z').getTime()

beforeEach(() => {
    resetHarness()
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
})
afterEach(() => jest.useRealTimers())

describe('GET /api/games/[id]', () => {
    const game = { id: uid('g1'), white_id: uid('w'), black_id: uid('b'), status: 'active' }

    test.each([
        ['w', 'white'],
        ['b', 'black'],
        ['someone-else', 'spectator'],
    ])('caller %s sees myColor=%s', async (userId, color) => {
        db.signIn(uid(userId))
        db.queue('games', { data: game, error: null })
        const res = await json(await getGame(req(`/api/games/${uid('g1')}`), { params: Promise.resolve({ id: uid('g1') }) }))
        expect(res.body).toMatchObject({ id: uid('g1'), myColor: color })
    })

    test('signed-out callers get 401 and the game is not read (was: the whole row, as a spectator) [S5][S8]', async () => {
        db.queue('games', { data: game, error: null })
        expect((await getGame(req(`/api/games/${uid('g1')}`), { params: Promise.resolve({ id: uid('g1') }) })).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('a signed-in non-player is a spectator', async () => {
        signInWithCookie(uid('someone-else'))
        db.queue('games', { data: game, error: null })
        expect((await json(await getGame(req(`/api/games/${uid('g1')}`), { params: Promise.resolve({ id: uid('g1') }) }))).body.myColor).toBe('spectator')
    })

    test('unknown game → 404', async () => {
        signInWithCookie(uid('me'))
        db.queue('games', { data: null, error: { message: 'not found' } })
        expect((await getGame(req(`/api/games/${uid('x')}`), { params: Promise.resolve({ id: uid('x') }) })).status).toBe(404)
    })
})

describe('game responses never carry the invite token [S8]', () => {
    const row = {
        id: uid('g1'),
        white_id: uid('w'),
        black_id: uid('b'),
        status: 'active',
        fen: 'fen',
        invite_token: 'SECRETTOKN',
        invite_expires_at: '2026-01-01T00:00:00Z',
        white: { id: uid('w'), username: 'alice', sex: 'f' },
        black: null,
    }

    test.each([
        ['a player', 'w'],
        ['a spectator', 'someone-else'],
    ])('GET as %s: minimal DTO, no invite_token / invite_expires_at', async (_label, who) => {
        db.signIn(uid(who))
        db.queue('games', { data: row, error: null })
        const res = await getGame(req(`/api/games/${uid('g1')}`), { params: Promise.resolve({ id: uid('g1') }) })
        const text = await res.text()
        expect(text).not.toContain('SECRETTOKN')
        const body = JSON.parse(text)
        expect(body).not.toHaveProperty('invite_token')
        expect(body).not.toHaveProperty('invite_expires_at')
        expect(body).toMatchObject({ id: uid('g1'), fen: 'fen', white: { id: uid('w'), username: 'alice' }, black: null })
        expect(body.white).not.toHaveProperty('sex')
    })

    test('PATCH: the updated row is returned as the same DTO', async () => {
        db.signIn(uid('w'))
        db.queue('games', { data: { white_id: uid('w'), black_id: uid('b') }, error: null }, { data: { ...row, draw_offer: true }, error: null })
        const res = await patchGame(req(`/api/games/${uid('g1')}`, { method: 'PATCH', body: { draw_offer: true } }), {
            params: Promise.resolve({ id: uid('g1') }),
        })
        expect(res.status).toBe(200)
        expect(await res.text()).not.toContain('SECRETTOKN')
    })
})

describe('PATCH /api/games/[id]', () => {
    const patch = (body: unknown, id = uid('g1')) => patchGame(req(`/api/games/${id}`, { method: 'PATCH', body }), { params: Promise.resolve({ id }) })

    test('401 when signed out', async () => {
        expect((await patch({ draw_offer: true })).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('404 for an unknown game', async () => {
        db.signIn(uid('w'))
        expect((await patch({ draw_offer: true })).status).toBe(404)
    })

    test('403 for a user who is not playing in the game', async () => {
        db.signIn(uid('stranger'))
        db.queue('games', { data: { white_id: uid('w'), black_id: uid('b') }, error: null })
        expect((await patch({ draw_offer: true })).status).toBe(403)
        expect(db.callsFor('games').filter(c => db.op(c, 'update'))).toEqual([])
    })

    test('players can only write whitelisted fields; status/winner tampering is dropped', async () => {
        db.signIn(uid('w'))
        db.queue('games', { data: { white_id: uid('w'), black_id: uid('b') }, error: null }, { data: { id: uid('g1'), draw_offer: true }, error: null })
        const res = await json(await patch({ draw_offer: true, status: 'completed', winner_id: uid('w') }))
        expect(res.status).toBe(200)
        expect(db.op(db.callsFor('games')[1], 'update')![0]).toEqual({ draw_offer: true })
    })

    test('a body with only forbidden fields → 400', async () => {
        db.signIn(uid('b'))
        db.queue('games', { data: { white_id: uid('w'), black_id: uid('b') }, error: null })
        expect(await json(await patch({ winner_id: uid('b') }))).toEqual({ status: 400, body: { error: 'No writable fields' } })
    })
})

describe('GET /api/games/active', () => {
    test('returns my most recent active game', async () => {
        signInWithCookie(uid('me'))
        const row = { id: uid('g1'), started_at: new Date(NOW - 60000).toISOString(), clock_deadline: null, white_time_ms: null, black_time_ms: null }
        db.queue('games', { data: row, error: null })
        expect((await json(await activeGame())).body).toEqual(row)
        expect(db.callsFor('games')[0].ops).toEqual(expect.arrayContaining([
            ['or', `white_id.eq.${uid('me')},black_id.eq.${uid('me')}`], ['eq', 'status', 'active'], ['limit', 1],
        ]))
    })

    test('no active game → null', async () => {
        signInWithCookie(uid('me'))
        expect((await json(await activeGame())).body).toBeNull()
    })

    test('a game whose clock deadline passed >10 s ago is closed as abandoned', async () => {
        signInWithCookie(uid('me'))
        db.queue('games', { data: { id: uid('g1'), started_at: new Date(NOW).toISOString(), clock_deadline: new Date(NOW - 11000).toISOString() }, error: null })
        expect((await json(await activeGame())).body).toBeNull()
        const update = db.callsFor('games')[1]
        expect(db.op(update, 'update')![0]).toMatchObject({ status: 'completed', result: 'abandoned' })
        expect(update.ops).toContainEqual(['eq', 'status', 'active'])
    })

    test('a deadline within the 10 s grace keeps the game', async () => {
        signInWithCookie(uid('me'))
        db.queue('games', { data: { id: uid('g1'), started_at: new Date(NOW).toISOString(), clock_deadline: new Date(NOW - 5000).toISOString() }, error: null })
        expect((await json(await activeGame())).body).toMatchObject({ id: uid('g1') })
    })

    test('a game started >2 h ago with no moves is closed as abandoned', async () => {
        signInWithCookie(uid('me'))
        db.queue('games', { data: { id: uid('g1'), started_at: new Date(NOW - 3 * 3600_000).toISOString(), white_time_ms: null, black_time_ms: null }, error: null })
        expect((await json(await activeGame())).body).toBeNull()
        expect(db.op(db.callsFor('games')[1], 'update')![0]).toMatchObject({ result: 'abandoned' })
    })

    test('an old game that has moves is kept', async () => {
        signInWithCookie(uid('me'))
        db.queue('games', { data: { id: uid('g1'), started_at: new Date(NOW - 3 * 3600_000).toISOString(), white_time_ms: 1000, black_time_ms: null }, error: null })
        expect((await json(await activeGame())).body).toMatchObject({ id: uid('g1') })
    })
})

describe('POST /api/games/private/create', () => {
    const post = (body: unknown) => createPrivate(req('/api/games/private/create', { method: 'POST', body }))
    const echo = (call: any) => ({ data: { id: uid('g-new'), ...db.op(call, 'insert')![0] }, error: null })

    beforeEach(() => signInWithCookie(uid('me')))

    test('400 without a time control', async () => {
        expect((await post({})).status).toBe(400)
    })

    test.each([
        ['white', { white_id: uid('me'), black_id: null }],
        ['Black', { white_id: null, black_id: uid('me') }],
    ])('color %s seats me correctly', async (color, seats) => {
        db.queue('games', echo)
        await post({ timeControl: '10', color })
        expect(db.op(db.callsFor('games')[0], 'insert')![0]).toMatchObject(seats)
    })

    test('creates a waiting, unrated-by-default game with a 10-char token valid for 48 h', async () => {
        db.queue('games', echo)
        const res = await json(await post({ timeControl: '5+3', color: 'white' }))
        expect(res.body.game_id).toBe(uid('g-new'))
        expect(res.body.token).toMatch(/^[A-Za-z0-9]{10}$/)

        // INV-TOKEN: the games row (readable through the public API key) carries no token...
        const row = db.op(db.callsFor('games')[0], 'insert')![0]
        expect(row).toEqual({ white_id: expect.anything(), black_id: null, time_control: '5+3', status: 'waiting', is_rated: false })
        expect(row).not.toHaveProperty('invite_token')
        expect(row).not.toHaveProperty('invite_expires_at')

        // ...it is stored in game_invites, which only the service role can read.
        const invite = db.op(db.callsFor('game_invites')[0], 'insert')![0]
        expect(invite).toEqual({ game_id: uid('g-new'), token: res.body.token, expires_at: expect.any(String) })
        expect(new Date(invite.expires_at).getTime() - NOW).toBe(48 * 3600_000)
    })

    test('database error → 400', async () => {
        db.queue('games', { data: null, error: { message: 'insert failed' } })
        expect(await json(await post({ timeControl: '10' }))).toEqual({ status: 400, body: { error: 'insert failed' } })
        expect(db.callsFor('game_invites')).toEqual([])
    })

    test('if the invite cannot be stored the game is deleted again and no token is returned [INV-TOKEN]', async () => {
        db.queue('games', echo)
        db.queue('game_invites', { data: null, error: { message: 'invite insert failed' } })
        const res = await json(await post({ timeControl: '10' }))
        expect(res).toEqual({ status: 400, body: { error: 'invite insert failed' } })
        const cleanup = db.callsFor('games')[1]
        expect(cleanup.ops).toEqual([['delete'], ['eq', 'id', uid('g-new')]])
    })
})
