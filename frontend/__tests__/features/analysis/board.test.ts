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
    test('POSTs {fen, depth: 18} to the default socket URL and returns the JSON without checking ok', async () => {
        delete process.env.NEXT_PUBLIC_SOCKET_URL
        const fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'x' }) }))
        ;(global as any).fetch = fetchMock
        await expect(requestEngineAnalysis('FEN')).resolves.toEqual({ error: 'x' })
        expect(fetchMock.mock.calls).toEqual([['http://127.0.0.1:3001/api/analysis/engine', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: 'FEN', depth: 18 }),
        }]])
    })
})
