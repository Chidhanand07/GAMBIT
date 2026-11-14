/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET as notifications } from '@/app/api/notifications/route'
import { PUT as markAllRead } from '@/app/api/notifications/read/route'
import { GET as leaderboard } from '@/app/api/leaderboard/route'
import { POST as maverickMove } from '@/app/api/maverick-move/route'
import { db, req, json, resetHarness, signInWithCookie } from '../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('notifications', () => {
    beforeEach(() => signInWithCookie('me'))

    test('lists my 30 latest notifications', async () => {
        db.queue('notifications', { data: [{ id: 'n1' }], error: null })
        expect((await json(await notifications())).body).toEqual([{ id: 'n1' }])
        expect(db.callsFor('notifications')[0].ops).toEqual(expect.arrayContaining([
            ['eq', 'user_id', 'me'], ['order', 'created_at', { ascending: false }], ['limit', 30],
        ]))
    })

    test('database error → 500 []', async () => {
        db.queue('notifications', { data: null, error: { message: 'x' } })
        expect(await json(await notifications())).toEqual({ status: 500, body: [] })
    })

    test('mark all read only touches my unread notifications', async () => {
        expect((await json(await markAllRead())).body).toEqual({ success: true })
        const call = db.callsFor('notifications')[0]
        expect(db.op(call, 'update')![0]).toEqual({ read: true })
        expect(call.ops).toEqual(expect.arrayContaining([['eq', 'user_id', 'me'], ['eq', 'read', false]]))
    })
})

describe('GET /api/leaderboard', () => {
    test('defaults to rapid, top 50', async () => {
        db.queue('profiles', { data: [{ username: 'a' }], error: null })
        expect((await json(await leaderboard(req('/api/leaderboard')))).body).toEqual([{ username: 'a' }])
        const call = db.callsFor('profiles')[0]
        expect(call.ops).toEqual(expect.arrayContaining([['order', 'rating_rapid', { ascending: false }], ['limit', 50]]))
    })

    test.each(['rating_bullet', 'rating_blitz', 'rating_classical'])('accepts field=%s', async (field) => {
        await leaderboard(req(`/api/leaderboard?field=${field}`))
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['order', field, { ascending: false }])
    })

    test.each(['password', 'id); drop table profiles;--', 'email'])('rejects field=%s without querying', async (field) => {
        const res = await leaderboard(req(`/api/leaderboard?field=${encodeURIComponent(field)}`))
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test('database error → empty list', async () => {
        db.queue('profiles', { data: null, error: { message: 'x' } })
        expect(await json(await leaderboard(req('/api/leaderboard')))).toEqual({ status: 200, body: [] })
    })
})

describe('POST /api/maverick-move', () => {
    const post = (body: unknown) => maverickMove(new Request('http://localhost/api/maverick-move', {
        method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    }))
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    test('400 for invalid JSON or a missing fen', async () => {
        expect((await post('{oops')).status).toBe(400)
        expect((await post({})).status).toBe(400)
    })

    test('proxies to the engine and returns its move', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ uci: 'e2e4', san: 'e4', difficulty: 'hard' }), { status: 200 })
        )
        expect((await json(await post({ fen, difficulty: 'hard' }))).body).toEqual({ uci: 'e2e4', san: 'e4', difficulty: 'hard' })
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('http://engine.test/computer-move')
        expect(JSON.parse(init.body as string)).toEqual({ fen, difficulty: 'hard' })
    })

    describe('engine key and URL [ENG-AUTH]', () => {
        const saved = { ...process.env }
        afterEach(() => {
            process.env = { ...saved }
        })
        const okEngine = () => jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

        test('sends the shared secret as X-Engine-Key', async () => {
            const fetchMock = okEngine()
            await post({ fen })
            const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
            expect(headers['X-Engine-Key']).toBe('test-engine-secret')
        })

        test.each([[undefined], ['']])('without ENGINE_SHARED_SECRET (%p) → 503 and the engine is not called', async (value) => {
            const fetchMock = okEngine()
            if (value === undefined) delete process.env.ENGINE_SHARED_SECRET
            else process.env.ENGINE_SHARED_SECRET = value
            expect(await json(await post({ fen }))).toEqual({ status: 503, body: { error: 'Engine not configured' } })
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('the secret never appears in a response, even when the engine is unreachable', async () => {
            jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
            const res = await post({ fen })
            expect(await res.text()).not.toContain('test-engine-secret')
        })

        test('GAMBIT_ENGINE_URL is the canonical name; ENGINE_URL still works as a fallback', async () => {
            const fetchMock = okEngine()
            process.env.GAMBIT_ENGINE_URL = 'http://canonical.test'
            process.env.ENGINE_URL = 'http://legacy.test'
            await post({ fen })
            delete process.env.GAMBIT_ENGINE_URL
            await post({ fen })
            expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
                'http://canonical.test/computer-move',
                'http://legacy.test/computer-move',
            ])
        })
    })

    test('an unknown difficulty becomes medium', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
        await post({ fen, difficulty: 'grandmaster' })
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).difficulty).toBe('medium')
    })

    test('engine 400 → 400; other engine errors → 502', async () => {
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('bad fen', { status: 400 }))
            .mockResolvedValueOnce(new Response('boom', { status: 500 }))
        expect(await json(await post({ fen }))).toEqual({ status: 400, body: { error: 'Engine error', detail: 'bad fen' } })
        expect((await post({ fen })).status).toBe(502)
    })

    test('engine 503 (busy) → 503 with the engine\'s Retry-After, not 502', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response('{"detail":"Engine busy"}', { status: 503, headers: { 'Retry-After': '3' } }),
        )
        const res = await post({ fen })
        expect(res.status).toBe(503)
        expect(res.headers.get('Retry-After')).toBe('3')
        expect((await res.json()).error).toBe('Engine busy')
    })

    test('engine 503 without a usable Retry-After → 503 without the header', async () => {
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': 'soon; x' } }))
        for (let i = 0; i < 2; i++) {
            const res = await post({ fen })
            expect(res.status).toBe(503)
            expect(res.headers.get('Retry-After')).toBeNull()
        }
    })

    test('engine unreachable → 502', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
        expect(await json(await post({ fen }))).toEqual({ status: 502, body: { error: 'Engine unreachable', detail: 'ECONNREFUSED' } })
    })
})

// /api/debug/session is deleted [S12]; __tests__/security/noDebugRoutes.test.ts keeps it that way.
