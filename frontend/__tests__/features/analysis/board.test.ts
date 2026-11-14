import { Chess } from 'chess.js'
import { gameFromFen, gameFromPgn, replayTo, resolveSquareClick, targetsFor } from '@/features/analysis/board'
import { requestEngineAnalysis } from '@/lib/api/analysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('replayTo', () => {
    test('-1 is the start; index beyond history is clamped', () => {
        const { history } = gameFromPgn('1. e4 e5 2. Nf3')
        expect(replayTo(history, -1).fen()).toBe(START)
        expect(replayTo(history, 0).history()).toEqual(['e4'])
        expect(replayTo(history, 99).history()).toEqual(['e4', 'e5', 'Nf3'])
    })
})

describe('targetsFor', () => {
    test('null for empty squares and the side not to move', () => {
        const g = new Chess()
        expect(targetsFor(g, 'e4')).toBeNull()
        expect(targetsFor(g, 'e7')).toBeNull()
        expect(targetsFor(g, 'g1')?.sort()).toEqual(['f3', 'h3'])
    })
})

describe('gameFromFen / gameFromPgn', () => {
    test('throw on invalid input', () => {
        expect(() => gameFromFen('garbage')).toThrow()
        expect(() => gameFromPgn('1. e5 e4 zz')).toThrow()
        expect(gameFromFen('8/8/8/8/8/8/8/K6k w - - 0 1').fen()).toBe('8/8/8/8/8/8/8/K6k w - - 0 1')
    })
})

describe('resolveSquareClick', () => {
    const g = new Chess()
    test('no selection: select own piece or nothing', () => {
        expect(resolveSquareClick(g, null, 'e2')).toEqual({ type: 'select', targets: ['e3', 'e4'] })
        expect(resolveSquareClick(g, null, 'e7')).toEqual({ type: 'none' })
    })
    test('selection: legal move, reselect, or clear; original game untouched', () => {
        const out = resolveSquareClick(g, 'e2', 'e4')
        expect(out.type).toBe('move')
        if (out.type === 'move') {
            expect(out.move.san).toBe('e4')
            expect(out.game.turn()).toBe('b')
        }
        expect(g.fen()).toBe(START)
        expect(resolveSquareClick(g, 'e2', 'g1').type).toBe('select')
        expect(resolveSquareClick(g, 'e2', 'e5')).toEqual({ type: 'clear' })
        expect(resolveSquareClick(g, 'e2', 'e7')).toEqual({ type: 'clear' })
    })
})

describe('requestEngineAnalysis', () => {
    const call = ['http://127.0.0.1:3001/api/analysis/engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: 'FEN', depth: 18 }),
    }]
    const respond = (ok: boolean, body: unknown, status = ok ? 200 : 503) => {
        const fetchMock = jest.fn(async () => ({ ok, status, json: async () => body }))
        ;(global as any).fetch = fetchMock
        return fetchMock
    }
    beforeEach(() => { delete process.env.NEXT_PUBLIC_SOCKET_URL })

    // F14 (was: '... returns the JSON without checking ok', resolving to { error: 'x' }).
    test('POSTs {fen, depth: 18} to the default socket URL and rejects a non-OK status', async () => {
        const fetchMock = respond(false, { error: 'x' })
        await expect(requestEngineAnalysis('FEN')).rejects.toThrow('503')
        expect(fetchMock.mock.calls).toEqual([call])
    })

    test('F14: reads the engine body: centipawns become pawns from White\'s side', async () => {
        respond(true, { best_move: 'e2e4', evaluation: { type: 'cp', value: 34 }, lines: [] })
        await expect(requestEngineAnalysis('FEN')).resolves.toEqual({ score: 0.34, mate: null, best_move: 'e2e4' })
    })

    test('F14: a mate score keeps the mate distance and fills the bar for the mating side', async () => {
        respond(true, { best_move: 'h5f7', evaluation: { type: 'mate', value: -2 } })
        const data = await requestEngineAnalysis('FEN')
        expect(data.mate).toBe(-2)
        expect(data.score).toBeLessThan(-6)
    })

    test('F14: a body without an evaluation is an error, not 0.0', async () => {
        respond(true, { detail: 'busy' })
        await expect(requestEngineAnalysis('FEN')).rejects.toThrow()
    })
})
