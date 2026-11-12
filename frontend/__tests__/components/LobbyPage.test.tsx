/**
 * app/lobby/page.tsx — picking a time control, queueing, cancelling,
 * being sent to the game on a match, and creating a private invite.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

type Handler = (payload: any) => void
const handlers = new Map<string, Set<Handler>>()
const socket = {
    emit: jest.fn(),
    on: jest.fn((e: string, h: Handler) => { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e)!.add(h) }),
    off: jest.fn((e: string, h: Handler) => { handlers.get(e)?.delete(h) }),
}
const serverSends = (event: string, payload: any) => act(() => { handlers.get(event)?.forEach(h => h(payload)) })

let profile: any = { id: 'me', username: 'me1', rating_blitz: 1400 }
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socket }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile }) }))
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount: 42 }) }))

import LobbyPage from '@/app/lobby/page'

let fetchMock: jest.Mock
beforeEach(() => {
    push.mockClear()
    socket.emit.mockClear()
    handlers.clear()
    profile = { id: 'me', username: 'me1', rating_blitz: 1400 }
    fetchMock = jest.fn(async (url: string) => {
        if (url === '/api/games/active') return { ok: true, json: async () => null }
        if (url === '/api/games/private/create') return { ok: true, json: async () => ({ token: 'abc123XYZ0', game_id: 'g-priv' }) }
        return { ok: false, json: async () => ({}) }
    })
    ;(global as any).fetch = fetchMock
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const joinQueueCalls = () => socket.emit.mock.calls.filter(([e]) => e === 'join_queue')

test('Play Online with the default (Blitz) queues for a 3-minute game', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    expect(joinQueueCalls()).toHaveLength(1)
    expect(joinQueueCalls()[0][1]).toMatchObject({ user: { id: 'me' }, time_control: '3+0', increment: 0 })
    expect(screen.getByText('Finding opponent…')).toBeInTheDocument()
})

test.each([
    ['Bullet', '1'],
    ['Rapid', '10'],
    ['Classical', '30'],
])('choosing %s queues for %s minutes', async (label, minutes) => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText(label))
    await userEvent.click(screen.getByText('Play Online'))
    expect(joinQueueCalls()[0][1].time_control).toBe(`${minutes}+0`)
})

test('Cancel search leaves the queue', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    await userEvent.click(screen.getByText('Cancel search'))
    expect(socket.emit).toHaveBeenCalledWith('leave_queue', 'me')
    expect(screen.queryByText('Finding opponent…')).not.toBeInTheDocument()
})

test('a match sends the player to the game page', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    serverSends('match_found', { id: 'game-77', white_id: 'me', black_id: 'x' })
    expect(push).toHaveBeenCalledWith('/game/game-77')
})

test('signed-out visitors are sent to log in instead of queueing', async () => {
    profile = null
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    expect(push).toHaveBeenCalledWith('/login')
    expect(joinQueueCalls()).toHaveLength(0)
})

test('a player already in a game is warned instead of queued', async () => {
    fetchMock.mockImplementation(async (url: string) =>
        url === '/api/games/active'
            ? { ok: true, json: async () => ({ id: 'live-1', time_control: '10' }) }
            : { ok: false, json: async () => ({}) })
    render(<LobbyPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/active'))
    await act(async () => {})
    await userEvent.click(screen.getByText('Play Online'))
    expect(joinQueueCalls()).toHaveLength(0)
    expect(screen.getByText('Game already in progress')).toBeInTheDocument()
    await userEvent.click(screen.getByText(/Return to my game/))
    expect(push).toHaveBeenCalledWith('/game/live-1')
})

test('Computer opens the offline board', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Computer'))
    expect(push).toHaveBeenCalledWith('/offline')
})

test('creating a private game shows an invite link and joins its room', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Friend' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Generate Invite Link' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/private/create', expect.anything()))
    const body = JSON.parse(fetchMock.mock.calls.find(([u]) => u === '/api/games/private/create')![1].body)
    // F9: the real time control of the Rapid option, not the option id.
    expect(body).toEqual({ timeControl: '10+0', color: 'random', isRated: false })

    expect(await screen.findByText(/\/join\/abc123XYZ0/)).toBeInTheDocument()
    expect(socket.emit).toHaveBeenCalledWith('join_game', 'g-priv')

    serverSends('game_start', { id: 'g-priv' })
    expect(push).toHaveBeenCalledWith('/game/g-priv')
})

// The old todo here (private games sent "rapid", which the server played as 10 minutes) is fixed: F9, TIME-CONTROL.
