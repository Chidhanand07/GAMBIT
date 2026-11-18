/**
 * app/lobby/page.tsx — picking a time control, queueing, cancelling,
 * being sent to the game on a match, and creating a private invite.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, prefetch: _p, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
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
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount: 42, onlineUserIds: new Set(['f-on', 'f-away']), awayUserIds: new Set(['f-away']) }) }))

import LobbyPage from '@/app/lobby/page'

const liveGames = [{
    id: 'live-1', time_control: '3+0', category: 'blitz', move_number: 21, started_at: null,
    white: { username: 'alice', display_name: null, avatar_url: null, rating: 1228 },
    black: { username: 'bob', display_name: null, avatar_url: null, rating: 1200 },
}]
const friends = [
    { id: 'f-off', username: 'zed', display_name: null, avatar_url: null, rating_rapid: 1100.4, rating_blitz: 1050, friendship_id: 'x' },
    { id: 'f-on', username: 'amy', display_name: 'Amy', avatar_url: null, rating_rapid: 1376, rating_blitz: 1239, friendship_id: 'y' },
    { id: 'f-away', username: 'moe', display_name: null, avatar_url: null, rating_rapid: 1200, rating_blitz: 1200, friendship_id: 'z' },
]

let fetchMock: jest.Mock
beforeEach(() => {
    push.mockClear()
    socket.emit.mockClear()
    handlers.clear()
    profile = { id: 'me', username: 'me1', rating_blitz: 1400 }
    fetchMock = jest.fn(async (url: string) => {
        if (url === '/api/games/active') return { ok: true, json: async () => null }
        if (url === '/api/games/live') return { ok: true, json: async () => liveGames }
        if (url === '/api/friends') return { ok: true, json: async () => friends }
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
    expect(screen.getByText('Finding an opponent...')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(socket.emit).toHaveBeenCalledWith('leave_queue', 'me')
    expect(screen.queryByText('Finding an opponent...')).not.toBeInTheDocument()
})

test('the search line shows the real rating range from the server (Main.dc.html) [F-132]', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    expect(screen.getByRole('status')).not.toHaveTextContent('rating range')
    serverSends('queue_joined', { position: 1, estimated_wait: 10, search_window: { min: 925, max: 1125 } })
    expect(screen.getByRole('status')).toHaveTextContent(/· rating range 925 to 1125 · 0:00/)
    serverSends('search_window', { min: null, max: null })
    expect(screen.getByRole('status')).toHaveTextContent(/· any rating · 0:00/)
})

test('a match sends the player to the game page', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    serverSends('match_found', { id: 'game-77', white_id: 'me', black_id: 'x' })
    expect(push).toHaveBeenCalledWith('/game/game-77')
})

test('signed-out visitors are sent to log in, and back to the lobby afterwards, instead of queueing [F10]', async () => {
    profile = null
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Play Online'))
    // Was: '/login' with no redirect, so signing in landed on the default page.
    expect(push).toHaveBeenCalledWith('/login?redirect=%2Flobby')
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

// Redesign: Computer opens the MAVERICK setup; Start game opens the offline board with the choice.
test('Computer opens the MAVERICK setup; Start game links to the offline board with difficulty and side', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Computer' }))
    expect(screen.getByText('Play MAVERICK')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Medium/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Start game' })).toHaveAttribute('href', '/offline?difficulty=medium&side=w')
    await userEvent.click(screen.getByRole('button', { name: /Hard/ }))
    await userEvent.click(screen.getByRole('button', { name: /Black/ }))
    expect(screen.getByRole('link', { name: 'Start game' })).toHaveAttribute('href', '/offline?difficulty=hard&side=b')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Play MAVERICK')).not.toBeInTheDocument()
})

test('Friend lists my friends, online first, and Challenge opens the challenge page for online ones', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Friend' }))
    expect(await screen.findByText('Amy')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/friends')
    // F-125 (was: always the rapid rating): the rating of the selected time control's pool, Blitz by default.
    expect(screen.getByText('Online · 1239')).toBeInTheDocument()
    expect(screen.getByText('Offline · 1050')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Challenge Amy' })).toHaveAttribute('href', '/challenge/amy')
    // Away (every tab idle) can still be challenged, as in Main.dc.html [LIVE-2].
    expect(screen.getByText('Away · 1200')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Challenge moe' })).toHaveAttribute('href', '/challenge/moe')
    expect(screen.queryByRole('link', { name: 'Challenge zed' })).not.toBeInTheDocument()
})

test('Friend: picking Rapid shows each friend\'s rapid rating [F-125]', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByText('Rapid'))
    await userEvent.click(screen.getByRole('button', { name: 'Friend' }))
    expect(await screen.findByText('Online · 1376')).toBeInTheDocument()
    expect(screen.getByText('Offline · 1100')).toBeInTheDocument()
})

test('live games list both players with ratings and a Watch link to the game', async () => {
    render(<LobbyPage />)
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('1 now')).toBeInTheDocument()
    expect(screen.getByText('Blitz 3+0 · move 21')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Watch alice vs bob' })).toHaveAttribute('href', '/game/live-1')
})

test('each live game shows how many watch it, from the game server (Main.dc.html) [F-130]', async () => {
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: (a: unknown) => void) => {
        if (event === 'spectator_counts') ack?.({ ok: true, counts: { 'live-1': 4 } })
    })
    render(<LobbyPage />)
    expect(await screen.findByText('4 watching')).toBeInTheDocument()
    expect(socket.emit).toHaveBeenCalledWith('spectator_counts', { game_ids: ['live-1'] }, expect.any(Function))
    socket.emit.mockReset()
})

test('creating a private game shows an invite link and joins its room', async () => {
    render(<LobbyPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Friend' }))
    await userEvent.click(screen.getByRole('button', { name: 'Invite with a link' }))
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
