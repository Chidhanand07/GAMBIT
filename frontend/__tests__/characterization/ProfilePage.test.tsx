/**
 * Characterization tests for app/profile/[username]/page.tsx (PR 02/19).
 *
 * Pins the exact fetches (URLs, query strings, options), what each tab renders,
 * own-profile vs other-profile differences, the friend-request flows and the
 * Supabase presence channel. Mocks only stable seams: next/link,
 * @/lib/supabase/client and global.fetch. "LEGACY:" marks behaviour that looks
 * wrong but is asserted as-is.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))

// ── Supabase presence double ────────────────────────────────────────────────
type PresenceChannel = {
    name: string
    opts: any
    on: jest.Mock
    subscribe: jest.Mock
    presenceState: jest.Mock
    fireSync: (state: Record<string, unknown>) => void
}
const channels: PresenceChannel[] = []
const removeChannel = jest.fn()
function makeChannel(name: string, opts: any): PresenceChannel {
    let syncHandler: (() => void) | null = null
    let state: Record<string, unknown> = {}
    const ch: PresenceChannel = {
        name, opts,
        on: jest.fn((_type: string, _filter: any, cb: () => void) => { syncHandler = cb; return ch }),
        subscribe: jest.fn(() => ch),
        presenceState: jest.fn(() => state),
        fireSync: s => { state = s; act(() => { syncHandler?.() }) },
    }
    return ch
}
jest.mock('@/lib/supabase/client', () => ({
    createClient: () => ({
        channel: (name: string, opts: any) => { const ch = makeChannel(name, opts); channels.push(ch); return ch },
        removeChannel,
    }),
}))

// F11: the Online badge reads PresenceProvider's shared presence set.
let onlineUserIds: ReadonlySet<string> = new Set()
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount: 1, onlineUserIds }) }))

import ProfilePage from '@/app/profile/[username]/page'
import { routeParams } from '../helpers/params'

// ── Fixtures ────────────────────────────────────────────────────────────────
const BOB = {
    id: 'u-bob', username: 'bob', display_name: 'Bobby', avatar_url: null, bio: 'Hello there', country: 'India',
    created_at: '2023-05-01T12:00:00Z', games_played: 10, wins: 6, losses: 3, draws: 1,
    rating_bullet: 1100.4, rating_blitz: 1250.6, rating_rapid: 1400, rating_classical: null,
    peak_bullet: 1300, peak_blitz: 1350, peak_rapid: 1500, peak_classical: 1600,
}
const ME = { id: 'u-me', username: 'me1', display_name: 'Me' }

const game = (id: string, over: Partial<any> = {}) => ({
    id, time_control: '10', status: 'completed', result: 'white', winner_id: 'u-bob',
    white_accuracy: 91, black_accuracy: 64, created_at: '2024-01-05T10:00:00Z', ended_at: null,
    white_id: 'u-bob', black_id: 'u-alice',
    white: { username: 'bob', display_name: 'Bobby', rating_rapid: 1400 },
    black: { username: 'alice', display_name: 'Alice', rating_rapid: 1333.3 },
    ...over,
})

type Route = unknown | ((init?: any) => any)
let routes: Record<string, Route>
let fetchMock: jest.Mock
const FAIL = (body: unknown = {}) => () => jsonResponse(body, false)

beforeEach(() => {
    channels.length = 0
    removeChannel.mockClear()
    onlineUserIds = new Set()
    window.history.replaceState(null, '', '/')
    routes = {
        '/api/profile/bob': BOB,
        '/api/profile/me': ME,
        '/api/profile/bob/games?limit=5&offset=0': { games: [] },
        '/api/friends/status/bob': { status: 'none' },
    }
    fetchMock = jest.fn(async (url: string, init?: any) => {
        if (!(url in routes)) return jsonResponse(null, false)
        const r = routes[url]
        return typeof r === 'function' ? r(init) : jsonResponse(r)
    })
    ;(global as any).fetch = fetchMock
})

async function settle() {
    for (let i = 0; i < 6; i++) await act(async () => {})
}
async function renderProfile(username = 'bob') {
    const utils = render(<ProfilePage params={routeParams({ username })} />)
    await settle()
    return utils
}
const urls = () => fetchMock.mock.calls.map(c => c[0])
const callFor = (url: string) => fetchMock.mock.calls.find(c => c[0] === url)
const click = (el: Element) => fireEvent.click(el)
const tab = (name: RegExp | string) => screen.getAllByRole('button', { name }).find(b => !b.hasAttribute('disabled'))!

// ── Loading ─────────────────────────────────────────────────────────────────

describe('initial load', () => {
    test('fetches the profile and /api/profile/me in parallel with cache: no-store', async () => {
        await renderProfile()
        expect(fetchMock.mock.calls[0]).toEqual(['/api/profile/bob', { cache: 'no-store' }])
        expect(fetchMock.mock.calls[1]).toEqual(['/api/profile/me', { cache: 'no-store' }])
    })

    test('other profile: then fetches recent games (limit 5) and friend status, nothing else', async () => {
        await renderProfile()
        expect(urls().slice().sort()).toEqual([
            '/api/friends/status/bob',
            '/api/profile/bob',
            '/api/profile/bob/games?limit=5&offset=0',
            '/api/profile/me',
        ])
        expect(callFor('/api/profile/bob/games?limit=5&offset=0')![1]).toEqual({ cache: 'no-store' })
        expect(callFor('/api/friends/status/bob')).toHaveLength(1) // no options
    })

    test('own profile: no friend-status request', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        await renderProfile()
        expect(urls()).not.toContain('/api/friends/status/bob')
    })

    // F12 (was: 'a missing profile leaves the spinner up forever and fetches nothing more').
    test('a missing profile shows a not-found state and fetches nothing more', async () => {
        routes['/api/profile/ghost'] = FAIL({ error: 'not found' })
        await renderProfile('ghost')
        expect(screen.getByRole('heading', { name: 'Player not found' })).toBeInTheDocument()
        expect(screen.getByText(/ghost/)).toBeInTheDocument()
        expect(urls().slice().sort()).toEqual(['/api/profile/ghost', '/api/profile/me'])
    })

    test('F12: a failed profile request shows an error with Retry, and Retry loads the profile', async () => {
        let failNext = true
        routes['/api/profile/bob'] = () => {
            if (failNext) {
                failNext = false
                return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
            }
            return jsonResponse(BOB)
        }
        await renderProfile()
        expect(screen.getByText('Could not load this profile.')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Retry' }))
        await settle()
        expect(screen.getByRole('heading', { level: 1, name: 'Bobby' })).toBeInTheDocument()
    })

    test('F12: a network error loading the profile shows the error state, not a spinner', async () => {
        routes['/api/profile/bob'] = () => Promise.reject(new TypeError('offline'))
        await renderProfile()
        expect(screen.getByText('Could not load this profile.')).toBeInTheDocument()
    })

    test('usernames are URI-encoded everywhere EXCEPT the games-tab request', async () => {
        const name = 'bob smith'
        routes = {
            '/api/profile/bob%20smith': { ...BOB, username: name },
            '/api/profile/me': ME,
            '/api/profile/bob%20smith/games?limit=5&offset=0': { games: [] },
            '/api/friends/status/bob%20smith': { status: 'none' },
            '/api/profile/bob smith/games?limit=15&offset=0': { games: [] },
        }
        await renderProfile(name)
        click(tab(/^Games/))
        await settle()
        // LEGACY: loadGames does not encodeURIComponent the username
        expect(urls()).toContain('/api/profile/bob smith/games?limit=15&offset=0')
        expect(urls()).toContain('/api/friends/status/bob%20smith')
    })
})

// ── Header & overview ───────────────────────────────────────────────────────

describe('header and overview tab', () => {
    test('renders name, handle, bio, country, join year, game count and avatar initial', async () => {
        await renderProfile()
        expect(screen.getByRole('heading', { level: 1, name: 'Bobby' })).toBeInTheDocument()
        expect(screen.getByText('@bob')).toBeInTheDocument()
        expect(screen.getByText('Hello there')).toBeInTheDocument()
        expect(screen.getByText('India')).toBeInTheDocument()
        expect(screen.getByText('Joined 2023')).toBeInTheDocument()
        expect(screen.getAllByText('10 games')).toHaveLength(2) // header + Record card
        expect(screen.getByText('B')).toBeInTheDocument()
    })

    test('tabs are Overview, "Games (N)", Stats, Friends', async () => {
        await renderProfile()
        for (const name of ['Overview', 'Games (10)', 'Stats']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
        expect(tab('Friends')).toBeInTheDocument()
    })

    test('with 0 games the tab is just "Games" and no win rate is shown', async () => {
        routes['/api/profile/bob'] = { ...BOB, games_played: 0, wins: 0, losses: 0, draws: 0 }
        await renderProfile()
        expect(screen.getByRole('button', { name: 'Games' })).toBeInTheDocument()
        expect(screen.queryByText('Win rate')).not.toBeInTheDocument()
    })

    // F12 (was: 'Peak = CURRENT rating (peak_* ignored)', asserting 'Peak 1100/1251/1400/—'):
    // Peak reads peak_<category>, never below the current rating, and is hidden when unknown.
    test('rating cards show rounded ratings, "—" for missing, and Peak from peak_*', async () => {
        await renderProfile()
        expect(screen.getByText('1100')).toBeInTheDocument()
        expect(screen.getByText('1251')).toBeInTheDocument()
        expect(screen.getByText('1400')).toBeInTheDocument()
        expect(screen.getByText('Peak 1300')).toBeInTheDocument()
        expect(screen.getByText('Peak 1350')).toBeInTheDocument()
        expect(screen.getByText('Peak 1500')).toBeInTheDocument()
        expect(screen.getByText('Peak 1600')).toBeInTheDocument()
        expect(screen.queryByText('Peak 1100')).not.toBeInTheDocument()
    })

    test('F12: Peak is never below the current rating and is hidden when the profile has no peak', async () => {
        routes['/api/profile/bob'] = {
            ...BOB, peak_bullet: 900, peak_blitz: null, peak_rapid: undefined, peak_classical: undefined,
        }
        await renderProfile()
        expect(screen.getByText('Peak 1100')).toBeInTheDocument()
        expect(screen.getAllByText(/^Peak/)).toHaveLength(1)
    })

    test('record shows wins / losses / draws and rounded win rate', async () => {
        await renderProfile()
        expect(screen.getByText('6')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('1')).toBeInTheDocument()
        expect(screen.getByText('60%')).toBeInTheDocument()
    })

    test('recent games list: result from winner_id/result, opponent link, time control and date', async () => {
        routes['/api/profile/bob/games?limit=5&offset=0'] = {
            games: [
                game('g1'),
                game('g2', { winner_id: 'u-alice', white_id: 'u-alice', black_id: 'u-bob', white: { username: 'alice', display_name: null }, black: { username: 'bob' } }),
                game('g3', { result: 'draw', winner_id: null, time_control: '3+2' }),
                game('g4', { winner_id: null, result: 'aborted', black: null }),
            ],
        }
        await renderProfile()
        expect(screen.getByText('Win')).toBeInTheDocument()
        // F12 (was: two 'Loss' rows, "null winner + non-draw counts as Loss"): an aborted game is labelled Aborted
        expect(screen.getAllByText('Loss')).toHaveLength(1)
        expect(screen.getByText('Aborted')).toBeInTheDocument()
        expect(screen.getByText('Draw')).toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: 'vs Alice' })[0]).toHaveAttribute('href', '/profile/alice')
        expect(screen.getByRole('link', { name: 'vs alice' })).toHaveAttribute('href', '/profile/alice')
        expect(screen.getByText('vs Unknown')).toBeInTheDocument()
        expect(screen.getByText('3+2')).toBeInTheDocument()
        expect(screen.getAllByText('Jan 5, 2024')).toHaveLength(4)
    })

    test('recent games: empty or failed response shows "No completed games yet."', async () => {
        routes['/api/profile/bob/games?limit=5&offset=0'] = FAIL()
        await renderProfile()
        expect(screen.getByText('No completed games yet.')).toBeInTheDocument()
    })

    test('"View all" switches to the games tab', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: [] }
        await renderProfile()
        click(screen.getByRole('button', { name: 'View all' }))
        await settle()
        expect(urls()).toContain('/api/profile/bob/games?limit=15&offset=0')
        expect(screen.queryByText('Record')).not.toBeInTheDocument()
    })
})

// ── Own vs other / friend status ────────────────────────────────────────────

describe('friend status and actions', () => {
    test('own profile shows an "Edit Profile" link to /settings and no Add Friend / Challenge', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        await renderProfile()
        expect(screen.getByRole('link', { name: /Edit Profile/ })).toHaveAttribute('href', '/settings')
        expect(screen.queryByRole('button', { name: /Add Friend/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Challenge/ })).not.toBeInTheDocument()
        // LEGACY: the edit-profile modal (PATCH /api/profile/me) has no opener; it never renders
        click(screen.getByRole('link', { name: /Edit Profile/ }))
        expect(screen.queryByText('Public Profile')).not.toBeInTheDocument()
    })

    test('other profile shows a Challenge link to /challenge/<username>', async () => {
        await renderProfile()
        expect(screen.getByRole('link', { name: /Challenge/ })).toHaveAttribute('href', '/challenge/bob')
    })

    test.each([
        ['none', 'Add Friend', false],
        ['pending_received', 'Add Friend', false],
        ['pending_sent', 'Request Sent', true],
    ])('status "%s" shows %s (disabled=%s)', async (status, label, disabled) => {
        routes['/api/friends/status/bob'] = { status }
        await renderProfile()
        const btn = screen.getByRole('button', { name: new RegExp(label) })
        if (disabled) expect(btn).toBeDisabled()
        else expect(btn).toBeEnabled()
    })

    test('status "friends" shows a disabled "Friends" badge button', async () => {
        routes['/api/friends/status/bob'] = { status: 'friends' }
        await renderProfile()
        const friendsButtons = screen.getAllByRole('button', { name: 'Friends' })
        expect(friendsButtons).toHaveLength(2) // badge + tab
        expect(friendsButtons.filter(b => b.hasAttribute('disabled'))).toHaveLength(1)
        expect(screen.queryByRole('button', { name: /Add Friend/ })).not.toBeInTheDocument()
    })

    test('a failed status request falls back to "Add Friend"', async () => {
        routes['/api/friends/status/bob'] = FAIL()
        await renderProfile()
        expect(screen.getByRole('button', { name: /Add Friend/ })).toBeEnabled()
    })

    test('Add Friend POSTs {addressee_username} and switches to "Request Sent"', async () => {
        routes['/api/friends/request'] = { ok: true }
        await renderProfile()
        click(screen.getByRole('button', { name: /Add Friend/ }))
        await settle()
        expect(callFor('/api/friends/request')).toEqual(['/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addressee_username: 'bob' }),
        }])
        expect(screen.getByRole('button', { name: /Request Sent/ })).toBeDisabled()
    })

    test('a rejected friend request reverts to "Add Friend"', async () => {
        routes['/api/friends/request'] = FAIL({ error: 'dup' })
        await renderProfile()
        click(screen.getByRole('button', { name: /Add Friend/ }))
        await settle()
        expect(screen.getByRole('button', { name: /Add Friend/ })).toBeEnabled()
    })

    test('signed-out viewer: no status request; Add Friend is shown but does nothing', async () => {
        routes['/api/profile/me'] = FAIL()
        await renderProfile()
        expect(urls()).not.toContain('/api/friends/status/bob')
        click(screen.getByRole('button', { name: /Add Friend/ }))
        await settle()
        expect(urls()).not.toContain('/api/friends/request')
        expect(screen.getByRole('button', { name: /Add Friend/ })).toBeEnabled()
    })
})

// ── Games tab ───────────────────────────────────────────────────────────────

describe('games tab', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => game(`p1-${i}`))

    test('loads 15 at a time with cache: no-store and paginates by offset', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: fifteen }
        routes['/api/profile/bob/games?limit=15&offset=15'] = { games: [game('p2-0', { result: 'draw', winner_id: null })] }
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(callFor('/api/profile/bob/games?limit=15&offset=0')![1]).toEqual({ cache: 'no-store' })
        expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(15)
        click(screen.getByRole('button', { name: 'Load more games' }))
        await settle()
        expect(callFor('/api/profile/bob/games?limit=15&offset=15')![1]).toEqual({ cache: 'no-store' })
        expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(16)
        // fewer than 15 returned -> no more pages
        expect(screen.queryByRole('button', { name: 'Load more games' })).not.toBeInTheDocument()
    })

    test('a short first page shows no "Load more" button', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: [game('only')] }
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(screen.queryByRole('button', { name: 'Load more games' })).not.toBeInTheDocument()
    })

    test('a row shows W/1-0, both players with rapid ratings, accuracies and a Review link', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: [game('g-row')] }
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(screen.getByText('W')).toBeInTheDocument()
        expect(screen.getByText('1-0')).toBeInTheDocument()
        expect(screen.getByText('(1400)')).toBeInTheDocument()
        expect(screen.getByText('(1333)')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/profile/alice')
        expect(screen.getByText('91%')).toBeInTheDocument()
        expect(screen.getByText('64%')).toBeInTheDocument()
        expect(screen.getByTitle('rapid')).toHaveTextContent('⏱')
        expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/game/g-row')
    })

    test('loss and draw rows; time controls are bucketed bullet<=2, blitz<=5, rapid<=15, else classical', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = {
            games: [
                game('a', { winner_id: 'u-alice', time_control: '2+1', white_accuracy: null }),
                game('b', { result: 'draw', winner_id: null, time_control: '5' }),
                game('c', { time_control: '30' }),
                game('d', { time_control: 'weird', black: null }),
            ],
        }
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(screen.getByText('L')).toBeInTheDocument()
        expect(screen.getByText('0-1')).toBeInTheDocument()
        expect(screen.getByText('D')).toBeInTheDocument()
        expect(screen.getByText('½-½')).toBeInTheDocument()
        expect(screen.getByTitle('bullet')).toHaveTextContent('⚡')
        expect(screen.getByTitle('blitz')).toHaveTextContent('🔥')
        expect(screen.getByTitle('classical')).toHaveTextContent('📖')
        expect(screen.getByTitle('rapid')).toHaveTextContent('⏱')
        expect(screen.getByText('Unknown')).toBeInTheDocument()
        // F12 (was: one '(1200)', the missing black player): ratings follow the game's category, and the
        // fixture players only carry rating_rapid, so rows a-c (bullet/blitz/classical) default to 1200 too.
        expect(screen.getAllByText('(1200)')).toHaveLength(7)
        expect(screen.getByText('(1400)')).toBeInTheDocument() // row d: 'weird' reads as 10+0, rapid
        expect(screen.getByText('—')).toBeInTheDocument()
    })

    test('F12: each row shows the players\' rating for the game\'s category, not always rapid', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = {
            games: [
                game('blitz', {
                    time_control: '3+2',
                    white: { username: 'bob', rating_rapid: 1400, rating_blitz: 1555 },
                    black: { username: 'alice', rating_rapid: 1333, rating_blitz: 1444.4 },
                }),
            ],
        }
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(screen.getByText('(1555)')).toBeInTheDocument()
        expect(screen.getByText('(1444)')).toBeInTheDocument()
        expect(screen.queryByText('(1400)')).not.toBeInTheDocument()
    })

    test('empty / failed games request shows "No completed games yet."', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = FAIL()
        await renderProfile()
        click(tab(/^Games/))
        await settle()
        expect(screen.getByText('No completed games yet.')).toBeInTheDocument()
    })

    test('#games in the URL opens the games tab on mount', async () => {
        window.history.replaceState(null, '', '/profile/bob#games')
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: [] }
        await renderProfile()
        expect(urls()).toContain('/api/profile/bob/games?limit=15&offset=0')
        expect(urls()).not.toContain('/api/profile/bob/games?limit=5&offset=0')
    })
})

// ── Stats tab ───────────────────────────────────────────────────────────────

describe('stats tab', () => {
    test('fetches /stats with cache: no-store once and renders totals and per-category breakdown', async () => {
        routes['/api/profile/bob/stats'] = {
            total: 12, wins: 7, losses: 4, draws: 1,
            ratings: { bullet: 1111.6, blitz: 1222, rapid: null },
            byCategory: { blitz: { played: 5, wins: 3, losses: 1, draws: 1 } },
        }
        await renderProfile()
        click(screen.getByRole('button', { name: 'Stats' }))
        await settle()
        expect(callFor('/api/profile/bob/stats')).toEqual(['/api/profile/bob/stats', { cache: 'no-store' }])
        expect(screen.getByText('Total Games')).toBeInTheDocument()
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('1112')).toBeInTheDocument()
        expect(screen.getByText('1222')).toBeInTheDocument()
        expect(screen.getAllByText('1200')).toHaveLength(2) // rapid null + classical missing
        expect(screen.getAllByText('Played')).toHaveLength(4)
        // revisiting the tab does not refetch
        click(screen.getByRole('button', { name: 'Overview' }))
        click(screen.getByRole('button', { name: 'Stats' }))
        await settle()
        expect(urls().filter(u => u === '/api/profile/bob/stats')).toHaveLength(1)
    })

    test('F12: a failed stats request shows an error with Retry instead of a spinner forever', async () => {
        let calls = 0
        routes['/api/profile/bob/stats'] = () => {
            calls++
            return calls === 1 ? jsonResponse({ error: 'boom' }, false) : jsonResponse({ total: 3 })
        }
        await renderProfile()
        click(screen.getByRole('button', { name: 'Stats' }))
        await settle()
        expect(screen.getByText('Could not load stats.')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Retry' }))
        await settle()
        expect(screen.getByText('Total Games')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
    })

    test('F12: a rejected stats fetch is handled (error state, no unhandled rejection)', async () => {
        routes['/api/profile/bob/stats'] = () => Promise.reject(new TypeError('offline'))
        await renderProfile()
        click(screen.getByRole('button', { name: 'Stats' }))
        await settle()
        expect(screen.getByText('Could not load stats.')).toBeInTheDocument()
    })
})

// ── Friends tab ─────────────────────────────────────────────────────────────

describe('friends tab', () => {
    const PENDING = [
        { id: 'f-1', requester: { username: 'carol', display_name: 'Carol', rating_rapid: 1501.7 } },
        { id: 'f-2', requester: { username: 'dave', display_name: null } },
    ]

    test('own profile: loads friends?userId=<my id> then /api/friends/pending; shows both lists', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        routes['/api/friends?userId=u-bob'] = [{ username: 'erin', display_name: 'Erin', rating_rapid: 1300, friendship_id: 'f-9' }]
        routes['/api/friends/pending'] = PENDING
        await renderProfile()
        click(tab('Friends'))
        await settle()
        const friendCalls = fetchMock.mock.calls.filter(c => String(c[0]).startsWith('/api/friends'))
        expect(friendCalls).toEqual([['/api/friends?userId=u-bob'], ['/api/friends/pending']])
        expect(screen.getByText('Pending Requests')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Carol' })).toHaveAttribute('href', '/profile/carol')
        expect(screen.getByText('1502 Rapid')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'dave' })).toBeInTheDocument()
        expect(screen.getByText('My Friends')).toBeInTheDocument()
        expect(screen.getByText('(1)')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Challenge/ })).toHaveAttribute('href', '/challenge/erin')
    })

    test('Accept PUTs /api/friends/<id>?action=accept and moves the requester into the friends list', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        routes['/api/friends?userId=u-bob'] = []
        routes['/api/friends/pending'] = PENDING
        routes['/api/friends/f-1?action=accept'] = {}
        await renderProfile()
        click(tab('Friends'))
        await settle()
        expect(screen.getByText('No friends yet.')).toBeInTheDocument()
        click(screen.getAllByRole('button', { name: 'Accept' })[0])
        await settle()
        expect(callFor('/api/friends/f-1?action=accept')).toEqual(['/api/friends/f-1?action=accept', { method: 'PUT' }])
        expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1)
        expect(screen.getByText('(1)')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Challenge/ })).toHaveAttribute('href', '/challenge/carol')
    })

    test('Decline PUTs ?action=decline and just removes the request (even if the PUT fails)', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        routes['/api/friends?userId=u-bob'] = []
        routes['/api/friends/pending'] = [PENDING[0]]
        routes['/api/friends/f-1?action=decline'] = FAIL()
        await renderProfile()
        click(tab('Friends'))
        await settle()
        click(screen.getByRole('button', { name: 'Decline' }))
        await settle()
        expect(callFor('/api/friends/f-1?action=decline')).toEqual(['/api/friends/f-1?action=decline', { method: 'PUT' }])
        expect(screen.getByText('No pending requests.')).toBeInTheDocument()
        expect(screen.getByText('No friends yet.')).toBeInTheDocument()
    })

    test('search filters friends by username or display name (case-insensitive)', async () => {
        routes['/api/profile/me'] = { id: 'u-bob', username: 'bob' }
        routes['/api/friends?userId=u-bob'] = [
            { username: 'erin', display_name: 'Erin E', friendship_id: 'a' },
            { username: 'frank', display_name: 'Zed', friendship_id: 'b' },
        ]
        routes['/api/friends/pending'] = []
        await renderProfile()
        click(tab('Friends'))
        await settle()
        fireEvent.change(screen.getByPlaceholderText('Search friends…'), { target: { value: 'ZE' } })
        expect(screen.queryByRole('link', { name: 'Erin E' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Zed' })).toBeInTheDocument()
    })

    test("other profile: only friends?userId=<their id>, \"<Name>'s Friends\", no pending, no challenge buttons", async () => {
        routes['/api/friends?userId=u-bob'] = [{ username: 'erin', display_name: 'Erin', friendship_id: 'f-9' }]
        await renderProfile()
        click(tab('Friends'))
        await settle()
        expect(urls()).toContain('/api/friends?userId=u-bob')
        expect(urls()).not.toContain('/api/friends/pending')
        expect(screen.getByText("Bobby's Friends")).toBeInTheDocument()
        expect(screen.queryByText('Pending Requests')).not.toBeInTheDocument()
        // only the header Challenge link remains
        expect(screen.getAllByRole('link', { name: /Challenge/ })).toHaveLength(1)
    })
})

// ── Presence ────────────────────────────────────────────────────────────────

describe('presence', () => {
    // F11 (was: 'subscribes to presence-watch-<id>-<Date.now()> keyed by profile id'): the badge now
    // reads PresenceProvider's shared `gambit-online-users` set, so the page opens no channel itself.
    test('opens no presence channel of its own; shows Online when the shared presence set has the profile id', async () => {
        const { rerender } = await renderProfile()
        const page = () => <ProfilePage params={routeParams({ username: 'bob' })} />
        expect(channels).toHaveLength(0)
        expect(screen.queryByText('Online')).not.toBeInTheDocument()

        onlineUserIds = new Set(['u-bob'])
        rerender(page())
        expect(screen.getByText('Online')).toBeInTheDocument()
        expect(screen.getByTitle('Online now')).toBeInTheDocument()

        onlineUserIds = new Set(['someone-else'])
        rerender(page())
        expect(screen.queryByText('Online')).not.toBeInTheDocument()
    })

    // F11 (was: 'unmount removes the channel'): there is no page-owned channel to remove.
    test('unmount removes no channel (the shared one belongs to PresenceProvider)', async () => {
        const { unmount } = await renderProfile()
        unmount()
        await settle()
        expect(removeChannel).not.toHaveBeenCalled()
    })
})
