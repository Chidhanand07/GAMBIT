/**
 * Characterization tests for app/lobby/page.tsx (PR 02/19).
 *
 * Complements __tests__/components/LobbyPage.test.tsx (which covers the basic
 * queue / cancel / match / private-invite happy paths) by pinning exact
 * payloads and the less-travelled branches: custom time control, reconnect
 * re-queue, search timer, active-game banner, private-game options and errors.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFakeSocket, jsonResponse } from './fakeSocket'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }: any) => <div data-testid="qr" data-value={value} /> }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const socket = createFakeSocket()
let profile: any = null
let onlineCount = 42
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socket }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile }) }))
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount }) }))

import LobbyPage from '@/app/lobby/page'

const ME = { id: 'me', username: 'me1', display_name: 'Me Display', rating_blitz: 1433.6, rating_rapid: 1501.2 }

let fetchMock: jest.Mock
let activeGame: any
let privateCreate: () => Promise<any>

beforeEach(() => {
    socket.reset()
    push.mockClear()
    profile = { ...ME }
    onlineCount = 42
    activeGame = null
    privateCreate = async () => jsonResponse({ token: 'tok_FAKE_0001', game_id: 'g-priv' })
    fetchMock = jest.fn(async (url: string) => {
        if (url === '/api/games/active') return jsonResponse(activeGame)
        if (url === '/api/games/private/create') return privateCreate()
        return jsonResponse({}, false)
    })
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

async function renderLobby() {
    const utils = render(<LobbyPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/active'))
    // let the fetch().then(json).then(setState) chain settle
    for (let i = 0; i < 5; i++) await act(async () => {})
    return utils
}
const click = (el: Element) => fireEvent.click(el)
const playOnline = () => click(screen.getByRole('button', { name: /Play Online/ }))

describe('mount & static content', () => {
    test('fetches /api/games/active exactly once, with no options', async () => {
        await renderLobby()
        expect(fetchMock.mock.calls).toEqual([['/api/games/active']])
    })

    test('subscribes only to match_found, game_start and connect (no queue_joined / queue_status handling)', async () => {
        await renderLobby()
        expect(socket.listenedEvents()).toEqual(['connect', 'game_start', 'match_found'])
        expect(socket.emit).not.toHaveBeenCalled()
    })

    test('welcome bar shows display name, online count and rounded blitz rating; quick stats show rapid rating', async () => {
        await renderLobby()
        expect(screen.getByText('Welcome back, Me Display')).toBeInTheDocument()
        expect(screen.getByText('42 players online')).toBeInTheDocument()
        expect(screen.getByText('1434')).toBeInTheDocument()
        expect(screen.getByText('Blitz rating')).toBeInTheDocument()
        expect(screen.getByText('1501')).toBeInTheDocument()
        expect(screen.getByText('Your rating')).toBeInTheDocument()
        expect(screen.getByText('No live games')).toBeInTheDocument()
    })

    test('singular "player" when exactly one is online; signed-out welcome; rating defaults to 1200', async () => {
        onlineCount = 1
        profile = null
        await renderLobby()
        expect(screen.getByText('1 player online')).toBeInTheDocument()
        expect(screen.getByText('Welcome to Gambit')).toBeInTheDocument()
        expect(screen.queryByText('Blitz rating')).not.toBeInTheDocument()
        expect(screen.getByText('1200')).toBeInTheDocument()
    })

    test('time-control cards list the six options with their labels', async () => {
        await renderLobby()
        for (const [label, time] of [
            ['Bullet', '1 min'], ['Blitz', '3 min'], ['Rapid', '10 min'],
            ['Classical', '30 min'], ['Custom', 'Configure'], ['Daily', '1 day/move'],
        ]) {
            expect(screen.getByText(label)).toBeInTheDocument()
            expect(screen.getByText(time)).toBeInTheDocument()
        }
        expect(screen.getByText('Popular')).toBeInTheDocument()
    })

    test('the "Play Offline" bar opens /offline', async () => {
        await renderLobby()
        click(screen.getByText('Play Offline'))
        expect(push).toHaveBeenCalledWith('/offline')
    })
})

describe('Play Online', () => {
    test('emits join_queue with the FULL profile object as user, the canonical "M+S" time control, and no is_rated', async () => {
        await renderLobby()
        playOnline()
        expect(socket.emit.mock.calls).toEqual([
            ['join_queue', { user: { ...ME }, time_control: '3+0', increment: 0 }],
        ])
    })

    test('Daily queues with time_control "1440+0"', async () => {
        await renderLobby()
        click(screen.getByText('Daily'))
        playOnline()
        expect(socket.emitted('join_queue')).toEqual([{ user: { ...ME }, time_control: '1440+0', increment: 0 }])
    })

    test('match_found falls back to game_id when id is missing', async () => {
        await renderLobby()
        playOnline()
        socket.serverSends('match_found', { game_id: 'gm-2', white_id: 'me', black_id: 'x' })
        expect(push).toHaveBeenCalledWith('/game/gm-2')
        expect(screen.queryByText('Finding opponent…')).not.toBeInTheDocument()
    })

    test('the search timer counts mm:ss while searching and resets after cancel', async () => {
        jest.useFakeTimers()
        await renderLobby()
        playOnline()
        expect(screen.getByText('00:00')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(65_000) })
        expect(screen.getByText('01:05')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Cancel search' }))
        expect(socket.emitted('leave_queue')).toEqual(['me'])
        playOnline()
        expect(screen.getByText('00:00')).toBeInTheDocument()
    })

    test('a socket reconnect while searching re-emits join_queue in a DIFFERENT shape ({id} only, is_rated: true)', async () => {
        await renderLobby()
        playOnline()
        socket.emit.mockClear()
        socket.serverSends('connect')
        expect(socket.emit.mock.calls).toEqual([
            ['join_queue', { user: { id: 'me' }, time_control: '3+0', increment: 0, is_rated: true }],
        ])
    })

    test('a socket reconnect while NOT searching emits nothing', async () => {
        await renderLobby()
        socket.serverSends('connect')
        expect(socket.emit).not.toHaveBeenCalled()
    })

    test('unmounting while searching does NOT emit leave_queue, but removes the listeners', async () => {
        const { unmount } = await renderLobby()
        playOnline()
        socket.emit.mockClear()
        unmount()
        expect(socket.emit).not.toHaveBeenCalled()
        expect(socket.listenedEvents()).toEqual([])
    })
})

describe('custom time control modal', () => {
    test('clicking Custom opens the modal without selecting it; backdrop closes it', async () => {
        await renderLobby()
        click(screen.getByText('Custom'))
        expect(screen.getByText('Custom Time Control')).toBeInTheDocument()
        expect(screen.getByText('5 min')).toBeInTheDocument()
        expect(screen.getByText('0s')).toBeInTheDocument()
        expect(screen.getByText('5+0')).toBeInTheDocument()
        const backdrop = screen.getByText('Custom Time Control').parentElement!.previousElementSibling!
        click(backdrop)
        expect(screen.queryByText('Custom Time Control')).not.toBeInTheDocument()
        playOnline()
        expect(socket.emitted('join_queue')[0].time_control).toBe('3+0')
    })

    test('sliders set minutes/increment; confirming queues with "M+I" and increment I', async () => {
        await renderLobby()
        click(screen.getByText('Custom'))
        const [minutes, increment] = screen.getAllByRole('slider')
        expect(minutes).toHaveAttribute('min', '1')
        expect(minutes).toHaveAttribute('max', '60')
        expect(increment).toHaveAttribute('min', '0')
        expect(increment).toHaveAttribute('max', '30')
        fireEvent.change(minutes, { target: { value: '12' } })
        fireEvent.change(increment, { target: { value: '5' } })
        expect(screen.getByText('12 min')).toBeInTheDocument()
        expect(screen.getByText('5s')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Play with this time control' }))
        expect(screen.queryByText('Custom Time Control')).not.toBeInTheDocument()
        // the Custom card now shows the chosen control instead of "Configure"
        expect(screen.getByText('12+5')).toBeInTheDocument()
        expect(screen.queryByText('Configure')).not.toBeInTheDocument()
        playOnline()
        expect(socket.emitted('join_queue')).toEqual([{ user: { ...ME }, time_control: '12+5', increment: 5 }])
    })

    test('reconnect re-queue for a custom control keeps the increment ("12+5") [TIME-CONTROL]', async () => {
        await renderLobby()
        click(screen.getByText('Custom'))
        const [minutes, increment] = screen.getAllByRole('slider')
        fireEvent.change(minutes, { target: { value: '12' } })
        fireEvent.change(increment, { target: { value: '5' } })
        click(screen.getByRole('button', { name: 'Play with this time control' }))
        playOnline()
        socket.emit.mockClear()
        socket.serverSends('connect')
        expect(socket.emitted('join_queue')).toEqual([{ user: { id: 'me' }, time_control: '12+5', increment: 5, is_rated: true }])
    })
})

describe('active game', () => {
    test('an active game shows a banner with a Resume link', async () => {
        activeGame = { id: 'live-9', time_control: '5' }
        await renderLobby()
        expect(await screen.findByText('You have an active game in progress')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Resume →' })).toHaveAttribute('href', '/game/live-9')
    })

    test('"Stay here" dismisses the warning; nothing is queued', async () => {
        activeGame = { id: 'live-9', time_control: '5' }
        await renderLobby()
        await screen.findByText('You have an active game in progress')
        playOnline()
        expect(screen.getByText('Game already in progress')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Stay here' }))
        expect(screen.queryByText('Game already in progress')).not.toBeInTheDocument()
        expect(socket.emitted('join_queue')).toEqual([])
    })

    test('a response without an id, a non-ok response, or a network error mean no active game', async () => {
        activeGame = { time_control: '5' }
        const first = await renderLobby()
        expect(screen.queryByText('You have an active game in progress')).not.toBeInTheDocument()
        first.unmount()

        fetchMock.mockImplementation(async () => jsonResponse({ id: 'x' }, false))
        const second = await renderLobby()
        expect(screen.queryByText('You have an active game in progress')).not.toBeInTheDocument()
        second.unmount()

        fetchMock.mockImplementation(async () => { throw new Error('offline') })
        await renderLobby()
        expect(screen.queryByText('You have an active game in progress')).not.toBeInTheDocument()
    })
})

describe('private game modal', () => {
    const openFriendModal = () => click(screen.getByRole('button', { name: 'Friend' }))
    const ratedToggle = () => screen.getByText('Rated game').parentElement!.parentElement!.querySelector('button')!

    test('shows six time controls, three colours and the rated toggle', async () => {
        await renderLobby()
        openFriendModal()
        expect(screen.getByText('Play a Friend')).toBeInTheDocument()
        for (const tc of ['bullet', 'blitz', 'rapid', 'classical', 'custom', 'daily']) {
            expect(screen.getByRole('button', { name: tc })).toBeInTheDocument()
        }
        for (const c of ['White', 'Black', 'Random']) {
            expect(screen.getByRole('button', { name: c })).toBeInTheDocument()
        }
        expect(screen.getByText('Affects Glicko-2 rating')).toBeInTheDocument()
    })

    test('chosen options are POSTed as {timeControl, color, isRated} with JSON headers', async () => {
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'blitz' }))
        click(screen.getByRole('button', { name: 'White' }))
        click(ratedToggle())
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        const call = fetchMock.mock.calls.find(([u]) => u === '/api/games/private/create')!
        expect(call[1]).toEqual({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeControl: '3+0', color: 'white', isRated: true }),
        })
    })

    test('private "custom" sends the lobby custom minutes+increment ("5+0" by default)', async () => {
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'custom' }))
        click(screen.getByRole('button', { name: 'Black' }))
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        const call = fetchMock.mock.calls.find(([u]) => u === '/api/games/private/create')!
        expect(JSON.parse(call[1].body)).toEqual({ timeControl: '5+0', color: 'black', isRated: false })
    })

    test('shows "Creating game…" while the request is in flight', async () => {
        let resolve!: (v: any) => void
        privateCreate = () => new Promise(r => { resolve = r })
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        expect(await screen.findByText('Creating game…')).toBeInTheDocument()
        await act(async () => { resolve(jsonResponse({ token: 'tok_FAKE_0002', game_id: 'g-3' })) })
        expect(screen.getByText('http://localhost/join/tok_FAKE_0002')).toBeInTheDocument()
        expect(screen.getByText('Valid for 48 hours')).toBeInTheDocument()
        expect(screen.getByTestId('qr')).toHaveAttribute('data-value', 'http://localhost/join/tok_FAKE_0002')
    })

    test('a response without a token logs the error and returns to the config step', async () => {
        const err = jest.spyOn(console, 'error').mockImplementation(() => {})
        privateCreate = async () => jsonResponse({ error: 'boom' })
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await waitFor(() => expect(err).toHaveBeenCalledWith('Private game error:', 'boom'))
        expect(screen.getByRole('button', { name: 'Generate Invite Link' })).toBeInTheDocument()
        expect(socket.emitted('join_game')).toEqual([])
    })

    test('a network error silently returns to the config step', async () => {
        privateCreate = async () => { throw new Error('offline') }
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        expect(await screen.findByRole('button', { name: 'Generate Invite Link' })).toBeInTheDocument()
    })

    test('a token without game_id shows the link but joins no room and "Open Game Room" does nothing', async () => {
        privateCreate = async () => jsonResponse({ token: 'tok_FAKE_0003' })
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        expect(socket.emitted('join_game')).toEqual([])
        click(screen.getByRole('button', { name: 'Open Game Room' }))
        expect(push).not.toHaveBeenCalled()
    })

    test('Copy writes the link to the clipboard and shows "✓ Copied" for 2 s', async () => {
        jest.useFakeTimers()
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        await act(async () => { click(screen.getByRole('button', { name: 'Copy' })) })
        expect(writeText).toHaveBeenCalledWith('http://localhost/join/tok_FAKE_0001')
        expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(2000) })
        expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    })

    test('"Open Game Room" navigates to the private game', async () => {
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        click(screen.getByRole('button', { name: 'Open Game Room' }))
        expect(push).toHaveBeenCalledWith('/game/g-priv')
    })

    test('closing the modal resets it to the config step on reopen', async () => {
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await screen.findByText('Share this link')
        const header = screen.getByText('Play a Friend')
        click(header.parentElement!.querySelector('button')!)
        expect(screen.queryByText('Play a Friend')).not.toBeInTheDocument()
        openFriendModal()
        expect(screen.getByRole('button', { name: 'Generate Invite Link' })).toBeInTheDocument()
    })
})
