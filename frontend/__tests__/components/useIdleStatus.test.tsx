import { act, renderHook } from '@testing-library/react'
import { useIdleStatus } from '@/components/useIdleStatus'

const IDLE = 60_000

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
}

describe('useIdleStatus [LIVE-2]', () => {
    test('away after the threshold without input; any input brings it back', () => {
        const { result } = renderHook(() => useIdleStatus(true, IDLE))
        expect(result.current).toBe('online')
        act(() => { jest.advanceTimersByTime(IDLE - 1) })
        expect(result.current).toBe('online')
        act(() => { jest.advanceTimersByTime(1) })
        expect(result.current).toBe('away')
        act(() => { window.dispatchEvent(new Event('keydown')) })
        expect(result.current).toBe('online')
        act(() => { jest.advanceTimersByTime(IDLE) })
        expect(result.current).toBe('away')
    })

    test('input restarts the countdown', () => {
        const { result } = renderHook(() => useIdleStatus(true, IDLE))
        act(() => { jest.advanceTimersByTime(IDLE / 2) })
        act(() => { window.dispatchEvent(new Event('pointerdown')) })
        act(() => { jest.advanceTimersByTime(IDLE - 1) })
        expect(result.current).toBe('online')
    })

    test('a hidden tab goes away on the same timer; becoming visible is activity', () => {
        const { result } = renderHook(() => useIdleStatus(true, IDLE))
        act(() => { setVisibility('hidden') })
        act(() => { jest.advanceTimersByTime(IDLE) })
        expect(result.current).toBe('away')
        act(() => { setVisibility('visible') })
        expect(result.current).toBe('online')
    })

    test('disabled (signed out): always online, no timer', () => {
        const { result } = renderHook(() => useIdleStatus(false, IDLE))
        act(() => { jest.advanceTimersByTime(IDLE * 2) })
        expect(result.current).toBe('online')
    })
})
