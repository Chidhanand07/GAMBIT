/**
 * Characterization tests for the app header (features/navigation/components/AppHeaderContainer.tsx
 * rendering components/layout/AppHeader.tsx). Rewritten from Navbar.test.tsx for the redesign
 * [REDESIGN-2]: the same behaviours (notification fetches, challenge socket wiring and payloads,
 * auth states, menus, sign out, the site menu) asserted against the new markup.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    default: ({ children, href, ...rest }: any) => (
        <a href={href} {...rest}>{children}</a>
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

import AppHeader from '@/features/navigation/components/AppHeaderContainer'

const ME = { id: 'me', username: 'me1', display_name: 'Me Display', avatar_url: null, rating_rapid: 1501.6 }
const CHALLENGE = { from_user_id: 'u-opp', to_user_id: 'me', from_username: 'opp1', time_control: '5+0', is_rated: true, color: 'white' }
const NOTIFS = [
    { id: 'n1', type: 'challenge', payload: { message: 'Payload message' }, read: false, created_at: '' },
    { id: 'n2', type: 'friend_request', payload: null, message: 'Top-level message', read: true, created_at: '' },
    { id: 'n3', type: 'friend_request', payload: {}, read: true, created_at: '' },
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
const bell = () => screen.getByRole('button', { name: 'Notifications' })
const accountButton = (name = 'Me Display') => screen.getByRole('button', { name: `Account menu, ${name}` })
const mainNav = () => screen.getByRole('navigation', { name: 'Main' })
const row = (text: string) => screen.getByText(text).closest('[role="menuitem"]')!

describe('layout and auth states', () => {
    // F15: the unread dot needs the notifications on mount.
    test('logged in: logo, nav links with the current one marked, online count, account button; only the notifications fetch on mount', async () => {
        render(<AppHeader />)
        await act(async () => {})
        expect(screen.getByRole('banner')).toBeInTheDocument()
        expect(screen.getByText('Gambit')).toBeInTheDocument()
        expect(screen.getByText('7 online')).toBeInTheDocument()
        const play = within(mainNav()).getByRole('link', { name: 'Play' })
        expect(play).toHaveAttribute('href', '/lobby')
        expect(play).toHaveAttribute('aria-current', 'page')
        expect(within(mainNav()).getByRole('link', { name: 'Leaderboard' })).not.toHaveAttribute('aria-current')
        expect(within(mainNav()).getByRole('link', { name: 'Analysis' })).toHaveAttribute('href', '/analysis')
        expect(accountButton()).toBeInTheDocument()
        expect(accountButton()).toHaveTextContent('Me Display')
        expect(screen.queryByText('Sign in')).toBeNull()
        expect(fetchMock.mock.calls).toEqual([['/api/notifications']])
        expect(socket.emit).not.toHaveBeenCalled()
        expect(socket.listenedEvents()).toEqual(['challenge_declined', 'challenge_ready', 'challenge_request'])
    })

    test('nested path marks the parent link current and parks the pill under it', () => {
        pathname = '/analysis/foo'
        render(<AppHeader />)
        expect(within(mainNav()).getByRole('link', { name: 'Analysis' })).toHaveAttribute('aria-current', 'page')
        expect(within(mainNav()).getByRole('link', { name: 'Play' })).not.toHaveAttribute('aria-current')
        expect(mainNav()).toHaveClass('gpos3')
    })

    test('no current section: the pill idles (profile) or hides until hover (landing)', () => {
        pathname = '/profile/me1'
        const { unmount } = render(<AppHeader />)
        expect(mainNav()).toHaveClass('gidle')
        expect(within(mainNav()).queryByRole('link', { current: 'page' })).toBeNull()
        unmount()
        pathname = '/'
        render(<AppHeader />)
        expect(mainNav()).toHaveClass('gnone')
    })

    test('loading shows a placeholder and no auth controls', () => {
        loading = true
        profile = null
        render(<AppHeader />)
        expect(screen.getByRole('status', { name: 'Loading account' })).toBeInTheDocument()
        expect(screen.queryByText('Sign in')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull()
    })

    test('logged out: Sign in / Create account links, no socket subscriptions', () => {
        profile = null
        render(<AppHeader />)
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
        expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/signup')
        expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
        expect(socket.listenedEvents()).toEqual([])
    })

    test('avatar image is used when avatar_url is set', () => {
        profile = { ...ME, avatar_url: 'https://img.test/a.png' }
        const { container } = render(<AppHeader />)
        expect(container.querySelector('img[src="https://img.test/a.png"]')).not.toBeNull()
    })
})

describe('notifications', () => {
    const unreadDot = () => bell().querySelector('span')!

    // F15: the dot used to appear only after the bell had been opened once.
    test('the unread dot shows on load, before the bell is opened', async () => {
        render(<AppHeader />)
        await waitFor(() => expect(unreadDot()).not.toHaveClass('opacity-0'))
        expect(screen.queryByRole('menu', { name: 'Notifications' })).toBeNull()
        expect(bell()).toHaveAttribute('aria-expanded', 'false')
    })

    test('no unread notification, no dot', async () => {
        fetchMock.mockImplementation(async () => jsonResponse(NOTIFS.map(n => ({ ...n, read: true }))))
        render(<AppHeader />)
        await act(async () => {})
        expect(fetchMock).toHaveBeenCalledWith('/api/notifications')
        expect(unreadDot()).toHaveClass('opacity-0')
    })

    test('signed out: no notifications request', async () => {
        profile = null
        render(<AppHeader />)
        await act(async () => {})
        expect(fetchMock).not.toHaveBeenCalled()
    })

    // F15: one GET on mount, one more on opening. Without a message the type's title is shown
    // (was: the raw type string).
    test('opening the bell GETs /api/notifications (no options) and lists messages with fallbacks', async () => {
        render(<AppHeader />)
        click(bell())
        await waitFor(() => expect(screen.getByText('Payload message')).toBeInTheDocument())
        expect(fetchMock.mock.calls).toEqual([['/api/notifications'], ['/api/notifications']])
        expect(screen.getByText('Top-level message')).toBeInTheDocument()
        expect(screen.getByText('Friend request')).toBeInTheDocument()
        expect(screen.getByRole('menu', { name: 'Notifications' })).toBeInTheDocument()
        expect(bell()).toHaveAttribute('aria-expanded', 'true')
        expect(row('Payload message')).toHaveAttribute('data-unread', 'true')
        expect(row('Top-level message')).toHaveAttribute('data-unread', 'false')
    })

    test('a challenge row shows who, the time control and its age', async () => {
        const at = new Date(Date.now() - 2 * 60_000).toISOString()
        fetchMock.mockImplementation(async () =>
            jsonResponse([{ id: 'c', type: 'challenge', payload: { from_username: 'chiru', time_control: '3+0' }, read: false, created_at: at }]))
        render(<AppHeader />)
        click(bell())
        await screen.findByText('New challenge')
        expect(screen.getByText('chiru · Blitz 3+0 · 2m ago')).toBeInTheDocument()
    })

    test('Mark all read PUTs /api/notifications/read and hides the button', async () => {
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Payload message')
        await act(async () => { click(screen.getByRole('button', { name: 'Mark all read' })) })
        expect(fetchMock).toHaveBeenLastCalledWith('/api/notifications/read', { method: 'PUT' })
        expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
        expect(row('Payload message')).toHaveAttribute('data-unread', 'false')
        expect(unreadDot()).toHaveClass('opacity-0')
    })

    test('F15: a failed Mark all read puts the unread state back and says so', async () => {
        fetchMock.mockImplementation(async (url: string) =>
            url === '/api/notifications' ? jsonResponse(NOTIFS) : jsonResponse({ error: 'x' }, false))
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Payload message')
        await act(async () => { click(screen.getByRole('button', { name: 'Mark all read' })) })
        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument()
        expect(row('Payload message')).toHaveAttribute('data-unread', 'true')
        expect(screen.getByRole('alert')).toHaveTextContent('Could not mark notifications read')
    })

    // F15: mount + first open + reopen.
    test('closing the bell does not refetch; reopening does', async () => {
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Payload message')
        click(bell())
        expect(screen.queryByRole('menu', { name: 'Notifications' })).toBeNull()
        click(bell())
        await screen.findByText('Payload message')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('an empty response shows "No notifications"', async () => {
        fetchMock.mockImplementation(async () => jsonResponse([]))
        render(<AppHeader />)
        click(bell())
        await screen.findByText('No notifications')
    })

    // F15 (was: 'empty and failed responses show "No notifications"').
    test('a failed response shows an error, not "No notifications"', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ error: 'x' }, false))
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Could not load notifications.')
        expect(screen.queryByText('No notifications')).toBeNull()
    })

    test('a mousedown outside closes the panel', async () => {
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Payload message')
        fireEvent.mouseDown(document.body)
        expect(screen.queryByRole('menu', { name: 'Notifications' })).toBeNull()
    })

    test('Escape closes the panel and gives focus back to the bell', async () => {
        render(<AppHeader />)
        click(bell())
        await screen.findByText('Payload message')
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('menu', { name: 'Notifications' })).toBeNull()
        expect(bell()).toHaveFocus()
    })
})

describe('account menu and sign out', () => {
    test('shows name, rounded rapid rating and links; Sign Out signs out then pushes / and refreshes', async () => {
        render(<AppHeader />)
        click(accountButton())
        const menu = screen.getByRole('menu', { name: 'Account' })
        expect(within(menu).getByText('Me Display')).toBeInTheDocument()
        expect(screen.getByText('1502 rapid')).toBeInTheDocument()
        expect(within(menu).getByRole('menuitem', { name: 'My Profile' })).toHaveAttribute('href', '/profile/me1')
        expect(within(menu).getByRole('menuitem', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard')
        expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
        await act(async () => { click(within(menu).getByRole('menuitem', { name: 'Sign Out' })) })
        expect(signOut).toHaveBeenCalledTimes(1)
        expect(push).toHaveBeenCalledWith('/')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('1502 rapid')).toBeNull()
    })

    test('clicking a menu link closes it; mousedown outside closes it', () => {
        render(<AppHeader />)
        click(accountButton())
        click(screen.getByRole('menuitem', { name: 'Settings' }))
        expect(screen.queryByText('1502 rapid')).toBeNull()
        click(accountButton())
        expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('1502 rapid')).toBeNull()
    })

    test('username fallback and 1200 default rating', () => {
        profile = { id: 'me', username: 'zed', display_name: null, avatar_url: null }
        render(<AppHeader />)
        click(accountButton('zed'))
        expect(within(screen.getByRole('menu', { name: 'Account' })).getByText('zed')).toBeInTheDocument()
        expect(screen.getByText('1200 rapid')).toBeInTheDocument()
    })

    test('only one menu is open at a time', () => {
        render(<AppHeader />)
        click(accountButton())
        click(screen.getByRole('button', { name: 'Menu' }))
        expect(screen.queryByRole('menu', { name: 'Account' })).toBeNull()
        expect(screen.getByRole('menu', { name: 'Site' })).toBeInTheDocument()
    })
})

describe('challenge banner', () => {
    test('challenge_request shows the toast; Accept emits challenge_accept naming only the challenger [S4]', () => {
        render(<AppHeader />)
        socket.serverSends('challenge_request', CHALLENGE)
        expect(screen.getByText('opp1')).toBeInTheDocument()
        expect(screen.getByText('challenges you')).toBeInTheDocument()
        expect(screen.getByText('5 min · Rated')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Accept' }))
        // The server uses the stored challenge, so the accept carries no terms, colour or own id.
        expect(socket.emitted('challenge_accept')).toEqual([{ from_user_id: 'u-opp' }])
        expect(screen.queryByText('challenges you')).toBeNull()
    })

    test('casual label; the accept never carries a colour, whatever the challenge said [S4]', () => {
        render(<AppHeader />)
        socket.serverSends('challenge_request', { ...CHALLENGE, color: 'random', is_rated: false })
        expect(screen.getByText('5 min · Casual')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Accept' }))
        expect(socket.emitted('challenge_accept')).toEqual([{ from_user_id: 'u-opp' }])
    })

    test('Decline and the dismiss button emit challenge_decline {from_user_id, by_username}', () => {
        render(<AppHeader />)
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Decline' }))
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Dismiss challenge' }))
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
        render(<AppHeader />)
        socket.serverSends('challenge_request', CHALLENGE)
        click(screen.getByRole('button', { name: 'Accept' }))
        ack('challenge_accept', { ok: false, error: 'no_pending_request' })
        expect(toast).toHaveBeenCalledWith('That request has expired.', 'error')
    })

    test('an accepted accept or decline shows nothing; an unanswered decline is sent once more, then reported [ACKS]', () => {
        toast.mockClear()
        jest.useFakeTimers()
        render(<AppHeader />)
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
        render(<AppHeader />)
        socket.serverSends('challenge_request', CHALLENGE)
        act(() => { jest.advanceTimersByTime(20_000) })
        socket.serverSends('challenge_request', { ...CHALLENGE, from_username: 'opp2' })
        act(() => { jest.advanceTimersByTime(20_000) })
        expect(screen.getByText('opp2')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(10_000) })
        expect(screen.queryByText('challenges you')).toBeNull()
    })

    test('challenge_declined hides the toast; challenge_ready hides it and navigates', () => {
        render(<AppHeader />)
        socket.serverSends('challenge_request', CHALLENGE)
        socket.serverSends('challenge_declined', { by: 'x' })
        expect(screen.queryByText('challenges you')).toBeNull()
        socket.serverSends('challenge_request', CHALLENGE)
        socket.serverSends('challenge_ready', { game_id: 'g-42' })
        expect(screen.queryByText('challenges you')).toBeNull()
        expect(push).toHaveBeenCalledWith('/game/g-42')
    })

    test('unmount unregisters the three handlers', () => {
        const { unmount } = render(<AppHeader />)
        unmount()
        expect(socket.listenedEvents()).toEqual([])
        expect(socket.off).toHaveBeenCalledTimes(3)
    })

    test('no socket: no subscriptions', () => {
        socketValue = null
        render(<AppHeader />)
        expect(socket.on).not.toHaveBeenCalled()
    })
})

// Was "mobile menu": the redesign has one site menu (the Menu button) at every width.
describe('site menu', () => {
    test('the Menu button toggles the menu (icon and aria-expanded); links close it', () => {
        render(<AppHeader />)
        const menuButton = screen.getByRole('button', { name: 'Menu' })
        expect(menuButton).toHaveAttribute('aria-expanded', 'false')
        click(menuButton)
        expect(menuButton).toHaveAttribute('aria-expanded', 'true')
        const menu = screen.getByRole('menu', { name: 'Site' })
        expect(within(menu).getAllByRole('menuitem')).toHaveLength(4)
        click(within(menu).getByRole('menuitem', { name: 'Leaderboard' }))
        expect(screen.queryByRole('menu', { name: 'Site' })).toBeNull()
        expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    })

    test('lists Home and the three sections with their routes', () => {
        render(<AppHeader />)
        click(screen.getByRole('button', { name: 'Menu' }))
        const links = within(screen.getByRole('menu', { name: 'Site' })).getAllByRole('menuitem')
        expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
            ['Home', '/'],
            ['Play', '/lobby'],
            ['Leaderboard', '/leaderboard'],
            ['Analysis', '/analysis'],
        ])
    })

    test('ArrowDown moves focus through the menu items', () => {
        render(<AppHeader />)
        click(screen.getByRole('button', { name: 'Menu' }))
        const menu = screen.getByRole('menu', { name: 'Site' })
        const items = within(menu).getAllByRole('menuitem')
        items[0].focus()
        fireEvent.keyDown(menu, { key: 'ArrowDown' })
        expect(items[1]).toHaveFocus()
        fireEvent.keyDown(menu, { key: 'ArrowUp' })
        fireEvent.keyDown(menu, { key: 'ArrowUp' })
        expect(items[3]).toHaveFocus()
    })
})
