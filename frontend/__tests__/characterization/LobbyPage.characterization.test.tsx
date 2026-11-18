/**
 * Characterization tests for app/lobby/page.tsx (PR 02/19).
 *
 * Complements __tests__/components/LobbyPage.test.tsx (which covers the basic
 * queue / cancel / match / private-invite happy paths) by pinning exact
 * payloads and the less-travelled branches: custom time control, reconnect
 * re-queue, search timer, active-game banner, private-game options and errors.
 */
import { AXE_TIMEOUT_MS, expectAccessible } from '../helpers/axe'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount, onlineUserIds: new Set<string>(), awayUserIds: new Set<string>() }) }))
const toast = jest.fn()
jest.mock('@/components/Toast', () => ({ useToast: () => ({ toast }) }))

import LobbyPage from '@/app/lobby/page'

const ME = { id: 'me', username: 'me1', display_name: 'Me Display', rating_blitz: 1433.6, rating_rapid: 1501.2 }

let fetchMock: jest.Mock
let activeGame: any
let privateCreate: () => Promise<any>

beforeEach(() => {
    socket.reset()
    push.mockClear()
    toast.mockClear()
    profile = { ...ME }
    onlineCount = 42
    activeGame = null
    privateCreate = async () => jsonResponse({ token: 'tok_FAKE_0001', game_id: 'g-priv' })
    fetchMock = jest.fn(async (url: string) => {
        if (url === '/api/games/active') return jsonResponse(activeGame)
        if (url === '/api/games/live') return jsonResponse([])
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
    test('fetches /api/games/active exactly once, with no options (and the live games list)', async () => {
        await renderLobby()
        // Redesign: the "Live games" card now reads GET /api/games/live too.
        expect(fetchMock.mock.calls).toEqual([['/api/games/active'], ['/api/games/live']])
    })

    // Was: no queue_joined handling. queue_joined and search_window now carry the rating window (F-132).
    test('subscribes to match_found, match_failed, game_start, connect, queue_joined and search_window (no queue_status)', async () => {
        await renderLobby()
        expect(socket.listenedEvents()).toEqual([
            'connect', 'game_start', 'match_failed', 'match_found', 'queue_joined', 'search_window',
        ])
        expect(socket.emit).not.toHaveBeenCalled()
    })

    // Redesign: the online count moved to the app header ("N online" pill, AppHeader tests).
    test('welcome shows the display name; the rating card shows the rounded rating of the selected category', async () => {
        await renderLobby()
        expect(screen.getByText('Welcome back, Me Display')).toBeInTheDocument()
        expect(screen.getByText('1434')).toBeInTheDocument()
        expect(screen.getByText('Blitz rating')).toBeInTheDocument()
        click(screen.getByText('Rapid'))
        expect(screen.getByText('1501')).toBeInTheDocument()
        expect(screen.getByText('Rapid rating')).toBeInTheDocument()
        expect(screen.getByText('No live games right now.')).toBeInTheDocument()
    })

    test('signed-out welcome; no rating card; a missing category rating defaults to 1200', async () => {
        profile = null
        const first = await renderLobby()
        expect(screen.getByText('Welcome to Gambit')).toBeInTheDocument()
        expect(screen.queryByText('Blitz rating')).not.toBeInTheDocument()
        first.unmount()
        profile = { id: 'me', username: 'me1' }
        await renderLobby()
        expect(screen.getByText('Welcome back, me1')).toBeInTheDocument()
        expect(screen.getByText('1200')).toBeInTheDocument()
    })

    test('time-control cards list the six options with their labels', async () => {
        await renderLobby()
        // Redesign: the clock tiles show the minutes as a big number over "min".
        for (const [label, time] of [
            ['Bullet', '1'], ['Blitz', '3'], ['Rapid', '10'],
            ['Classical', '30'], ['Custom', 'Configure'], ['Daily', '1 day/move'],
        ]) {
            expect(screen.getByText(label)).toBeInTheDocument()
            expect(screen.getByText(time)).toBeInTheDocument()
        }
        expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
        expect(screen.getByText('Blitz · 3 min')).toBeInTheDocument()
        expect(screen.getByText('Popular')).toBeInTheDocument()
    })

    test('the "Play Offline" card links to /offline', async () => {
        await renderLobby()
        expect(screen.getByText('Play Offline')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Open board/ })).toHaveAttribute('href', '/offline')
    })
})

describe('Play Online', () => {
    test('emits join_queue in the one queue shape: {id} only, canonical "M+S", increment and is_rated [F8]', async () => {
        await renderLobby()
        playOnline()
        // Was: the FULL profile object as user and no is_rated (the reconnect re-queue used another shape).
        expect(socket.emit.mock.calls).toEqual([
            // The third argument is the ack callback: a refused join is reported (ACKS).
            ['join_queue', { user: { id: 'me' }, time_control: '3+0', increment: 0, is_rated: true }, expect.any(Function)],
        ])
    })

    test('Daily queues with time_control "1440+0"', async () => {
        await renderLobby()
        click(screen.getByText('Daily'))
        playOnline()
        expect(socket.emitted('join_queue')).toEqual([{ user: { id: 'me' }, time_control: '1440+0', increment: 0, is_rated: true }])
    })

    test('match_found falls back to game_id when id is missing', async () => {
        await renderLobby()
        playOnline()
        socket.serverSends('match_found', { game_id: 'gm-2', white_id: 'me', black_id: 'x' })
        expect(push).toHaveBeenCalledWith('/game/gm-2')
        expect(screen.queryByText('Finding an opponent...')).not.toBeInTheDocument()
    })

    test('the search timer counts m:ss while searching and resets after cancel', async () => {
        jest.useFakeTimers()
        await renderLobby()
        playOnline()
        expect(screen.getByText('0:00')).toBeInTheDocument()
        // The server accepts the join (since F-065 an unanswered join gives up after one retry).
        const ack = socket.emit.mock.calls.find(([e]) => e === 'join_queue')![2]
        act(() => { ack({ ok: true }) })
        act(() => { jest.advanceTimersByTime(65_000) })
        expect(screen.getByText('1:05')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Cancel' }))
        expect(socket.emitted('leave_queue')).toEqual(['me'])
        playOnline()
        expect(screen.getByText('0:00')).toBeInTheDocument()
    })

    test('a server that never answers join_queue: retried once, then the search stops with a message [ACKS]', async () => {
        jest.useFakeTimers()
        await renderLobby()
        playOnline()
        act(() => { jest.advanceTimersByTime(8_000) })
        expect(socket.emitted('join_queue')).toHaveLength(2)
        act(() => { jest.advanceTimersByTime(8_000) })
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
        expect(toast).toHaveBeenCalledWith('The server did not answer. Check your connection and try again.', 'error')
    })

    test('a socket reconnect while searching re-emits the SAME join_queue payload, with an ack [F8]', async () => {
        await renderLobby()
        playOnline()
        const [first] = socket.emitted('join_queue')
        socket.emit.mockClear()
        socket.serverSends('connect')
        // Was: a different shape and no ack, so a refused re-queue left the player "searching" forever.
        expect(socket.emit.mock.calls).toEqual([['join_queue', first, expect.any(Function)]])
    })

    test('the reconnect re-queue keeps the queued time control even if the selection changed meanwhile [F8]', async () => {
        await renderLobby()
        playOnline()
        socket.emit.mockClear()
        click(screen.getByText('Rapid')) // the cards stay mounted while searching
        socket.serverSends('connect')
        expect(socket.emitted('join_queue')).toEqual([{ user: { id: 'me' }, time_control: '3+0', increment: 0, is_rated: true }])
    })

    test('a refused reconnect re-queue stops the search and shows why [F8] [ACKS]', async () => {
        await renderLobby()
        playOnline()
        socket.emit.mockImplementationOnce((_e: string, _p: unknown, ack?: (res: unknown) => void) =>
            ack?.({ ok: false, error: 'invalid_time_control' }))
        socket.serverSends('connect')
        expect(screen.queryByText('Finding an opponent...')).not.toBeInTheDocument()
        expect(toast).toHaveBeenCalledWith('That time control is not available.', 'error')
    })

    test('match_found while not searching is ignored [F8]', async () => {
        await renderLobby()
        socket.serverSends('match_found', { id: 'stale', white_id: 'me', black_id: 'x' })
        expect(push).not.toHaveBeenCalled()
        playOnline()
        click(screen.getByRole('button', { name: 'Cancel' }))
        socket.serverSends('match_found', { id: 'stale-2', white_id: 'me', black_id: 'x' })
        expect(push).not.toHaveBeenCalled()
    })

    test('a socket reconnect while NOT searching emits nothing', async () => {
        await renderLobby()
        socket.serverSends('connect')
        expect(socket.emit).not.toHaveBeenCalled()
    })

    test('unmounting while searching leaves the queue and removes the listeners [F8]', async () => {
        const { unmount } = await renderLobby()
        playOnline()
        socket.emit.mockClear()
        unmount()
        // Was: no leave_queue, so the server could still pair a player who had left the lobby.
        expect(socket.emit.mock.calls).toEqual([['leave_queue', 'me']])
        expect(socket.listenedEvents()).toEqual([])
    })

    test('unmounting while NOT searching emits nothing [F8]', async () => {
        const { unmount } = await renderLobby()
        unmount()
        expect(socket.emit).not.toHaveBeenCalled()
    })
})

describe('custom time control', () => {
    // Redesign: Custom is a tile like the others; selecting it opens the inline panel (was a modal).
    test('selecting Custom shows the sliders and the preview (5+0 by default); another tile hides them', async () => {
        await renderLobby()
        click(screen.getByText('Custom'))
        expect(screen.getByText('Custom time control')).toBeInTheDocument()
        expect(screen.getByText('5 min')).toBeInTheDocument()
        expect(screen.getByText('0s')).toBeInTheDocument()
        expect(screen.getByText('5+0')).toBeInTheDocument()
        expect(screen.getByText('Custom · 5+0')).toBeInTheDocument()
        click(screen.getByText('Blitz'))
        expect(screen.queryByText('Custom time control')).not.toBeInTheDocument()
        playOnline()
        expect(socket.emitted('join_queue')[0].time_control).toBe('3+0')
    })

    test('sliders set minutes/increment; "Play with this time control" queues "M+I" with increment I', async () => {
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
        // the "You're playing" bar shows the chosen control
        expect(screen.getByText('Custom · 12+5')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Play with this time control' }))
        expect(socket.emitted('join_queue')).toEqual([{ user: { id: 'me' }, time_control: '12+5', increment: 5, is_rated: true }])
    })

    test('reconnect re-queue for a custom control keeps the increment ("12+5") [TIME-CONTROL]', async () => {
        await renderLobby()
        click(screen.getByText('Custom'))
        const [minutes, increment] = screen.getAllByRole('slider')
        fireEvent.change(minutes, { target: { value: '12' } })
        fireEvent.change(increment, { target: { value: '5' } })
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
    // Redesign: Friend opens the "Play a friend" panel; its "Invite with a link" opens this dialog.
    const openFriendModal = () => {
        click(screen.getByRole('button', { name: 'Friend' }))
        click(screen.getByRole('button', { name: 'Invite with a link' }))
    }
    const ratedToggle = () => screen.getByRole('switch', { name: 'Rated game' })

    test('shows six time controls, three colours and the rated toggle', async () => {
        await renderLobby()
        openFriendModal()
        expect(screen.getByRole('dialog', { name: 'Invite with a link' })).toBeInTheDocument()
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

    test('a response without a token returns to the config step, without logging to the browser console [S14]', async () => {
        const err = jest.spyOn(console, 'error').mockImplementation(() => {})
        privateCreate = async () => jsonResponse({ error: 'boom' })
        await renderLobby()
        openFriendModal()
        click(screen.getByRole('button', { name: 'Generate Invite Link' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Invite Link' })).toBeInTheDocument())
        expect(err).not.toHaveBeenCalled()
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
        click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Invite with a link' }))
        expect(screen.getByRole('button', { name: 'Generate Invite Link' })).toBeInTheDocument()
    })
})

describe('accessibility [A4]', () => {
    test('the lobby has no axe violations', async () => {
        const { container } = await renderLobby()
        await expectAccessible(container)
    }, AXE_TIMEOUT_MS)
})
