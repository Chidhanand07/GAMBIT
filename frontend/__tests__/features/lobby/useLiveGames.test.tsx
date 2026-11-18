import { act, renderHook, waitFor } from '@testing-library/react'
import { LIVE_GAMES_REFRESH_MS, useLiveGames } from '@/features/lobby/hooks/useLiveGames'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const g = (id: string) => ({ id, time_control: '3+0', category: 'blitz', move_number: 1, started_at: null, white: {}, black: {} })

let fetchMock: jest.Mock
beforeEach(() => {
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

test('reads GET /api/games/live on mount', async () => {
    fetchMock.mockResolvedValue(ok([g('a')]))
    const { result } = renderHook(() => useLiveGames())
    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current).toEqual([g('a')]))
    expect(fetchMock).toHaveBeenCalledWith('/api/games/live')
})

test('refreshes every LIVE_GAMES_REFRESH_MS and keeps the last list when a refresh fails', async () => {
    jest.useFakeTimers()
    fetchMock.mockResolvedValueOnce(ok([g('a')]))
    const { result } = renderHook(() => useLiveGames())
    await act(async () => {})
    expect(result.current).toEqual([g('a')])

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    await act(async () => { jest.advanceTimersByTime(LIVE_GAMES_REFRESH_MS) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual([g('a')])

    fetchMock.mockResolvedValueOnce(ok([g('b')]))
    await act(async () => { jest.advanceTimersByTime(LIVE_GAMES_REFRESH_MS) })
    expect(result.current).toEqual([g('b')])
})

test('stops refreshing on unmount', async () => {
    jest.useFakeTimers()
    fetchMock.mockResolvedValue(ok([]))
    const { unmount } = renderHook(() => useLiveGames())
    await act(async () => {})
    unmount()
    act(() => { jest.advanceTimersByTime(LIVE_GAMES_REFRESH_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
})
