import { Chess } from 'chess.js'
import { createGameSocketHandlers, type SocketHandlerContext } from '@/features/game/hooks/gameSocketHandlers'
import * as sounds from '@/lib/sounds'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(), playCaptureSound: jest.fn(), playCastleSound: jest.fn(), playCheckSound: jest.fn(),
    playCheckmateSound: jest.fn(), playPromoteSound: jest.fn(), playGameStartSound: jest.fn(), playGameEndSound: jest.fn(),
}))

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

function makeCtx(over: Partial<SocketHandlerContext> = {}) {
    const ctx: SocketHandlerContext = {
        socket: { emit: jest.fn() } as never,
        myProfileId: 'me',
        gameId: 'g1',
        myColor: 'white',
        soundOn: true,
        router: { push: jest.fn() },
        dispatch: jest.fn(),
        chessRef: { current: new Chess() },
        clockSyncedRef: { current: false },
        lastProcessedFenRef: { current: null },
        markDisconnected: jest.fn(),
        markReconnected: jest.fn(),
        ...over,
    }
    const handlers = new Map(createGameSocketHandlers(ctx))
    const fire = (event: string, payload?: unknown) => (handlers.get(event) as (p?: unknown) => void)(payload)
    return { ctx, handlers, fire, dispatched: () => (ctx.dispatch as jest.Mock).mock.calls.map(([a]) => a) }
}

beforeEach(() => jest.clearAllMocks())

test('registers the 13 events in the legacy order', () => {
    const { handlers } = makeCtx()
    expect([...handlers.keys()]).toEqual([
        'disconnect', 'connect', 'game_state_sync', 'move_made', 'chat_message', 'game_end', 'rating_updated',
        'rematch_request', 'rematch_ready', 'rematch_declined', 'opponent_disconnected', 'opponent_reconnected', 'clock_sync',
    ])
})

test('connect marks connected then re-emits authenticate + join_game', () => {
    const { ctx, fire, dispatched } = makeCtx()
    fire('connect')
    expect(dispatched()).toEqual([{ type: 'connectionChanged', connected: true }])
    expect((ctx.socket.emit as jest.Mock).mock.calls).toEqual([['authenticate', 'me'], ['join_game', 'g1']])
})

test('move_made: activates the clock before loading the FEN, de-duplicates, ignores other games', () => {
    const { ctx, fire, dispatched } = makeCtx()
    fire('move_made', { game_id: 'other', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
    expect(dispatched()).toEqual([])
    fire('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
    fire('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
    expect(dispatched().map((a) => a.type)).toEqual(['clockActivated', 'moveReceived'])
    expect(ctx.chessRef.current.fen()).toBe(AFTER_E4)
    expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
})

test('move_made with an invalid FEN still activates the clock (legacy order) and then throws', () => {
    const { fire, dispatched } = makeCtx()
    expect(() => fire('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: 'garbage', san: 'e4' })).toThrow()
    expect(dispatched()).toEqual([{ type: 'clockActivated' }])
})

test('move_made checkmate: game over from the side that just moved; end sound reflects my colour', () => {
    const { fire, dispatched } = makeCtx({ myColor: 'black' })
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    fire('move_made', { game_id: 'g1', from: 'd8', to: 'h4', fen: mated, san: 'Qh4#' })
    expect(dispatched()).toContainEqual({ type: 'gameEnded', info: { result: 'Black wins', reason: 'Checkmate' } })
    expect(sounds.playGameEndSound).toHaveBeenCalledWith(true)
})

test('soundOn=false silences move and end sounds', () => {
    const { fire } = makeCtx({ soundOn: false })
    fire('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
    fire('game_end', { game_id: 'g1', result: 'White wins', reason: 'Timeout' })
    expect(sounds.playMoveSound).not.toHaveBeenCalled()
    expect(sounds.playGameEndSound).not.toHaveBeenCalled()
})

test('rating_updated sets white before reading black (partial payload keeps the white change)', () => {
    const { fire, dispatched } = makeCtx()
    expect(() => fire('rating_updated', { white: { change: 8 } })).toThrow()
    expect(dispatched()).toEqual([{ type: 'ratingChanged', side: 'white', change: 8 }])
})

test('rematch_request shows the toast and expires it after exactly 30 s', () => {
    jest.useFakeTimers()
    const { fire, dispatched } = makeCtx()
    fire('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
    jest.advanceTimersByTime(29_999)
    expect(dispatched()).toEqual([{ type: 'rematchReceived', fromUsername: 'Bob' }])
    jest.advanceTimersByTime(1)
    expect(dispatched()[1]).toEqual({ type: 'rematchExpired' })
    jest.useRealTimers()
})

test('rematch_ready navigates; opponent events go to the disconnect state (20 s default)', () => {
    const { ctx, fire } = makeCtx()
    fire('rematch_ready', { game_id: 'g2' })
    expect(ctx.router.push).toHaveBeenCalledWith('/game/g2')
    fire('opponent_disconnected', {})
    expect(ctx.markDisconnected).toHaveBeenCalledWith(20)
    fire('opponent_reconnected')
    expect(ctx.markReconnected).toHaveBeenCalled()
})

test('game_state_sync: position first, history only when the log is non-empty, then marks clocks synced', () => {
    const { ctx, fire, dispatched } = makeCtx()
    fire('game_state_sync', { fen: AFTER_E4, moveLog: [], whiteMs: 1000, blackMs: 2000, clockActive: true })
    expect(dispatched()).toEqual([
        { type: 'positionSet', fen: AFTER_E4 },
        { type: 'stateSynced', history: null, whiteMs: 1000, blackMs: 2000, clockActive: true },
    ])
    expect(ctx.lastProcessedFenRef.current).toBe(AFTER_E4)
    expect(ctx.clockSyncedRef.current).toBe(true)
})

test('clock_sync subtracts lag from the side to move only', () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const { ctx, fire, dispatched } = makeCtx()
    fire('clock_sync', { whiteMs: 125_000, blackMs: 60_000, serverTs: 8_000 })
    expect(dispatched()).toEqual([{ type: 'clockSynced', whiteMs: 123_000, blackMs: 60_000 }])
    expect(ctx.clockSyncedRef.current).toBe(true)
    ;(Date.now as jest.Mock).mockRestore()
})
