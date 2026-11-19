import { renderHook } from '@testing-library/react'
import { parseEstimate, useResignEstimate } from '@/features/game/hooks/useResignEstimate'

describe('useResignEstimate [F-133]', () => {
    const socketAnswering = (answer: unknown) => ({
        emit: jest.fn((_e: string, _p: unknown, ack: (a: unknown) => void) => ack(answer)),
    })

    test('asks only while the dialog is open, and returns the server\'s figure', () => {
        const socket = socketAnswering({ ok: true, rated: true, points: 9 })
        const { result, rerender } = renderHook(({ open }) => useResignEstimate({ socket: socket as any, gameId: 'g', open }), {
            initialProps: { open: false },
        })
        expect(socket.emit).not.toHaveBeenCalled()
        expect(result.current).toBeNull()
        rerender({ open: true })
        expect(socket.emit).toHaveBeenCalledWith('rating_estimate', { game_id: 'g' }, expect.any(Function))
        expect(result.current).toEqual({ rated: true, points: 9 })
        rerender({ open: false })
        expect(result.current).toBeNull()
    })

    test('a refusal or a malformed answer gives no figure', () => {
        const refusing = socketAnswering({ ok: false, error: 'not_a_player' })
        expect(renderHook(() => useResignEstimate({ socket: refusing as any, gameId: 'g', open: true })).result.current).toBeNull()
        const garbled = socketAnswering({ ok: true, rated: true, points: -3 })
        expect(renderHook(() => useResignEstimate({ socket: garbled as any, gameId: 'g', open: true })).result.current).toBeNull()
    })

    test('parseEstimate', () => {
        expect(parseEstimate({ ok: true, rated: false })).toEqual({ rated: false })
        expect(parseEstimate({ ok: true, rated: true, points: 0 })).toEqual({ rated: true, points: 0 })
        expect(parseEstimate({ ok: true, rated: true, points: 2.5 })).toBeNull()
        expect(parseEstimate(null)).toBeNull()
    })
})
