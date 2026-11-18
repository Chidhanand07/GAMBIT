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
    const { result } = renderHook(() => useLiveGames(null))
    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current).toEqual([g('a')]))
    expect(fetchMock).toHaveBeenCalledWith('/api/games/live')
})

test('refreshes every LIVE_GAMES_REFRESH_MS and keeps the last list when a refresh fails', async () => {
    jest.useFakeTimers()
    fetchMock.mockResolvedValueOnce(ok([g('a')]))
    const { result } = renderHook(() => useLiveGames(null))
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
    const { unmount } = renderHook(() => useLiveGames(null))
    await act(async () => {})
    unmount()
    act(() => { jest.advanceTimersByTime(LIVE_GAMES_REFRESH_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
})

describe('watcher counts from the game server [F-130]', () => {
    /** A socket whose `spectator_counts` ack is `answer`. */
    const fakeSocket = (answer: unknown) => ({
        emit: jest.fn((_event: string, _payload: unknown, ack: (a: unknown) => void) => ack(answer)),
    })

    test('asks spectator_counts for the listed games and merges the counts', async () => {
        fetchMock.mockResolvedValue(ok([g('a'), g('b')]))
        const socket = fakeSocket({ ok: true, counts: { a: 3, b: 0 } })
        const { result } = renderHook(() => useLiveGames(socket as any))
        await waitFor(() => expect(result.current).toEqual([{ ...g('a'), watching: 3 }, { ...g('b'), watching: 0 }]))
        expect(socket.emit).toHaveBeenCalledWith('spectator_counts', { game_ids: ['a', 'b'] }, expect.any(Function))
    })

    test('a refused or malformed answer shows no count (never a made-up one)', async () => {
        fetchMock.mockResolvedValue(ok([g('a')]))
        const refusing = fakeSocket({ ok: false, error: 'rate_limited' })
        const refused = renderHook(() => useLiveGames(refusing as any))
        await waitFor(() => expect(refused.result.current).toEqual([g('a')]))
        const garbled = fakeSocket({ ok: true, counts: { a: 'many' } })
        const malformed = renderHook(() => useLiveGames(garbled as any))
        await waitFor(() => expect(malformed.result.current).toEqual([g('a')]))
        expect(malformed.result.current[0]).not.toHaveProperty('watching')
    })

    test('no socket: the list without counts', async () => {
        fetchMock.mockResolvedValue(ok([g('a')]))
        const { result } = renderHook(() => useLiveGames(null))
        await waitFor(() => expect(result.current).toEqual([g('a')]))
        expect(result.current[0]).not.toHaveProperty('watching')
    })
})
