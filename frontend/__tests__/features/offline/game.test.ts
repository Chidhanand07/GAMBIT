import { Chess } from 'chess.js'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCheckSound: jest.fn(),
    playGameEndSound: jest.fn(),
}))
import * as sounds from '@/lib/sounds'
import { isPromotion, playerMoveCount, playSoundForMove, resolveColor, resultText, tryMove, undoToPlayerTurn } from '@/features/offline/game'
import { handleSquareClick, type SquareClickContext } from '@/features/offline/squareClick'
import { requestMaverickMove } from '@/lib/api/offline'

beforeEach(() => jest.clearAllMocks())

/** White pawn on a7, one step from promoting. */
const PROMOTION_FEN = '7k/P7/8/8/8/8/8/4K3 w - - 0 1'

describe('tryMove', () => {
    test('returns the move or null when illegal', () => {
        const g = new Chess()
        expect(tryMove(g, 'e2', 'e5')).toBeNull()
        expect(tryMove(g, 'e2', 'e4')?.san).toBe('e4')
    })

    test('a promoting pawn becomes a queen unless another piece is given', () => {
        expect(tryMove(new Chess(PROMOTION_FEN), 'a7', 'a8')?.promotion).toBe('q')
        expect(tryMove(new Chess(PROMOTION_FEN), 'a7', 'a8', 'n')?.promotion).toBe('n')
    })

    test('isPromotion: only a legal pawn move to the last rank', () => {
        const g = new Chess(PROMOTION_FEN)
        expect(isPromotion(g, 'a7', 'a8')).toBe(true)
        expect(isPromotion(g, 'e1', 'e2')).toBe(false)
        expect(isPromotion(new Chess(), 'e2', 'e4')).toBe(false)
    })
})

describe('playSoundForMove', () => {
    test('checkmate > check > capture > move', () => {
        const mate = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
        playSoundForMove(mate, null)
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(false)
        const g = new Chess()
        const m = g.move('e4')
        playSoundForMove(g, m)
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
        playSoundForMove(g, { captured: 'p' } as any)
        expect(sounds.playCaptureSound).toHaveBeenCalledTimes(1)
        const check = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
        check.move('Rh8')
        playSoundForMove(check, null)
        expect(sounds.playCheckSound).toHaveBeenCalledTimes(1)
    })
})

describe('resultText / resolveColor', () => {
    test('texts', () => {
        const g = new Chess()
        expect(resultText(g, 'w', true)).toBe('You resigned')
        expect(resultText(g, 'w', false)).toBe('Game over')
        const mate = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
        expect(resultText(mate, 'w', false)).toBe('MAVERICK wins by checkmate')
        expect(resultText(mate, 'b', false)).toBe('You win by checkmate!')
        expect(resultText(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 'w', false)).toBe('Stalemate')
        expect(resultText(new Chess('8/8/8/8/8/8/8/K6k w - - 0 1'), 'w', false)).toBe('Draw')
    })
    test('random uses Math.random < 0.5 → w', () => {
        expect(resolveColor('b')).toBe('b')
        jest.spyOn(Math, 'random').mockReturnValueOnce(0.49).mockReturnValueOnce(0.5)
        expect(resolveColor('random')).toBe('w')
        expect(resolveColor('random')).toBe('b')
    })
})

describe('undoToPlayerTurn', () => {
    test('undoes two plies when MAVERICK replied, one otherwise', () => {
        const g = new Chess()
        g.move('e4'); g.move('e5'); g.move('Nf3'); g.move('Nc6')
        expect(undoToPlayerTurn(g, 'w')).toEqual({ from: 'e7', to: 'e5' })
        expect(g.history()).toEqual(['e4', 'e5'])
        g.move('Nf3')
        expect(undoToPlayerTurn(g, 'w')).toEqual({ from: 'e7', to: 'e5' })
        const empty = new Chess()
        expect(undoToPlayerTurn(empty, 'w')).toBeNull()
    })
})

describe('undoToPlayerTurn as Black [F13]', () => {
    test('with only MAVERICK\'s opening move there is nothing of mine to take back: no-op', () => {
        const g = new Chess()
        g.move('e4')
        // Was: undid e4 and left White (MAVERICK) to move with nobody asking it to: stuck.
        expect(undoToPlayerTurn(g, 'b')).toEqual({ from: 'e2', to: 'e4' })
        expect(g.history()).toEqual(['e4'])
        expect(g.turn()).toBe('b')
    })

    test('after MAVERICK replied: back to my turn, its opening move kept', () => {
        const g = new Chess()
        g.move('e4'); g.move('e5'); g.move('Nf3')
        expect(undoToPlayerTurn(g, 'b')).toEqual({ from: 'e2', to: 'e4' })
        expect(g.history()).toEqual(['e4'])
        g.move('e5')
        expect(undoToPlayerTurn(g, 'b')).toEqual({ from: 'e2', to: 'e4' }) // reply never came
        expect(g.turn()).toBe('b')
    })

    test('playerMoveCount counts only my moves', () => {
        const g = new Chess()
        expect(playerMoveCount(g, 'b')).toBe(0)
        g.move('e4')
        expect(playerMoveCount(g, 'b')).toBe(0)
        expect(playerMoveCount(g, 'w')).toBe(1)
        g.move('e5')
        expect(playerMoveCount(g, 'b')).toBe(1)
    })
})

describe('handleSquareClick', () => {
    const ctx = (over: Partial<SquareClickContext> = {}): SquareClickContext => ({
        game: new Chess(),
        playerColor: 'w',
        blocked: false,
        selection: { selectedSquare: null, isOwnPiece: (s) => s[1] === '2' || s[1] === '1', select: jest.fn(), clearSelection: jest.fn() },
        onPlayerMove: jest.fn(),
        ...over,
    })
    test('blocked or not your turn → nothing', () => {
        const c = ctx({ blocked: true })
        handleSquareClick(c, 'e2')
        expect(c.selection.select).not.toHaveBeenCalled()
        const d = ctx({ playerColor: 'b' })
        handleSquareClick(d, 'e7')
        expect(d.selection.select).not.toHaveBeenCalled()
    })
    test('select own piece / ignore others when nothing selected', () => {
        const c = ctx()
        handleSquareClick(c, 'e4')
        expect(c.selection.select).not.toHaveBeenCalled()
        handleSquareClick(c, 'e2')
        expect(c.selection.select).toHaveBeenCalledWith('e2')
    })
    test('same square clears; legal move calls onPlayerMove; illegal reselects or clears', () => {
        const base = ctx()
        const c = { ...base, selection: { ...base.selection, selectedSquare: 'e2' } }
        handleSquareClick(c, 'e2')
        expect(c.selection.clearSelection).toHaveBeenCalledTimes(1)
        handleSquareClick(c, 'g1')
        expect(c.selection.select).toHaveBeenCalledWith('g1')
        handleSquareClick(c, 'e6')
        expect(c.selection.clearSelection).toHaveBeenCalledTimes(2)
        handleSquareClick(c, 'e4')
        expect(c.onPlayerMove).toHaveBeenCalledWith(expect.objectContaining({ from: 'e2', to: 'e4' }))
    })
    test('auto-queen off (onPromotion set): a promoting move asks for the piece instead of moving', () => {
        const base = ctx({ game: new Chess(PROMOTION_FEN), onPromotion: jest.fn() })
        const c = { ...base, selection: { ...base.selection, selectedSquare: 'a7' } }
        handleSquareClick(c, 'a8')
        expect(c.onPromotion).toHaveBeenCalledWith('a7', 'a8')
        expect(c.onPlayerMove).not.toHaveBeenCalled()
        expect(c.game.get('a7')).toEqual({ type: 'p', color: 'w' })
    })
    test('auto-queen on (no onPromotion): a promoting move plays a queen', () => {
        const base = ctx({ game: new Chess(PROMOTION_FEN) })
        const c = { ...base, selection: { ...base.selection, selectedSquare: 'a7' } }
        handleSquareClick(c, 'a8')
        expect(c.onPlayerMove).toHaveBeenCalledWith(expect.objectContaining({ from: 'a7', to: 'a8', promotion: 'q' }))
    })
})

describe('requestMaverickMove', () => {
    test('POSTs fen + difficulty and returns the body', async () => {
        const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ uci: 'e7e5' }) }))
        ;(global as any).fetch = fetchMock
        await expect(requestMaverickMove('FEN', 'easy')).resolves.toEqual({ uci: 'e7e5' })
        expect(fetchMock.mock.calls).toEqual([['/api/maverick-move', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: 'FEN', difficulty: 'easy' }),
        }]])
    })
    test('error message precedence: detail, error, status', async () => {
        ;(global as any).fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'E' }) })
        await expect(requestMaverickMove('F', 'hard')).rejects.toThrow('E')
        ;(global as any).fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('x') } })
        await expect(requestMaverickMove('F', 'hard')).rejects.toThrow('Engine error (502)')
    })
})
