/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET } from '@/app/api/games/live/route'
import { db, json, req, resetHarness, uid } from '../helpers/routeHarness'

const game = {
    id: uid('g1'),
    time_control: '10+0',
    fen: null,
    started_at: '2026-11-16T11:00:00Z',
    white: { username: 'alice', display_name: null, avatar_url: null, rating_rapid: 1500, sex: 'f' },
    black: { username: 'bob', display_name: 'Bob', avatar_url: 'https://x/y.png', rating_rapid: 1400 },
}

beforeEach(() => resetHarness())

describe('GET /api/games/live', () => {
    test('signed-out callers get 401 and nothing is read', async () => {
        expect((await GET(req('/api/games/live'))).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('lists public games as the allow-listed DTO, with the default limit of 10', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: [game], error: null })
        db.queue('game_invites', { data: [], error: null })
        const res = await json(await GET(req('/api/games/live')))
        expect(res.status).toBe(200)
        expect(res.body).toEqual([
            {
                id: uid('g1'),
                time_control: '10+0',
                category: 'rapid',
                move_number: 1,
                started_at: '2026-11-16T11:00:00Z',
                white: { username: 'alice', display_name: null, avatar_url: null, rating: 1500 },
                black: { username: 'bob', display_name: 'Bob', avatar_url: 'https://x/y.png', rating: 1400 },
            },
        ])
        expect(db.op(db.callsFor('games')[0], 'limit')).toEqual([20])
    })

    test('limit is capped at 20', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: [], error: null })
        await GET(req('/api/games/live?limit=500'))
        expect(db.op(db.callsFor('games')[0], 'limit')).toEqual([40])
    })

    test.each(['0', '-1', 'abc', '1.5'])('limit=%s is a 400 and nothing is read', async (limit) => {
        db.signIn(uid('me'))
        const res = await GET(req(`/api/games/live?limit=${limit}`))
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test('a database error is logged and answered with an empty list', async () => {
        db.signIn(uid('me'))
        const err = jest.spyOn(console, 'error').mockImplementation(() => {})
        db.queue('games', { data: null, error: { message: 'down' } })
        const res = await json(await GET(req('/api/games/live')))
        expect(res.body).toEqual([])
        expect(err).toHaveBeenCalled()
        err.mockRestore()
    })
})
