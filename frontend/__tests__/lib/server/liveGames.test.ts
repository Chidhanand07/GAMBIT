/** @jest-environment node */
import { listLiveGames, moveNumberFromFen, toLiveGame } from '@/lib/server/liveGames'
import { createSupabaseMock } from '../../helpers/supabaseMock'

const NOW = new Date('2026-11-16T12:00:00.000Z')
const player = (username: string, ratings: Partial<Record<string, number>> = {}) => ({
    username,
    display_name: `${username} D`,
    avatar_url: null,
    rating_bullet: 1001.4,
    rating_blitz: 1102.6,
    rating_rapid: 1203.5,
    rating_classical: 1304,
    sex: 'f',
    ...ratings,
})
const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    time_control: '3+0',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 21',
    started_at: '2026-11-16T11:00:00Z',
    white: player('alice'),
    black: player('bob'),
    ...extra,
})

describe('moveNumberFromFen', () => {
    test.each([
        ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1],
        ['8/8/8/8/8/8/8/K6k w - - 10 38', 38],
        [null, 1],
        ['garbage', 1],
        ['8/8/8/8/8/8/8/K6k w - - 0 x', 1],
    ])('%s → %s', (fen, n) => expect(moveNumberFromFen(fen)).toBe(n))
})

describe('toLiveGame', () => {
    test('allow-listed players with the rating of the game category, rounded', () => {
        expect(toLiveGame(row('g1'))).toEqual({
            id: 'g1',
            time_control: '3+0',
            category: 'blitz',
            move_number: 21,
            started_at: '2026-11-16T11:00:00Z',
            white: { username: 'alice', display_name: 'alice D', avatar_url: null, rating: 1103 },
            black: { username: 'bob', display_name: 'bob D', avatar_url: null, rating: 1103 },
        })
    })

    test('rapid and bullet games read their own rating columns; a missing rating is null', () => {
        expect(toLiveGame(row('g', { time_control: '10+5' }))!.white.rating).toBe(1204)
        expect(toLiveGame(row('g', { time_control: '1+0', black: player('b', { rating_bullet: undefined as never }) }))!.black.rating).toBeNull()
    })

    test('a game with a missing player is dropped', () => {
        expect(toLiveGame(row('g', { black: null }))).toBeNull()
    })
})

describe('listLiveGames', () => {
    test('active, not timed out, newest first, bounded; private (invited) games are left out', async () => {
        const db = createSupabaseMock()
        db.queue('games', { data: [row('g1'), row('g2'), row('g3')], error: null })
        db.queue('game_invites', { data: [{ game_id: 'g2' }], error: null })
        const res = await listLiveGames(db as never, 5, NOW)
        expect(res.data!.map((g) => g.id)).toEqual(['g1', 'g3'])

        const [games] = db.callsFor('games')
        expect(db.op(games, 'eq')).toEqual(['status', 'active'])
        expect(db.op(games, 'or')).toEqual(['clock_deadline.is.null,clock_deadline.gt.2026-11-16T12:00:00.000Z'])
        expect(db.op(games, 'order')).toEqual(['started_at', { ascending: false }])
        expect(db.op(games, 'limit')).toEqual([10])
        const select = db.op(games, 'select')![0] as string
        expect(select).not.toContain('*')
        expect(select).not.toContain('invite')
        expect(db.op(db.callsFor('game_invites')[0], 'in')).toEqual(['game_id', ['g1', 'g2', 'g3']])
    })

    test('never returns more than the limit', async () => {
        const db = createSupabaseMock()
        db.queue('games', { data: [row('a'), row('b'), row('c')], error: null })
        db.queue('game_invites', { data: [], error: null })
        expect((await listLiveGames(db as never, 2, NOW)).data!.map((g) => g.id)).toEqual(['a', 'b'])
    })

    test('no active games: the invites are not read', async () => {
        const db = createSupabaseMock()
        db.queue('games', { data: [], error: null })
        expect(await listLiveGames(db as never, 5, NOW)).toEqual({ data: [], error: null })
        expect(db.callsFor('game_invites')).toEqual([])
    })

    test('a failed games read or a failed private check is an error (fail closed)', async () => {
        const db = createSupabaseMock()
        db.queue('games', { data: null, error: { message: 'down' } })
        expect(await listLiveGames(db as never, 5, NOW)).toEqual({ data: null, error: { message: 'down' } })

        db.queue('games', { data: [row('g1')], error: null })
        db.queue('game_invites', { data: null, error: { message: 'nope' } })
        expect(await listLiveGames(db as never, 5, NOW)).toEqual({ data: null, error: { message: 'nope' } })
    })
})
