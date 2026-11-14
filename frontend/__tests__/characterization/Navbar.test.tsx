/**
 * Characterization tests for components/Navbar.tsx (PR 10/13, fe-shell).
 *
 * Pins the notification fetches, the challenge socket wiring and payloads
 * (including the inverted `color` on accept — LEGACY), the auth states,
 * dropdowns, logout and the mobile menu.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFakeSocket, jsonResponse } from './fakeSocket'

const push = jest.fn()
const refresh = jest.fn()
let pathname = '/lobby'
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh, replace: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => pathname,
}))
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, onClick, className, style }: any) => (
        <a href={href} onClick={onClick} className={className} style={style}>{children}</a>
    ),
}))
const signOut = jest.fn(async () => ({}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))

const socket = createFakeSocket()
let socketValue: any = socket
let profile: any = null
let loading = false
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socketValue }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, loading }) }))
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount: 7 }) }))
const toast = jest.fn()
jest.mock('@/components/Toast', () => ({ useToast: () => ({ toast }) }))

import Navbar from '@/components/Navbar'

const ME = { id: 'me', username: 'me1', display_name: 'Me Display', avatar_url: null, rating_rapid: 1501.6 }
const CHALLENGE = { from_user_id: 'u-opp', to_user_id: 'me', from_username: 'opp1', time_control: '5+0', is_rated: true, color: 'white' }
const NOTIFS = [
    { id: 'n1', type: 'challenge', payload: { message: 'Payload message' }, read: false },
    { id: 'n2', type: 'friend_request', payload: null, message: 'Top-level message', read: true },
    { id: 'n3', type: 'friend_request', payload: {}, read: true },
]

let fetchMock: jest.Mock
beforeEach(() => {
    socket.reset()
    socketValue = socket
    push.mockClear()
    refresh.mockClear()
    signOut.mockClear()
    pathname = '/lobby'
    profile = { ...ME }
    loading = false
    fetchMock = jest.fn(async (url: string) => {
        if (url === '/api/notifications') return jsonResponse(NOTIFS)
        return jsonResponse({ ok: true })
    })
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

const click = (el: Element) => fireEvent.click(el)
const bell = () => screen.getByText((_, el) => el?.tagName === 'BUTTON' && !!el.querySelector('.lucide-bell'))
const avatarButton = () => screen.getByRole('button', { name: 'M' })

describe('layout and auth states', () => {
    // F15 (was: '... no fetch or emit on mount'): the unread dot needs the notifications on mount.
    test('logged in: logo, nav links with active marker, online count, avatar initial; only the notifications fetch on mount', async () => {
        const { container } = render(<Navbar />)
        await act(async () => {})
        expect(screen.getByText('Gambit')).toBeInTheDocument()
        expect(screen.getByText('7 online')).toBeInTheDocument()
        const play = screen.getByRole('link', { name: 'Play' })
        expect(play).toHaveAttribute('href', '/lobby')
        expect(play.querySelector('span')).not.toBeNull()
        expect(screen.getByRole('link', { name: 'Leaderboard' }).querySelector('span')).toBeNull()
        expect(screen.getByRole('link', { name: 'Analysis' })).toHaveAttribute('href', '/analysis')
        expect(avatarButton()).toBeInTheDocument()
        expect(screen.queryByText('Log In')).toBeNull()
        expect(fetchMock.mock.calls).toEqual([['/api/notifications']])
        expect(socket.emit).not.toHaveBeenCalled()
        expect(socket.listenedEvents()).toEqual(['challenge_declined', 'challenge_ready', 'challenge_request'])
        expect(container.querySelector('nav')).toHaveClass('sticky', 'top-0', 'z-50', 'h-[52px]')
    })

    test('nested path marks the parent link active', () => {
        pathname = '/analysis/foo'
        render(<Navbar />)
        expect(screen.getByRole('link', { name: 'Analysis' }).querySelector('span')).not.toBeNull()
        expect(screen.getByRole('link', { name: 'Play' }).querySelector('span')).toBeNull()
    })

    test('loading shows a skeleton and no auth controls', () => {
        loading = true
        profile = null
        const { container } = render(<Navbar />)
        expect(container.querySelector('.skeleton')).not.toBeNull()
        expect(screen.queryByText('Log In')).toBeNull()
    })

    test('logged out: Log In / Sign Up links, no socket subscriptions', () => {
        profile = null
        render(<Navbar />)
        expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute('href', '/login')
        expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/signup')
        expect(socket.listenedEvents()).toEqual([])
    })

    test('avatar image is used when avatar_url is set', () => {
        profile = { ...ME, avatar_url: 'https://img.test/a.png' }
        const { container } = render(<Navbar />)
        expect(container.querySelector('img[src="https://img.test/a.png"]')).not.toBeNull()
    })
})

describe('notifications', () => {
    const unreadDot = () => bell().querySelector('span.rounded-full')

    // F15 (new): the dot used to appear only after the bell had been opened once.
    test('the unread dot shows on load, before the bell is opened', async () => {
        render(<Navbar />)
        await waitFor(() => expect(unreadDot()).not.toBeNull())
        expect(screen.queryByText('Notifications')).toBeNull()
    })

    test('no unread notification, no dot', async () => {
        fetchMock.mockImplementation(async () => jsonResponse(NOTIFS.map(n => ({ ...n, read: true }))))
        render(<Navbar />)
        await act(async () => {})
        expect(fetchMock).toHaveBeenCalledWith('/api/notifications')
        expect(unreadDot()).toBeNull()
    })

    test('signed out: no notifications request', async () => {
        profile = null
        render(<Navbar />)
        await act(async () => {})
        expect(fetchMock).not.toHaveBeenCalled()
    })

    // F15 (was: one GET, on opening the bell): one GET on mount, one more on opening.
    test('opening the bell GETs /api/notifications (no options) and lists messages with fallbacks', async () => {
        render(<Navbar />)
        click(bell())
        await waitFor(() => expect(screen.getByText('Payload message')).toBeInTheDocument())
        expect(fetchMock.mock.calls).toEqual([['/api/notifications'], ['/api/notifications']])
        expect(screen.getByText('Top-level message')).toBeInTheDocument()
        expect(screen.getByText('friend_request')).toBeInTheDocument()
        expect(screen.getByText('Notifications')).toBeInTheDocument()
        expect(screen.getByText('Payload message')).not.toHaveClass('opacity-60')
        expect(screen.getByText('Top-level message')).toHaveClass('opacity-60')
    })

    test('Mark all read PUTs /api/notifications/read and hides the button', async () => {
        render(<Navbar />)
        click(bell())
        await screen.findByText('Payload message')
        await act(async () => { click(screen.getByRole('button', { name: 'Mark all read' })) })
        expect(fetchMock).toHaveBeenLastCalledWith('/api/notifications/read', { method: 'PUT' })
        expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
        expect(screen.getByText('Payload message')).toHaveClass('opacity-60')
    })

    test('F15: a failed Mark all read puts the unread state back and says so', async () => {
        fetchMock.mockImplementation(async (url: string) =>
            url === '/api/notifications' ? jsonResponse(NOTIFS) : jsonResponse({ error: 'x' }, false))
        render(<Navbar />)
        click(bell())
        await screen.findByText('Payload message')
        await act(async () => { click(screen.getByRole('button', { name: 'Mark all read' })) })
        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument()
        expect(screen.getByText('Payload message')).not.toHaveClass('opacity-60')
        expect(screen.getByRole('alert')).toHaveTextContent('Could not mark notifications read')
    })

    // F15 (was: two GETs in total): mount + first open + reopen.
    test('closing the bell does not refetch; reopening does', async () => {
        render(<Navbar />)
        click(bell())
        await screen.findByText('Payload message')
        click(bell())
        expect(screen.queryByText('Notifications')).toBeNull()
        click(bell())
        await screen.findByText('Payload message')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('an empty response shows "No notifications"', async () => {
        fetchMock.mockImplementation(async () => jsonResponse([]))
        render(<Navbar />)
        click(bell())
        await screen.findByText('No notifications')
    })

    // F15 (was: 'empty and failed responses show "No notifications"').
    test('a failed response shows an error, not "No notifications"', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ error: 'x' }, false))
        render(<Navbar />)
        click(bell())
        await screen.findByText('Could not load notifications.')
        expect(screen.queryByText('No notifications')).toBeNull()
    })

    test('a mousedown outside closes the panel', async () => {
        render(<Navbar />)
        click(bell())
        await screen.findByText('Payload message')
        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('Notifications')).toBeNull()
    })
})

describe('avatar dropdown and logout', () => {
    test('shows name, rounded rapid rating and links; Sign Out signs out then pushes / and refreshes', async () => {
        render(<Navbar />)
        click(avatarButton())
        expect(screen.getByText('Me Display')).toBeInTheDocument()
        expect(screen.getByText('1502 Rapid')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute('href', '/profile/me1')
        expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
        await act(async () => { click(screen.getByRole('button', { name: 'Sign Out' })) })
        expect(signOut).toHaveBeenCalledTimes(1)
        expect(push).toHaveBeenCalledWith('/')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('1502 Rapid')).toBeNull()
    })

    test('clicking a dropdown link closes it; mousedown outside closes it', () => {
        render(<Navbar />)
        click(avatarButton())
        click(screen.getByRole('link', { name: 'Settings' }))
        expect(screen.queryByText('1502 Rapid')).toBeNull()
        click(avatarButton())
        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('1502 Rapid')).toBeNull()
    })

    test('username fallback and 1200 default rating', () => {
        profile = { id: 'me', username: 'zed', display_name: null, avatar_url: null }
        render(<Navbar />)
        click(screen.getByRole('button', { name: 'Z' }))
        expect(screen.getByText('zed', { selector: 'div' })).toBeInTheDocument()
        expect(screen.getByText('1200 Rapid')).toBeInTheDocument()
    })
})

describe('challenge banner', () => {
    test('challenge_request shows the toast; Accept emits challenge_accept naming only the challenger [S4]', () => {
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        expect(screen.getByText('opp1')).toBeInTheDocument()
        expect(screen.getByText('challenges you')).toBeInTheDocument()
        expect(screen.getByText('5 min · Rated')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Accept' }))
        // Was: sent the terms plus an INVERTED colour. The server now uses the stored challenge,
        // so the accept carries no terms, colour or own id.
        expect(socket.emitted('challenge_accept')).toEqual([{ from_user_id: 'u-opp' }])
        expect(screen.queryByText('challenges you')).toBeNull()
    })

    test('casual label; the accept never carries a colour, whatever the challenge said [S4]', () => {
        render(<Navbar />)
        socket.serverSends('challenge_request', { ...CHALLENGE, color: 'random', is_rated: false })
        expect(screen.getByText('5 min · Casual')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Accept' }))
        expect(socket.emitted('challenge_accept')).toEqual([{ from_user_id: 'u-opp' }])
    })

    test('Decline and the X button emit challenge_decline {from_user_id, by_username}', () => {
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Decline' }))
        socket.serverSends('challenge_request', CHALLENGE)
        const x = screen.getByText('challenges you').closest('.flex.items-start')!.querySelector('button')!
        click(x)
        expect(socket.emitted('challenge_decline')).toEqual([
            { from_user_id: 'u-opp', by_username: 'me1' },
            { from_user_id: 'u-opp', by_username: 'me1' },
        ])
        expect(screen.queryByText('challenges you')).toBeNull()
    })

    /** Answer the last `event` emit, as the server's ack would. */
    const ack = (event: string, value: unknown) =>
        act(() => {
            socket.emit.mock.calls.filter(([e]) => e === event).at(-1)![2](value)
        })

    test('an accept the server refuses (the challenge expired) is shown as an error toast [ACKS]', () => {
        toast.mockClear()
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Accept' }))
        ack('challenge_accept', { ok: false, error: 'no_pending_request' })
        expect(toast).toHaveBeenCalledWith('That request has expired.', 'error')
    })

    test('an accepted accept or decline shows nothing; an unanswered decline is sent once more, then reported [ACKS]', () => {
        toast.mockClear()
        jest.useFakeTimers()
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Accept' }))
        ack('challenge_accept', { ok: true })
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Decline' }))
        act(() => { jest.advanceTimersByTime(8_000) })
        expect(socket.emitted('challenge_decline')).toHaveLength(2)
        expect(toast).not.toHaveBeenCalled()
        act(() => { jest.advanceTimersByTime(8_000) })
        expect(toast).toHaveBeenCalledWith('The server did not answer. Check your connection and try again.', 'error')
        expect(socket.emitted('challenge_decline')).toHaveLength(2)
    })

    test('auto-dismisses after 30 s; a new challenge restarts the timer', () => {
        jest.useFakeTimers()
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        act(() => { jest.advanceTimersByTime(20_000) })
        socket.serverSends('challenge_request', { ...CHALLENGE, from_username: 'opp2' })
        act(() => { jest.advanceTimersByTime(20_000) })
        expect(screen.getByText('opp2')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(10_000) })
        expect(screen.queryByText('challenges you')).toBeNull()
    })

    test('challenge_declined hides the toast; challenge_ready hides it and navigates', () => {
        render(<Navbar />)
        socket.serverSends('challenge_request', CHALLENGE)
        socket.serverSends('challenge_declined', { by: 'x' })
        expect(screen.queryByText('challenges you')).toBeNull()
        socket.serverSends('challenge_request', CHALLENGE)
        socket.serverSends('challenge_ready', { game_id: 'g-42' })
        expect(screen.queryByText('challenges you')).toBeNull()
        expect(push).toHaveBeenCalledWith('/game/g-42')
    })

    test('unmount unregisters the three handlers', () => {
        const { unmount } = render(<Navbar />)
        unmount()
        expect(socket.listenedEvents()).toEqual([])
        expect(socket.off).toHaveBeenCalledTimes(3)
    })

    test('no socket: no subscriptions', () => {
        socketValue = null
        render(<Navbar />)
        expect(socket.on).not.toHaveBeenCalled()
    })
})

describe('mobile menu', () => {
    test('hamburger toggles the menu; links close it; logged-out shows auth links', () => {
        profile = null
        const { container } = render(<Navbar />)
        const burger = container.querySelector('button.md\\:hidden')!
        click(burger)
        const menu = container.querySelector('div.md\\:hidden.fixed')!
        expect(menu).not.toBeNull()
        expect(menu.querySelectorAll('a')).toHaveLength(5)
        click(menu.querySelector('a[href="/leaderboard"]')!)
        expect(container.querySelector('div.md\\:hidden.fixed')).toBeNull()
    })

    test('logged in: menu has only the three nav links, active one highlighted', () => {
        const { container } = render(<Navbar />)
        click(container.querySelector('button.md\\:hidden')!)
        const links = container.querySelectorAll('div.md\\:hidden.fixed a')
        expect(links).toHaveLength(3)
        expect(links[0].getAttribute('style')).toContain('var(--accent-dim)')
        expect(links[1].getAttribute('style')).toContain('var(--text-secondary)')
    })
})
