/**
 * features/game/commands.ts — every command that the server can refuse waits for the ack and
 * tells the player when it was refused [ACKS] (NODE-13).
 */
import * as commands from '@/features/game/commands'
import { createInitialGameState } from '@/features/game/state/gameReducer'

type Ack = (res: unknown) => void

function setup(ackWith: unknown) {
    const emit = jest.fn((_event: string, _payload: unknown, ack?: Ack) => ack?.(ackWith))
    const notify = jest.fn()
    const dispatch = jest.fn()
    const state = {
        ...createInitialGameState(),
        myColor: 'white' as const,
        chatMsg: ' gg ',
        gameData: { white_id: 'me', black_id: 'opp', time_control: '10+0', is_rated: true } as never,
    }
    const ctx = { socket: { emit } as never, myProfile: { id: 'me', username: 'me' } as never, gameId: 'g1', state, dispatch, notify }
    return { ctx, emit, notify, dispatch }
}

const REFUSED = { ok: false, error: 'game_not_active' }

test.each([
    ['sendChat', 'send_message'],
    ['resign', 'resign'],
    ['requestRematch', 'rematch_request'],
    ['acceptRematch', 'rematch_accept'],
    ['declineRematch', 'rematch_decline'],
] as const)('%s: a refusal is shown to the player', (command, event) => {
    const { ctx, emit, notify } = setup(REFUSED)
    commands[command](ctx)
    expect(emit.mock.calls[0][0]).toBe(event)
    expect(typeof emit.mock.calls[0][2]).toBe('function')
    expect(notify).toHaveBeenCalledWith('The game is already over.')
})

test.each(['sendChat', 'resign', 'requestRematch', 'acceptRematch', 'declineRematch'] as const)(
    '%s: an accepted command shows nothing',
    (command) => {
        const { ctx, notify } = setup({ ok: true })
        commands[command](ctx)
        expect(notify).not.toHaveBeenCalled()
    },
)

test('a refused rematch request does not stay "sent"', () => {
    const { ctx, dispatch } = setup({ ok: false, error: 'no_pending_request' })
    commands.requestRematch(ctx)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'rematchStateSet', value: 'idle' })
})

test('an illegal or late move is explained; the board itself is restored by the server resync', () => {
    // useChessBoard emits make_move with the same ack helper; this pins the message the player sees.
    const { rejectionMessage } = jest.requireActual('@/lib/socket/ack')
    expect(rejectionMessage('time_expired')).toBe('Your time ran out before the move arrived.')
})

describe('a server that never answers [ACKS] (F-065)', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    function silent() {
        const emit = jest.fn()
        const notify = jest.fn()
        const dispatch = jest.fn()
        const state = {
            ...createInitialGameState(),
            myColor: 'white' as const,
            chatMsg: 'gg',
            gameData: { white_id: 'me', black_id: 'opp', time_control: '10+0', is_rated: true } as never,
        }
        const ctx = { socket: { emit } as never, myProfile: { id: 'me', username: 'me' } as never, gameId: 'g1', state, dispatch, notify }
        return { ctx, emit, notify, dispatch }
    }

    // Not idempotent on the server: sent once, the timeout is reported, never re-sent.
    test.each(['sendChat', 'resign', 'requestRematch', 'acceptRematch'] as const)('%s: told after the timeout, not re-sent', (command) => {
        const { ctx, emit, notify } = silent()
        commands[command](ctx)
        jest.advanceTimersByTime(8_000)
        expect(emit).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith('The server did not answer. Check your connection and try again.')
    })

    test('requestRematch: a timeout resets the rematch state, like a refusal', () => {
        const { ctx, dispatch } = silent()
        commands.requestRematch(ctx)
        jest.advanceTimersByTime(8_000)
        expect(dispatch).toHaveBeenLastCalledWith({ type: 'rematchStateSet', value: 'idle' })
    })

    test('declineRematch is idempotent: retried once, then told', () => {
        const { ctx, emit, notify } = silent()
        commands.declineRematch(ctx)
        jest.advanceTimersByTime(8_000)
        expect(emit).toHaveBeenCalledTimes(2)
        jest.advanceTimersByTime(8_000)
        expect(notify).toHaveBeenCalledTimes(1)
    })
})
