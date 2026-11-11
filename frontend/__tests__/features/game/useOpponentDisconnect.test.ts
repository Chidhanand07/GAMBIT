import { act, renderHook } from '@testing-library/react'
import { useOpponentDisconnect } from '@/features/game/hooks/useOpponentDisconnect'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('counts down once per second and the interval clears itself at 0', () => {
    const { result } = renderHook(() => useOpponentDisconnect())
    act(() => result.current.markDisconnected(2))
    expect(result.current).toMatchObject({ opponentDisconnected: true, disconnectCountdown: 2 })
    expect(jest.getTimerCount()).toBe(1)
    act(() => { jest.advanceTimersByTime(1000) })
    expect(result.current.disconnectCountdown).toBe(1)
    act(() => { jest.advanceTimersByTime(1000) })
    expect(result.current.disconnectCountdown).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
    expect(result.current.opponentDisconnected).toBe(true)
})

test('a second disconnect while still disconnected resets the count without restarting the interval', () => {
    const { result } = renderHook(() => useOpponentDisconnect())
    act(() => result.current.markDisconnected(5))
    act(() => { jest.advanceTimersByTime(2000) })
    act(() => result.current.markDisconnected(10))
    expect(jest.getTimerCount()).toBe(1)
    act(() => { jest.advanceTimersByTime(1000) })
    expect(result.current.disconnectCountdown).toBe(9)
})

test('reconnect clears the banner state and the interval; a 0 s timeout never starts one', () => {
    const { result } = renderHook(() => useOpponentDisconnect())
    act(() => result.current.markDisconnected(5))
    act(() => result.current.markReconnected())
    expect(result.current).toMatchObject({ opponentDisconnected: false, disconnectCountdown: 0 })
    expect(jest.getTimerCount()).toBe(0)
    act(() => result.current.markDisconnected(0))
    expect(jest.getTimerCount()).toBe(0)
})

test('callbacks are stable across renders (safe to omit from the socket effect deps)', () => {
    const { result, rerender } = renderHook(() => useOpponentDisconnect())
    const first = result.current
    rerender()
    expect(result.current.markDisconnected).toBe(first.markDisconnected)
    expect(result.current.markReconnected).toBe(first.markReconnected)
})
