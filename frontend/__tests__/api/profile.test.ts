/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET as getMe, PATCH as patchMe } from '@/app/api/profile/me/route'
import { GET as getProfile } from '@/app/api/profile/[username]/route'
import { GET as getStats } from '@/app/api/profile/[username]/stats/route'
import { GET as getGames } from '@/app/api/profile/[username]/games/route'
import { db, req, json, resetHarness, signInWithCookie, supabaseJsMock, supabaseSsrMock, uid } from '../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/profile/me', () => {
    beforeEach(() => signInWithCookie(uid('me')))

    test('returns my profile', async () => {
        db.queue('profiles', { data: { id: uid('me'), username: 'me1' }, error: null })
        expect(await json(await getMe())).toEqual({ status: 200, body: { id: uid('me'), username: 'me1' } })
    })

    test('database error → 500', async () => {
        db.queue('profiles', { data: null, error: { message: 'down' } })
        expect((await getMe()).status).toBe(500)
    })

    test('missing profile is auto-created from the email, with a free username', async () => {
        db.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: 'Jane.Doe+chess@mail.com' } }, error: null } as any)
        db.queue('profiles',
            { data: null, error: null },                 // no profile yet
            { data: { id: uid('taken') }, error: null },      // "Jane_Doe_chess" taken
            { data: null, error: null },                 // "Jane_Doe_chess1" free
            (call) => ({ data: db.op(call, 'insert')![0], error: null }),
        )
        const res = await json(await getMe())
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ id: uid('me'), username: 'Jane_Doe_chess1', rating_rapid: 1200, games_played: 0 })
    })

    test('auto-create failure → 404', async () => {
        db.queue('profiles', { data: null, error: null }, { data: null, error: null }, { data: null, error: { message: 'x' } })
        expect((await getMe()).status).toBe(404)
    })
})

describe('PATCH /api/profile/me', () => {
    const patch = (body: unknown) => patchMe(req('/api/profile/me', { method: 'PATCH', body }))

    test('updates only my display fields, never ratings or ownership', async () => {
        signInWithCookie(uid('me'))
        db.queue('profiles', { data: { id: uid('me') }, error: null })
        await patch({ displayName: 'Me', bio: 'hi', country: 'IN', avatarUrl: 'a.png', rating_rapid: 3000, id: uid('other') })
        const call = db.callsFor('profiles')[0]
        expect(db.op(call, 'update')![0]).toEqual({ display_name: 'Me', bio: 'hi', country: 'IN', avatar_url: 'a.png' })
        expect(call.ops).toContainEqual(['eq', 'id', uid('me')])
    })

    // F18 (was: 'omitted avatarUrl is left unchanged; other omitted fields are cleared' →
    // { display_name: null, bio: 'only bio', country: null }).
    test('omitted fields are left unchanged; only the sent ones are written', async () => {
        signInWithCookie(uid('me'))
        await patch({ bio: 'only bio' })
        expect(db.op(db.callsFor('profiles')[0], 'update')![0]).toEqual({ bio: 'only bio' })
    })

    test('F18: an avatar-only PATCH (the settings upload) does not wipe name, bio or country', async () => {
        signInWithCookie(uid('me'))
        await patch({ avatarUrl: 'https://x.supabase.co/a.png' })
        expect(db.op(db.callsFor('profiles')[0], 'update')![0]).toEqual({ avatar_url: 'https://x.supabase.co/a.png' })
    })

    test('F18: an explicit null still clears a field', async () => {
        signInWithCookie(uid('me'))
        await patch({ displayName: null, country: 'IN' })
        expect(db.op(db.callsFor('profiles')[0], 'update')![0]).toEqual({ display_name: null, country: 'IN' })
    })

    test('F18: a PATCH with no profile field is a 400 and writes nothing', async () => {
        signInWithCookie(uid('me'))
        expect((await patch({ rating_rapid: 3000 })).status).toBe(400)
        expect(db.callsFor('profiles')).toHaveLength(0)
    })

    // S8-PRIV: the write runs as the signed-in user (RLS + column grants), so service_role
    // can lose UPDATE on profiles.
    test('S8-PRIV: the update goes through the session client, never the service-role key', async () => {
        signInWithCookie(uid('me'))
        supabaseJsMock.createClient.mockClear()
        supabaseSsrMock.createServerClient.mockClear()
        db.queue('profiles', { data: { id: uid('me') }, error: null })
        expect((await patch({ bio: 'hi' })).status).toBe(200)
        expect(supabaseJsMock.createClient).not.toHaveBeenCalled()
        expect(supabaseSsrMock.createServerClient).toHaveBeenCalled()
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['eq', 'id', uid('me')])
    })

    test('database error → 500', async () => {
        signInWithCookie(uid('me'))
        db.queue('profiles', { data: null, error: { message: 'x' } })
        expect((await patch({ bio: 'x' })).status).toBe(500)
    })
})

describe('GET /api/profile/[username]', () => {
    // Profile pages are behind the login wall; so are the routes that feed them [S5].
    beforeEach(() => signInWithCookie(uid('viewer')))

    test('returns the profile', async () => {
        db.queue('profiles', { data: { username: 'bob' }, error: null })
        expect((await json(await getProfile(req('/x'), { params: Promise.resolve({ username: 'bob' }) }))).body).toEqual({ username: 'bob' })
    })

    test('returns only public columns of another user (no sex, is_public, Glicko internals) [S8]', async () => {
        db.queue('profiles', {
            data: { username: 'bob', rating_rapid: 1500, wins: 3, sex: 'm', is_public: true, rating_rd: 80, rating_vol: 0.06 },
            error: null,
        })
        const { body } = await json(await getProfile(req('/x'), { params: Promise.resolve({ username: 'bob' }) }))
        expect(body).toEqual({ username: 'bob', rating_rapid: 1500, wins: 3 })
    })

    test('404 when unknown, 500 on database error, 400 without a username', async () => {
        expect((await getProfile(req('/x'), { params: Promise.resolve({ username: 'ghost' }) })).status).toBe(404)
        db.queue('profiles', { data: null, error: { message: 'x' } })
        expect((await getProfile(req('/x'), { params: Promise.resolve({ username: 'bob' }) })).status).toBe(500)
        expect((await getProfile(req('/x'), { params: Promise.resolve({ username: '' }) })).status).toBe(400)
    })
})

describe('GET /api/profile/[username]/stats', () => {
    // Profile pages are behind the login wall; so are the routes that feed them [S5].
    beforeEach(() => signInWithCookie(uid('viewer')))

    test('totals, ratings with 1200 defaults, and per-category W/L/D', async () => {
        db.queue('profiles', { data: { id: uid('p'), games_played: 5, wins: 2, losses: 2, draws: 1, rating_blitz: 1500 }, error: null })
        db.queue('games', {
            data: [
                { time_control: '1', winner_id: uid('p') },
                { time_control: '3+2', winner_id: uid('x') },
                { time_control: '10', result: 'draw' },
                { time_control: '15+10', winner_id: uid('p') },
                { time_control: null, winner_id: uid('x') },
                { time_control: '90', winner_id: uid('p') },
            ],
            error: null,
        })
        const { body } = await json(await getStats(req('/x'), { params: Promise.resolve({ username: 'bob' }) }))
        expect(body).toMatchObject({
            total: 5, wins: 2, losses: 2, draws: 1,
            ratings: { bullet: 1200, blitz: 1500, rapid: 1200, classical: 1200 },
            byCategory: {
                bullet: { played: 1, wins: 1, losses: 0, draws: 0 },
                blitz: { played: 1, wins: 0, losses: 1, draws: 0 },
                rapid: { played: 3, wins: 1, losses: 1, draws: 1 },
                classical: { played: 1, wins: 1, losses: 0, draws: 0 },
            },
        })
    })

    test('F12: an aborted game is not counted, and a game nobody won is a draw, not a loss', async () => {
        db.queue('profiles', { data: { id: uid('p'), games_played: 0, wins: 0, losses: 0, draws: 0 }, error: null })
        db.queue('games', {
            data: [
                { time_control: '10', status: 'aborted', result: null, winner_id: null },
                { time_control: '10', status: 'completed', result: 'aborted', winner_id: null },
                { time_control: '10', status: 'completed', result: null, winner_id: null },
            ],
            error: null,
        })
        const { body } = await json(await getStats(req('/x'), { params: Promise.resolve({ username: 'bob' }) }))
        expect(body.byCategory.rapid).toEqual({ played: 1, wins: 0, losses: 0, draws: 1 })
    })

    test('404 for an unknown user', async () => {
        expect((await getStats(req('/x'), { params: Promise.resolve({ username: 'ghost' }) })).status).toBe(404)
    })

    test.todo('stats count 16–60 min games as "classical" but the server rates them as "rapid" — pick one cutoff and share it')
})

describe('GET /api/profile/[username]/games', () => {
    // Profile pages are behind the login wall; so are the routes that feed them [S5].
    beforeEach(() => signInWithCookie(uid('viewer')))

    test('pages through completed games, newest first', async () => {
        db.queue('profiles', { data: { id: uid('p') }, error: null })
        db.queue('games', { data: [{ id: uid('g') }], error: null })
        const res = await json(await getGames(req('/x?limit=10&offset=20'), { params: Promise.resolve({ username: 'bob' }) }))
        expect(res.body).toEqual({ games: [{ id: uid('g') }], profileId: uid('p') })
        expect(db.callsFor('games')[0].ops).toEqual(expect.arrayContaining([
            ['or', `white_id.eq.${uid('p')},black_id.eq.${uid('p')}`], ['range', 20, 29], ['order', 'created_at', { ascending: false }],
        ]))
    })

    test('limit is capped at 50 and defaults to 15', async () => {
        db.queue('profiles', { data: { id: uid('p') }, error: null }, { data: { id: uid('p') }, error: null })
        await getGames(req('/x?limit=500'), { params: Promise.resolve({ username: 'bob' }) })
        await getGames(req('/x'), { params: Promise.resolve({ username: 'bob' }) })
        const [big, dflt] = db.callsFor('games')
        expect(db.op(big, 'range')).toEqual([0, 49])
        expect(db.op(dflt, 'range')).toEqual([0, 14])
    })

    test('404 for an unknown user, 500 on database error', async () => {
        expect((await getGames(req('/x'), { params: Promise.resolve({ username: 'ghost' }) })).status).toBe(404)
        db.queue('profiles', { data: { id: uid('p') }, error: null })
        db.queue('games', { data: null, error: { message: 'x' } })
        expect((await getGames(req('/x'), { params: Promise.resolve({ username: 'bob' }) })).status).toBe(500)
    })

    test.each([
        ['limit=abc', '?limit=abc'],
        ['offset=NaN', '?offset=NaN'],
        ['a negative offset', '?offset=-1'],
        ['limit=0', '?limit=0'],
        ['a fractional limit', '?limit=1.5'],
        ['an exponent', '?offset=1e9'],
    ])('%s → 400 and no query (was: NaN reached the range) [S7]', async (_label, query) => {
        const res = await getGames(req(`/x${query}`), { params: Promise.resolve({ username: 'bob' }) })
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })
})
