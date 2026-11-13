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
