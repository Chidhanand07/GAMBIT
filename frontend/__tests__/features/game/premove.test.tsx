/**
 * Premoves on the client [PREMOVE] (ADR F-153): destinations, the reducer, the click flow,
 * the server's "discarded" note, and the board tint.
 */
import { Chess } from 'chess.js'
import { render } from '@testing-library/react'
import { Board } from '@/components/chess/Board'
import { createGameSocketHandlers, type SocketHandlerContext } from '@/features/game/hooks/gameSocketHandlers'
import { canPremove, premoveClick, type PremoveOptions } from '@/features/game/hooks/usePremove'
import { createInitialGameState, gameReducer, type GameState } from '@/features/game/state/gameReducer'
import { premoveDests, premovePromotion } from '@/features/game/utils/premoveDests'
import { statusChips } from '@/features/settings/components/GameplayPreview'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { ACK_POLICY } from '@/lib/socket/ack'

jest.mock('@/lib/sounds', () => ({ playGameEndSound: jest.fn(), playMoveSound: jest.fn() }))

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

describe('premoveDests: geometry only, other pieces do not block', () => {
    test('pawns: one or two from the start rank, and both diagonals', () => {
        expect(premoveDests('e2', 'p', 'white').sort()).toEqual(['d3', 'e3', 'e4', 'f3'])
        expect(premoveDests('a7', 'p', 'black').sort()).toEqual(['a5', 'a6', 'b6'])
    })
    test('knight, sliders through pieces, king with castling squares from home', () => {
        expect(premoveDests('g1', 'n', 'white').sort()).toEqual(['e2', 'f3', 'h3'])
        expect(premoveDests('a1', 'r', 'white')).toHaveLength(14)
        expect(premoveDests('d1', 'q', 'white')).toContain('h5')
        expect(premoveDests('e1', 'k', 'white')).toEqual(expect.arrayContaining(['g1', 'c1', 'd2']))
        expect(premoveDests('e2', 'k', 'white')).not.toContain('g1')
    })
    test('a pawn premoved to the last rank promotes to a queen', () => {
        expect(premovePromotion('p', 'a8')).toBe('q')
        expect(premovePromotion('p', 'a7')).toBeUndefined()
        expect(premovePromotion('r', 'a8')).toBeUndefined()
    })
})

describe('reducer', () => {
    const queued = (): GameState => ({
        ...gameReducer(createInitialGameState(), { type: 'premoveQueued', premove: { from: 'g1', to: 'f3' } }),
        myColor: 'white',
    })

    test('my own move does not clear my premove; the opponent’s move resolves it', () => {
        const mine = gameReducer(queued(), { type: 'moveReceived', fen: AFTER_E4, from: 'e2', to: 'e4', san: 'e4' })
        expect(mine.premove).toEqual({ from: 'g1', to: 'f3' })
        const theirs = gameReducer(mine, { type: 'moveReceived', fen: AFTER_E5, from: 'e7', to: 'e5', san: 'e5' })
        expect(theirs.premove).toBeNull()
    })

    test('the end of the game and a takeback clear it', () => {
        expect(gameReducer(queued(), { type: 'gameEnded', info: { result: 'Draw', reason: 'Agreement' } }).premove).toBeNull()
        const restored = { fen: AFTER_E4, fens: [], sans: [], lastMove: null, whiteMs: 1, blackMs: 1, clockActive: true }
        expect(gameReducer(queued(), { type: 'takebackApplied', restored }).premove).toBeNull()
    })
})

describe('click flow', () => {
    function setup(over: Partial<GameState> = {}, ack: unknown = { ok: true }) {
        const emit = jest.fn((_e: string, _p: unknown, cb?: (r: unknown) => void) => cb?.(ack))
        const dispatch = jest.fn()
        const notify = jest.fn()
        const chess = new Chess(AFTER_E4) // Black to move; I am White
        const state = { ...createInitialGameState(), myColor: 'white' as const, fen: AFTER_E4, ...over }
        const opts: PremoveOptions = {
            gameId: 'g1', socket: { emit } as never, state, dispatch, chessRef: { current: chess }, notify, enabled: true,
        }
        return { opts, emit, dispatch, notify, actions: () => dispatch.mock.calls.map(([a]) => a) }
    }

    test('only with the setting on, as a player, live, on the opponent’s turn', () => {
        const { opts } = setup()
        expect(canPremove(opts, false)).toBe(true)
        expect(canPremove(opts, true)).toBe(false)
        expect(canPremove({ ...opts, enabled: false }, false)).toBe(false)
        expect(canPremove({ ...opts, state: { ...opts.state, viewIndex: 0 } }, false)).toBe(false)
        expect(canPremove({ ...opts, state: { ...opts.state, myColor: 'spectator' } }, false)).toBe(false)
    })

    test('picking my piece selects it with premove destinations', () => {
        const { opts, actions } = setup()
        premoveClick(opts, 'g1')
        expect(actions()).toEqual([{ type: 'squareSelected', square: 'g1', dests: expect.arrayContaining(['f3', 'h3', 'e2']) }])
    })

    test('a destination queues it: shown at once, premove_set sent with the squares only', () => {
        const { opts, emit, actions } = setup({ selectedSq: 'g1', legalDests: ['f3', 'h3', 'e2'] })
        premoveClick(opts, 'f3')
        expect(actions()).toEqual([{ type: 'premoveQueued', premove: { from: 'g1', to: 'f3' } }, { type: 'selectionCleared' }])
        expect(emit.mock.calls[0].slice(0, 2)).toEqual(['premove_set', { game_id: 'g1', from: 'g1', to: 'f3' }])
    })

    test('a refusal removes it and says why ("your turn" silently)', () => {
        const refused = setup({ selectedSq: 'g1', legalDests: ['f3'] }, { ok: false, error: 'illegal_premove' })
        premoveClick(refused.opts, 'f3')
        expect(refused.actions()).toContainEqual({ type: 'premoveCleared' })
        expect(refused.notify).toHaveBeenCalledWith('That premove is not possible.')
        const late = setup({ selectedSq: 'g1', legalDests: ['f3'] }, { ok: false, error: 'premove_your_turn' })
        premoveClick(late.opts, 'f3')
        expect(late.notify).not.toHaveBeenCalled()
    })

    test('any click while one is queued cancels it', () => {
        const { opts, emit, actions } = setup({ premove: { from: 'g1', to: 'f3' } })
        premoveClick(opts, 'a1')
        expect(actions()).toEqual([{ type: 'premoveCleared' }, { type: 'selectionCleared' }])
        expect(emit.mock.calls[0].slice(0, 2)).toEqual(['premove_cancel', { game_id: 'g1' }])
    })

    test('ack policy: premove_set never re-sent, premove_cancel retried once', () => {
        expect(ACK_POLICY.premove_set).toEqual({ retryOnce: false })
        expect(ACK_POLICY.premove_cancel).toEqual({ retryOnce: true })
    })
})

describe('socket handlers', () => {
    function makeCtx() {
        const ctx: SocketHandlerContext = {
            socket: { emit: jest.fn() } as never, gameId: 'g1', myColor: 'white', soundOn: false,
            router: { push: jest.fn() }, dispatch: jest.fn(), chessRef: { current: new Chess() },
            clockSyncedRef: { current: false }, lastProcessedFenRef: { current: null },
            markDisconnected: jest.fn(), markReconnected: jest.fn(), inform: jest.fn(),
        }
        const handlers = new Map(createGameSocketHandlers(ctx).handlers)
        const fire = (event: string, payload: unknown) => (handlers.get(event) as (p: unknown) => void)(payload)
        return { ctx, fire, dispatched: () => (ctx.dispatch as jest.Mock).mock.calls.map(([a]) => a) }
    }

    test('premove_discarded clears it and tells me', () => {
        const { ctx, fire, dispatched } = makeCtx()
        fire('premove_discarded', { game_id: 'g1', reason: 'illegal_move' })
        expect(dispatched()).toEqual([{ type: 'premoveCleared' }])
        expect(ctx.inform).toHaveBeenCalledWith('Premove cancelled: it was not legal after that move')
    })

    test('game_state_sync restores my queued premove', () => {
        const { fire, dispatched } = makeCtx()
        fire('game_state_sync', { fen: AFTER_E4, moveLog: [], whiteMs: 1, blackMs: 1, clockActive: true, premove: { from: 'g1', to: 'f3' } })
        expect(dispatched()).toContainEqual(expect.objectContaining({ type: 'requestsSynced', premove: { from: 'g1', to: 'f3' } }))
    })
})

test('Board tints both premove squares', () => {
    const { container } = render(<Board fen={AFTER_E4} premove={{ from: 'g1', to: 'f3' }} />)
    const marked = Array.from(container.querySelectorAll('[data-mark="premove"]')).map((m) => m.parentElement!.getAttribute('data-square'))
    expect(marked.sort()).toEqual(['f3', 'g1'])
    expect(container.querySelector('[data-mark="premove"]')).toHaveClass('bg-mark-premove')
})

test('settings: "Premoves" is off by default and leads the preview chips', () => {
    expect(DEFAULT_SETTINGS.premoves).toBe(false)
    expect(statusChips(DEFAULT_SETTINGS)).toEqual(['Premoves off', 'Takebacks off'])
    expect(statusChips({ ...DEFAULT_SETTINGS, premoves: true, allowTakebacks: true })).toEqual(['Premoves on', 'Takebacks on'])
})
