/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET } from '@/app/api/games/[id]/analysis/route'
import { movetext, toPlies } from '@/lib/server/gameAnalysis'
import { db, json, req, resetHarness, uid } from '../helpers/routeHarness'

const GAME = uid('g1')
const call = (id = GAME) => GET(req(`/api/games/${id}/analysis`), { params: Promise.resolve({ id }) })

const reviewed = {
    id: GAME,
    status: 'completed',
    white_id: uid('alice'),
    black_id: uid('bob'),
    white_accuracy: 87.3,
    black_accuracy: 64.1,
    white_move_classifications: [
        { ply: 0, move: 'e2e4', san: 'e4', classification: 'Book', accuracy: 100, best_move: 'e2e4', eval_white: 0.3 },
        { ply: 2, move: 'g1f3', san: 'Nf3', classification: 'Best', accuracy: 98, best_move: 'g1f3', eval_white: 0.4 },
    ],
    black_move_classifications: [
        { ply: 1, move: 'e7e5', san: 'e5', classification: 'Book', accuracy: 100, best_move: 'e7e5', eval_white: 0.3 },
    ],
    white: { username: 'alice', display_name: 'Alice' },
    black: { username: 'bob', display_name: null },
    invite_token: 'secret',
}

beforeEach(() => resetHarness())

describe('GET /api/games/[id]/analysis [F-134]', () => {
    test('signed-out callers get 401 and nothing is read', async () => {
        expect((await call()).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('a malformed id is a 404 and nothing is read', async () => {
        db.signIn(uid('me'))
        expect((await call('not-a-uuid')).status).toBe(404)
        expect(db.calls).toEqual([])
    })

    test('a public finished game, reviewed: moves from the review, accuracies and plies as an allow-listed DTO', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: reviewed, error: null })
        db.queue('game_invites', { data: null, error: null })
        const res = await json(await call())
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            id: GAME,
            pgn: '1. e4 e5 2. Nf3',
            white: {
                name: 'Alice',
                accuracy: 87.3,
                moves: [
                    { ply: 0, san: 'e4', classification: 'Book', accuracy: 100 },
                    { ply: 2, san: 'Nf3', classification: 'Best', accuracy: 98 },
                ],
            },
            black: { name: 'bob', accuracy: 64.1, moves: [{ ply: 1, san: 'e5', classification: 'Book', accuracy: 100 }] },
        })
        expect(db.callsFor('moves')).toEqual([])
    })

    test('not reviewed yet: moves from the moves table, in order; no accuracy', async () => {
        db.signIn(uid('me'))
        db.queue('games', {
            data: { ...reviewed, white_accuracy: null, black_accuracy: null, white_move_classifications: null, black_move_classifications: null },
            error: null,
        })
        db.queue('game_invites', { data: null, error: null })
        db.queue('moves', { data: [{ san: 'd4' }, { san: 'd5' }, { san: 'c4' }], error: null })
        const res = await json(await call())
        expect(res.body.pgn).toBe('1. d4 d5 2. c4')
        expect(res.body.white).toEqual({ name: 'Alice', accuracy: null, moves: [] })
        expect(db.op(db.callsFor('moves')[0], 'order')).toEqual(['move_number'])
    })

    test('a private game is not found for anyone but its players', async () => {
        db.signIn(uid('stranger'))
        db.queue('games', { data: reviewed, error: null })
        db.queue('game_invites', { data: { game_id: GAME }, error: null })
        expect((await call()).status).toBe(404)
        expect(db.callsFor('moves')).toEqual([])
    })

    test('a player sees their private game (no invite lookup needed)', async () => {
        db.signIn(uid('bob'))
        db.queue('games', { data: reviewed, error: null })
        expect((await call()).status).toBe(200)
        expect(db.callsFor('game_invites')).toEqual([])
    })

    test('the private-game check failing denies (fail closed)', async () => {
        db.signIn(uid('stranger'))
        db.queue('games', { data: reviewed, error: null })
        db.queue('game_invites', { data: null, error: { message: 'down' } })
        expect((await call()).status).toBe(500)
    })

    test('a game still in play is refused: no engine help mid-game', async () => {
        db.signIn(uid('alice'))
        db.queue('games', { data: { ...reviewed, status: 'active' }, error: null })
        const res = await json(await call())
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: 'This game is still being played' })
    })

    test('an unknown game is 404; a database error is 500', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: null, error: null })
        expect((await call()).status).toBe(404)
        db.queue('games', { data: null, error: { message: 'down' } })
        expect((await call()).status).toBe(500)
    })
})

describe('helpers', () => {
    test('movetext numbers full moves', () => {
        expect(movetext([])).toBe('')
        expect(movetext(['e4'])).toBe('1. e4')
        expect(movetext(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3')
    })

    test('toPlies keeps only well-formed entries and the shown fields', () => {
        expect(toPlies(null)).toEqual([])
        expect(toPlies([{ ply: 1, san: 'e5', classification: 'Good', accuracy: 90, eval_white: 1 }, { san: 'x' }])).toEqual([
            { ply: 1, san: 'e5', classification: 'Good', accuracy: 90 },
        ])
    })
})
