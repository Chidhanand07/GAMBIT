/**
 * Characterization tests (fe-misc, PR 16 track) for
 * app/challenge/[username]/page.tsx, app/join/[token]/page.tsx and app/leaderboard/page.tsx.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createFakeSocket, jsonResponse } from './fakeSocket'

const push = jest.fn()
const back = jest.fn()
const router = { push, back, replace: jest.fn(), prefetch: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}))

const socket = createFakeSocket()
let profile: any = null
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socket }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile }) }))

let session: any = { access_token: 'at_FAKE' }
jest.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}))

import ChallengePage from '@/app/challenge/[username]/page'
import JoinPage from '@/app/join/[token]/page'
import LeaderboardPage from '@/app/leaderboard/page'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

let fetchMock: jest.Mock
beforeEach(() => {
    socket.reset()
    push.mockClear()
    back.mockClear()
    profile = null
    session = { access_token: 'at_FAKE' }
    fetchMock = jest.fn(async () => jsonResponse(null, false))
    ;(global as any).fetch = fetchMock
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('challenge/[username]', () => {
    const BOB = { id: 'bob-id', username: 'bob', display_name: 'Bobby', avatar_url: null, rating_rapid: 1333.4 }

    async function renderChallenge(opponent: any = BOB) {
        fetchMock.mockImplementation(async () => (opponent ? jsonResponse(opponent) : jsonResponse(null, false)))
        const utils = render(<ChallengePage params={{ username: 'bob b' }} />)
        await flush()
        return utils
    }

    test('fetches the opponent by encoded username; spinner until it loads', async () => {
        const { container } = await renderChallenge(null)
        expect(fetchMock.mock.calls).toEqual([['/api/profile/bob%20b']])
        expect(container.querySelector('.animate-spin')).not.toBeNull()
        expect(screen.queryByText('Challenge a Player')).not.toBeInTheDocument()
    })

    test('renders opponent card and defaults (10 min, rated, random)', async () => {
        profile = { id: 'me', username: 'me1', display_name: null }
        await renderChallenge()
        expect(screen.getByText('Bobby')).toBeInTheDocument()
        expect(screen.getByText('@bob · 1333 Rapid')).toBeInTheDocument()
        expect(screen.getByText('B')).toBeInTheDocument()
        expect(screen.getByText('Bobby').closest('a')).toHaveAttribute('href', '/profile/bob')
        expect(screen.getByRole('button', { name: '10 min' }).className).toContain('border-accent bg-accent/10')
        expect(screen.getByRole('button', { name: '⊕ Random' }).className).toContain('border-accent bg-accent/10')
        expect(socket.listenedEvents()).toEqual(['challenge_declined', 'challenge_ready'])
    })

    test('send emits the exact challenge_request payload and locks the button', async () => {
        profile = { id: 'me', username: 'me1', display_name: null }
        const { container } = await renderChallenge()
        fireEvent.click(screen.getByRole('button', { name: '5 min' }))
        fireEvent.click(container.querySelector('button.relative.w-11')!)
        fireEvent.click(screen.getByRole('button', { name: '♚ Black' }))
        fireEvent.click(screen.getByRole('button', { name: /Send Challenge/ }))
        expect(socket.emitted('challenge_request')).toEqual([
            { from_user_id: 'me', to_user_id: 'bob-id', from_username: 'me1', time_control: '5', is_rated: false, color: 'black' },
        ])
        expect(screen.getByText('Challenge sent! Waiting for bob to accept…')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Challenge Sent…/ })).toBeDisabled()
    })

    test('declined re-enables sending; ready navigates to the game', async () => {
        profile = { id: 'me', username: 'me1', display_name: 'Me' }
        await renderChallenge()
        fireEvent.click(screen.getByRole('button', { name: /Send Challenge/ }))
        socket.serverSends('challenge_declined', { by: 'bob-id' })
        expect(screen.getByText('bob declined the challenge.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Send Challenge/ })).not.toBeDisabled()
        socket.serverSends('challenge_ready', { game_id: 'g-42' })
        expect(push.mock.calls).toEqual([['/game/g-42']])
    })

    test('signed-out viewers get a disabled send button; back button calls router.back', async () => {
        await renderChallenge({ ...BOB, display_name: null, avatar_url: 'http://img/a.png', rating_rapid: undefined })
        expect(screen.getByText('@bob · 1200 Rapid')).toBeInTheDocument()
        expect(document.querySelector('img')).toHaveAttribute('src', 'http://img/a.png')
        expect(screen.getByRole('button', { name: /Send Challenge/ })).toBeDisabled()
        fireEvent.click(screen.getAllByRole('button')[0])
        expect(back).toHaveBeenCalledTimes(1)
    })
})

describe('join/[token]', () => {
    const GAME = {
        id: 'g-1', white_id: 'creator', black_id: null, time_control: '5', is_rated: true,
        white: { username: 'alice' }, black: null,
    }
    const routes = (game: any, me: any, post?: () => any) =>
        fetchMock.mockImplementation(async (url: string, init?: any) => {
            if (url === 'http://127.0.0.1:3001/api/games/join/tok_FAKE_0001') {
                if (init?.method === 'POST') return post!()
                return game ? jsonResponse(game) : jsonResponse({ error: 'gone' }, false)
            }
            if (url === '/api/profile/me') return me ? jsonResponse(me) : jsonResponse(null, false)
            return jsonResponse(null, false)
        })

    async function renderJoin() {
        const utils = render(<JoinPage params={{ token: 'tok_FAKE_0001' }} />)
        await flush()
        return utils
    }

    test('missing game shows the expired screen', async () => {
        routes(null, null)
        await renderJoin()
        expect(fetchMock.mock.calls).toEqual([['http://127.0.0.1:3001/api/games/join/tok_FAKE_0001'], ['/api/profile/me']])
        expect(screen.getByText('Invite expired or not found')).toBeInTheDocument()
    })

    test('invitee sees details and joins with a bearer POST', async () => {
        routes(GAME, { id: 'guest' }, () => jsonResponse({ id: 'g-1' }))
        await renderJoin()
        expect(screen.getByText('alice')).toBeInTheDocument()
        expect(screen.getByText(/Blitz · 5 min/)).toBeInTheDocument()
        expect(screen.getByText('Yes')).toBeInTheDocument()
        expect(screen.getByText('♚ Black')).toBeInTheDocument()
        expect(socket.emit).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: /Accept & Play/ }))
        await flush()
        expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:3001/api/games/join/tok_FAKE_0001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer at_FAKE' },
            body: JSON.stringify({}),
        })
        expect(push.mock.calls).toEqual([['/game/g-1']])
    })

    test('join failure shows the server error and re-enables the button', async () => {
        routes({ ...GAME, is_rated: false, time_control: '30' }, { id: 'guest' }, () => jsonResponse({ error: 'Game full' }, false))
        await renderJoin()
        expect(screen.getByText('Casual')).toBeInTheDocument()
        expect(screen.getByText(/Classical · 30 min/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Accept & Play/ }))
        await flush()
        expect(screen.getByText('Game full')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Accept & Play/ })).not.toBeDisabled()
    })

    test('signed-out invitee is sent to login; no session also goes to login', async () => {
        routes(GAME, null)
        await renderJoin()
        fireEvent.click(screen.getByRole('button', { name: /Accept & Play/ }))
        expect(push.mock.calls).toEqual([['/login?redirect=/join/tok_FAKE_0001']])
    })

    test('no supabase session redirects to login', async () => {
        session = null
        routes(GAME, { id: 'guest' })
        await renderJoin()
        fireEvent.click(screen.getByRole('button', { name: /Accept & Play/ }))
        await flush()
        expect(push.mock.calls).toEqual([['/login?redirect=/join/tok_FAKE_0001']])
    })

    test('creator authenticates, joins the room and follows game_start', async () => {
        routes({ ...GAME, white_id: null, black_id: 'creator', white: null, black: { username: 'carl' }, time_control: '1' }, { id: 'creator' })
        await renderJoin()
        expect(socket.emit.mock.calls).toEqual([['authenticate', 'creator'], ['join_game', 'g-1']])
        expect(screen.getByText('Waiting for opponent to join...')).toBeInTheDocument()
        expect(screen.getByText('♚ Black')).toBeInTheDocument()
        expect(screen.getByText(/Bullet · 1 min/)).toBeInTheDocument()
        socket.serverSends('game_start', { id: 'g-1' })
        expect(push.mock.calls).toEqual([['/game/g-1']])
    })
})

describe('leaderboard', () => {
    const P = (username: string, rating: number, extra: any = {}) => ({
        username, display_name: null, avatar_url: null, rating_rapid: rating, rating_bullet: rating - 100,
        games_played: 10, wins: 4, ...extra,
    })

    test('skeleton while loading, then empty state', async () => {
        let resolve!: (v: any) => void
        fetchMock.mockImplementation(() => new Promise(r => { resolve = r }))
        const { container } = render(<LeaderboardPage />)
        expect(container.querySelectorAll('.skeleton')).toHaveLength(8)
        await act(async () => resolve(jsonResponse([])))
        await flush()
        expect(fetchMock.mock.calls).toEqual([['/api/leaderboard?field=rating_rapid']])
        expect(screen.getByText('No ranked players yet')).toBeInTheDocument()
    })

    test('podium order, table rows, stats; switching filter refetches', async () => {
        const players = [P('a', 1800, { display_name: 'Ace' }), P('b', 1700), P('c', 1600, { games_played: 0 }), P('d', 1500)]
        fetchMock.mockImplementation(async () => jsonResponse(players))
        const { container } = render(<LeaderboardPage />)
        await flush()
        const podium = container.querySelector('.grid.grid-cols-3.gap-3.mb-6')!
        expect([...podium.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/profile/b', '/profile/a', '/profile/c'])
        expect(within(podium as HTMLElement).getByText('#1')).toBeInTheDocument()
        const rows = container.querySelectorAll('tbody tr')
        expect(rows).toHaveLength(4)
        expect(rows[0].textContent).toBe('1AAce@a1800rapid1040%')
        expect(rows[2].textContent).toBe('3Cc@c1600rapid00%')
        expect(screen.getByText('Total Players').previousSibling!.textContent).toBe('4')
        expect(screen.getByText('Avg Rating').previousSibling!.textContent).toBe('1650')
        fireEvent.click(screen.getByRole('button', { name: 'Bullet' }))
        await flush()
        expect(fetchMock.mock.calls.map(c => c[0])).toEqual(['/api/leaderboard?field=rating_rapid', '/api/leaderboard?field=rating_bullet'])
        expect(container.querySelectorAll('tbody tr')[0].textContent).toBe('1AAce@a1700bullet1040%')
    })

    test('fewer than three players: no podium; non-ok response shows the empty state', async () => {
        fetchMock.mockImplementationOnce(async () => jsonResponse([P('solo', 1234.6, { avatar_url: 'http://img/s.png' })]))
        const { container } = render(<LeaderboardPage />)
        await flush()
        expect(container.querySelector('.grid.grid-cols-3.gap-3.mb-6')).toBeNull()
        expect(container.querySelector('tbody img')).toHaveAttribute('src', 'http://img/s.png')
        fetchMock.mockImplementationOnce(async () => jsonResponse(null, false))
        fireEvent.click(screen.getByRole('button', { name: 'Blitz' }))
        await flush()
        expect(screen.getByText('No ranked players yet')).toBeInTheDocument()
    })
})
