/**
 * lib/socket/ack.ts — reading the server's acknowledgement of a client emit [ACKS] (NODE-13).
 */
import { onRejected, rejectionMessage } from '@/lib/socket/ack'

test('a rejection calls the handler with the reason code', () => {
    const handler = jest.fn()
    onRejected(handler)({ ok: false, error: 'game_not_active' })
    expect(handler).toHaveBeenCalledWith('game_not_active')
})

test.each([[{ ok: true }], [undefined], [null], ['garbage'], [{}]])('%p is not a rejection', (ack) => {
    const handler = jest.fn()
    onRejected(handler)(ack as never)
    expect(handler).not.toHaveBeenCalled()
})

test('a rejection without a reason is reported as internal_error', () => {
    const handler = jest.fn()
    onRejected(handler)({ ok: false })
    expect(handler).toHaveBeenCalledWith('internal_error')
})

test.each([
    ['game_not_active', 'The game is already over.'],
    ['not_a_player', 'Only the players of this game can do that.'],
    ['not_your_turn', "It is not your turn."],
    ['time_expired', 'Your time ran out before the move arrived.'],
    ['invalid_time_control', 'That time control is not available.'],
    ['invalid_payload', 'The server did not accept that request.'],
    ['internal_error', 'Something went wrong on the server. Please try again.'],
    ['something_new', 'Something went wrong on the server. Please try again.'],
])('%s → a sentence a player understands', (code, text) => {
    expect(rejectionMessage(code)).toBe(text)
})

describe('emitWithAck: timeout and the one-retry policy [ACKS] (F-065)', () => {
    const { emitWithAck, ACK_TIMEOUT_MS, ACK_TIMEOUT_CODE, ACK_POLICY } = jest.requireActual('@/lib/socket/ack')

    /** A socket whose acks the test answers by hand: `answer(i, ack)` answers the i-th emit. */
    function fakeSocket() {
        const calls: Array<{ event: string; payload: unknown; ack: (a?: unknown) => void }> = []
        return {
            calls,
            emit: jest.fn((event: string, payload: unknown, ack: (a?: unknown) => void) => {
                calls.push({ event, payload, ack })
            }),
            answer: (i: number, ack?: unknown) => calls[i].ack(ack),
        }
    }

    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const handlers = () => ({ onAccepted: jest.fn(), onRejected: jest.fn() })

    test('an ok ack calls onAccepted once; a refusal calls onRejected with the code', () => {
        const socket = fakeSocket()
        const ok = handlers()
        emitWithAck(socket, 'challenge_request', { to_user_id: 'b' }, ok)
        expect(socket.emit).toHaveBeenCalledWith('challenge_request', { to_user_id: 'b' }, expect.any(Function))
        socket.answer(0, { ok: true })
        socket.answer(0, { ok: true })
        expect(ok.onAccepted).toHaveBeenCalledTimes(1)
        expect(ok.onRejected).not.toHaveBeenCalled()

        const refused = handlers()
        emitWithAck(socket, 'challenge_request', {}, refused)
        socket.answer(1, { ok: false, error: 'invalid_target' })
        expect(refused.onRejected).toHaveBeenCalledWith('invalid_target')
        jest.advanceTimersByTime(ACK_TIMEOUT_MS * 3)
        expect(refused.onRejected).toHaveBeenCalledTimes(1)
    })

    test.each(['make_move', 'resign', 'send_message', 'challenge_request', 'challenge_accept', 'rematch_request', 'rematch_accept'])(
        'non-idempotent %s is never re-sent: after the timeout the caller is told ack_timeout',
        (event) => {
            const socket = fakeSocket()
            const h = handlers()
            emitWithAck(socket, event, {}, h)
            jest.advanceTimersByTime(ACK_TIMEOUT_MS - 1)
            expect(h.onRejected).not.toHaveBeenCalled()
            jest.advanceTimersByTime(1)
            expect(h.onRejected).toHaveBeenCalledWith(ACK_TIMEOUT_CODE)
            jest.advanceTimersByTime(ACK_TIMEOUT_MS * 3)
            expect(socket.emit).toHaveBeenCalledTimes(1)
            expect(h.onRejected).toHaveBeenCalledTimes(1)
        },
    )

    test.each(['join_queue', 'leave_queue', 'join_game', 'spectate_game', 'challenge_decline', 'rematch_decline'])(
        'idempotent %s is re-sent exactly once; a second timeout reports ack_timeout',
        (event) => {
            const socket = fakeSocket()
            const h = handlers()
            emitWithAck(socket, event, { x: 1 }, h)
            jest.advanceTimersByTime(ACK_TIMEOUT_MS)
            expect(socket.emit).toHaveBeenCalledTimes(2)
            expect(socket.calls[1].payload).toEqual({ x: 1 })
            expect(h.onRejected).not.toHaveBeenCalled()
            jest.advanceTimersByTime(ACK_TIMEOUT_MS)
            expect(h.onRejected).toHaveBeenCalledWith(ACK_TIMEOUT_CODE)
            jest.advanceTimersByTime(ACK_TIMEOUT_MS * 3)
            expect(socket.emit).toHaveBeenCalledTimes(2)
        },
    )

    test('the retry answering ok settles the call; a late ack of the first attempt is ignored then', () => {
        const socket = fakeSocket()
        const h = handlers()
        emitWithAck(socket, 'join_queue', {}, h)
        jest.advanceTimersByTime(ACK_TIMEOUT_MS)
        socket.answer(1, { ok: true })
        socket.answer(0, { ok: false, error: 'internal_error' })
        expect(h.onAccepted).toHaveBeenCalledTimes(1)
        expect(h.onRejected).not.toHaveBeenCalled()
    })

    test('a late ack of the first attempt still counts while the retry is pending', () => {
        const socket = fakeSocket()
        const h = handlers()
        emitWithAck(socket, 'join_queue', {}, h)
        jest.advanceTimersByTime(ACK_TIMEOUT_MS)
        socket.answer(0, { ok: true })
        jest.advanceTimersByTime(ACK_TIMEOUT_MS * 2)
        expect(h.onAccepted).toHaveBeenCalledTimes(1)
        expect(h.onRejected).not.toHaveBeenCalled()
    })

    test('a repeated decline that finds nothing pending means the first one went through', () => {
        const socket = fakeSocket()
        const h = handlers()
        emitWithAck(socket, 'challenge_decline', { from_user_id: 'a' }, h)
        jest.advanceTimersByTime(ACK_TIMEOUT_MS)
        socket.answer(1, { ok: false, error: 'no_pending_request' })
        expect(h.onAccepted).toHaveBeenCalledTimes(1)
        expect(h.onRejected).not.toHaveBeenCalled()
    })

    test('a first decline that finds nothing pending is a real refusal (the challenge expired)', () => {
        const socket = fakeSocket()
        const h = handlers()
        emitWithAck(socket, 'challenge_decline', { from_user_id: 'a' }, h)
        socket.answer(0, { ok: false, error: 'no_pending_request' })
        expect(h.onRejected).toHaveBeenCalledWith('no_pending_request')
    })

    test('an unknown event is treated as not idempotent', () => {
        expect(ACK_POLICY.some_future_event).toBeUndefined()
        const socket = fakeSocket()
        const h = handlers()
        emitWithAck(socket, 'some_future_event', {}, h)
        jest.advanceTimersByTime(ACK_TIMEOUT_MS * 2)
        expect(socket.emit).toHaveBeenCalledTimes(1)
        expect(h.onRejected).toHaveBeenCalledWith(ACK_TIMEOUT_CODE)
    })

    test('the timeout and the new reasons have sentences', () => {
        const { rejectionMessage: message } = jest.requireActual('@/lib/socket/ack')
        expect(message(ACK_TIMEOUT_CODE)).toBe('The server did not answer. Check your connection and try again.')
        expect(message('profile_not_found')).toBe('Your profile could not be found. Please sign in again.')
        expect(message('rate_limited')).toBe('Too many requests. Please wait a moment and try again.')
        expect(message('invalid_target')).toBe('You cannot challenge yourself.')
    })
})
