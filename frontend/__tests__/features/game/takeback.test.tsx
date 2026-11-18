/**
 * Takebacks on the client [TAKEBACK] (ADR F-152): the availability mirror, the reducer, the
 * socket handlers, the commands, the setting declared to the server, and the button.
 */
import { Chess } from 'chess.js'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { GameActionsGrid } from '@/features/game/components/GameActions'
import { createGameSocketHandlers, type SocketHandlerContext } from '@/features/game/hooks/gameSocketHandlers'
import { useTakebackPref } from '@/features/game/hooks/useTakebackPref'
import * as requests from '@/features/game/requestCommands'
import { createInitialGameState, gameReducer } from '@/features/game/state/gameReducer'
import { canRequestTakeback } from '@/features/game/utils/takeback'
import { statusChips } from '@/features/settings/components/GameplayPreview'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { ACK_POLICY, rejectionMessage } from '@/lib/socket/ack'

jest.mock('@/lib/sounds', () => ({ playGameEndSound: jest.fn(), playMoveSound: jest.fn() }))

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

test('canRequestTakeback: one ply of mine, or two once the opponent replied; never while one stands', () => {
    expect(canRequestTakeback({ plies: 0, myTurn: true, pending: false })).toBe(false)
    expect(canRequestTakeback({ plies: 1, myTurn: false, pending: false })).toBe(true)
    expect(canRequestTakeback({ plies: 1, myTurn: true, pending: false })).toBe(false) // Black before its first move
    expect(canRequestTakeback({ plies: 2, myTurn: true, pending: false })).toBe(true)
    expect(canRequestTakeback({ plies: 5, myTurn: false, pending: true })).toBe(false)
})

describe('reducer', () => {
    test('takebackApplied replaces position, history, last move and clocks, and clears requests', () => {
        let s = createInitialGameState()
        s = gameReducer(s, { type: 'moveReceived', fen: 'x1', from: 'e2', to: 'e4', san: 'e4' })
        s = gameReducer(s, { type: 'takebackRequested', by: 'white', plies: 1 })
        s = gameReducer(s, { type: 'historyViewed', index: 0 })
        s = gameReducer(s, {
            type: 'takebackApplied',
            restored: { fen: AFTER_E4, fens: [AFTER_E4], sans: ['e4'], lastMove: { from: 'e2', to: 'e4' }, whiteMs: 61_000, blackMs: 59_400, clockActive: true },
        })
        expect(s).toMatchObject({
            fen: AFTER_E4,
            fenSnapshots: [AFTER_E4],
            moveList: ['e4'],
            lastMove: { from: 'e2', to: 'e4' },
            viewIndex: null,
            whiteTime: 61,
            blackTime: 59,
            clockActive: true,
            takeback: null,
        })
    })

    test('requests and settings', () => {
        let s = gameReducer(createInitialGameState(), { type: 'takebackRequested', by: 'black', plies: 2 })
        expect(s.takeback).toEqual({ by: 'black', plies: 2 })
        s = gameReducer(s, { type: 'takebackPrefsSet', prefs: { black: true } })
        expect(s.takebackPrefs).toEqual({ black: true })
        expect(gameReducer(s, { type: 'takebackCleared' }).takeback).toBeNull()
        expect(gameReducer(s, { type: 'moveReceived', fen: 'x', from: 'a2', to: 'a3', san: 'a3' }).takeback).toBeNull()
    })
})

describe('socket handlers', () => {
    function makeCtx(over: Partial<SocketHandlerContext> = {}) {
        const ctx: SocketHandlerContext = {
            socket: { emit: jest.fn() } as never, gameId: 'g1', myColor: 'white', soundOn: false,
            router: { push: jest.fn() }, dispatch: jest.fn(), chessRef: { current: new Chess() },
            clockSyncedRef: { current: false }, lastProcessedFenRef: { current: null },
            markDisconnected: jest.fn(), markReconnected: jest.fn(), inform: jest.fn(), ...over,
        }
        const handlers = new Map(createGameSocketHandlers(ctx).handlers)
        const fire = (event: string, payload: unknown) => (handlers.get(event) as (p: unknown) => void)(payload)
        return { ctx, fire, dispatched: () => (ctx.dispatch as jest.Mock).mock.calls.map(([a]) => a) }
    }

    test('takeback_requested / takeback_prefs, for this game only', () => {
        const { fire, dispatched } = makeCtx()
        fire('takeback_requested', { game_id: 'other', by: 'black', plies: 1 })
        fire('takeback_requested', { game_id: 'g1', by: 'black', plies: 1 })
        fire('takeback_prefs', { game_id: 'g1', black: true })
        expect(dispatched()).toEqual([
            { type: 'takebackRequested', by: 'black', plies: 1 },
            { type: 'takebackPrefsSet', prefs: { black: true } },
        ])
    })

    test('takeback_declined: cleared; the requester is told', () => {
        const { ctx, fire, dispatched } = makeCtx()
        fire('takeback_declined', { game_id: 'g1', by: 'black' })
        expect(dispatched()).toEqual([{ type: 'takebackCleared' }])
        expect(ctx.inform).toHaveBeenCalledWith('Takeback declined')
    })

    test('takeback_applied: the live board loads the restored position and the history follows the server', () => {
        const { ctx, fire, dispatched } = makeCtx()
        fire('takeback_applied', {
            game_id: 'g1', plies: 2, fen: AFTER_E4, moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
            whiteMs: 60_000, blackMs: 58_000, activeSide: 'b', clockActive: true,
        })
        expect(ctx.chessRef.current.fen()).toBe(AFTER_E4)
        expect(ctx.lastProcessedFenRef.current).toBe(AFTER_E4)
        expect(dispatched()).toEqual([
            {
                type: 'takebackApplied',
                restored: { fen: AFTER_E4, fens: [AFTER_E4], sans: ['e4'], lastMove: { from: 'e2', to: 'e4' }, whiteMs: 60_000, blackMs: 58_000, clockActive: true },
            },
        ])
        expect(ctx.inform).toHaveBeenCalledWith('Two moves were taken back')
    })
})

describe('commands', () => {
    test('request / accept / decline name the game only; a refusal is shown', () => {
        const emit = jest.fn((_e: string, _p: unknown, ack?: (r: unknown) => void) => ack?.({ ok: false, error: 'takebacks_disabled' }))
        const notify = jest.fn()
        const dispatch = jest.fn()
        const ctx = { socket: { emit } as never, myProfile: null, gameId: 'g1', state: { ...createInitialGameState(), myColor: 'black' as const }, dispatch, notify }
        requests.requestTakeback(ctx)
        requests.acceptTakeback(ctx)
        requests.declineTakeback(ctx)
        expect(emit.mock.calls.map(([e, p]) => [e, p])).toEqual([
            ['takeback_request', { game_id: 'g1' }],
            ['takeback_accept', { game_id: 'g1' }],
            ['takeback_decline', { game_id: 'g1' }],
        ])
        expect(notify).toHaveBeenCalledWith('Your opponent does not allow takeback requests.')
        expect(dispatch).toHaveBeenCalledWith({ type: 'takebackCleared' })
    })

    test('ack policy and messages', () => {
        expect(ACK_POLICY.takeback_request).toEqual({ retryOnce: false })
        expect(ACK_POLICY.takeback_accept).toEqual({ retryOnce: false })
        expect(ACK_POLICY.takeback_decline).toEqual({ retryOnce: true, doneOnRetry: ['no_pending_request'] })
        expect(ACK_POLICY.takeback_pref).toEqual({ retryOnce: true })
        for (const code of ['takeback_pending', 'takeback_cooldown', 'takeback_nothing_to_undo']) {
            expect(rejectionMessage(code)).not.toBe(rejectionMessage('unknown_code'))
        }
    })
})

describe('useTakebackPref', () => {
    const base = { gameId: 'g1', myColor: 'white' as const, connected: true, over: false }

    test('nothing is sent while the setting is off (the server assumes off); on → sent; off again → sent', () => {
        const socket = { emit: jest.fn() }
        const { rerender } = renderHook((p: { allow: boolean }) => useTakebackPref({ ...base, socket: socket as never, ...p }), {
            initialProps: { allow: false },
        })
        expect(socket.emit).not.toHaveBeenCalled()
        rerender({ allow: true })
        rerender({ allow: false })
        expect(socket.emit.mock.calls.map(([e, p]) => [e, p])).toEqual([
            ['takeback_pref', { game_id: 'g1', allow: true }],
            ['takeback_pref', { game_id: 'g1', allow: false }],
        ])
    })

    test('spectators never declare', () => {
        const socket = { emit: jest.fn() }
        renderHook(() => useTakebackPref({ ...base, myColor: 'spectator', allow: true, socket: socket as never }))
        expect(socket.emit).not.toHaveBeenCalled()
    })
})

describe('Takeback button', () => {
    const base = { isPlayer: true, over: false, onFlip: jest.fn(), onDraw: jest.fn(), onResign: jest.fn() }

    test('absent unless the opponent allows takebacks: the mockup’s three buttons', () => {
        const { container } = render(<GameActionsGrid {...base} takeback={null} />)
        expect(screen.queryByRole('button', { name: 'Takeback' })).not.toBeInTheDocument()
        expect(container.firstElementChild).toHaveClass('grid-cols-3')
    })

    test('shown as a fourth button; "Requested" and disabled while my request stands', () => {
        const onClick = jest.fn()
        const { container, rerender } = render(<GameActionsGrid {...base} takeback={{ requested: false, enabled: true, onClick }} />)
        expect(container.firstElementChild).toHaveClass('grid-cols-4')
        fireEvent.click(screen.getByRole('button', { name: 'Takeback' }))
        expect(onClick).toHaveBeenCalled()
        rerender(<GameActionsGrid {...base} takeback={{ requested: true, enabled: false, onClick }} />)
        expect(screen.getByRole('button', { name: 'Requested' })).toBeDisabled()
    })
})

test('settings: "Allow takeback requests" is off by default and shows as a preview chip', () => {
    expect(DEFAULT_SETTINGS.allowTakebacks).toBe(false)
    expect(statusChips(DEFAULT_SETTINGS)).toContain('Takebacks off')
    expect(statusChips({ ...DEFAULT_SETTINGS, allowTakebacks: true })).toContain('Takebacks on')
})
