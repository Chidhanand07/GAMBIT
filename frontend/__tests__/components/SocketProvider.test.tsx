/**
 * components/SocketProvider.tsx — one authenticated socket per signed-in user;
 * it is torn down on sign-out and rebuilt on sign-in [S2].
 */
import { act, render, screen } from '@testing-library/react'

const getSession = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession } }) }))

let pathname = '/lobby'
jest.mock('next/navigation', () => ({ usePathname: () => pathname }))

let profile: { id: string } | null = null
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile }) }))

const created: Array<{ url: string; getToken: () => Promise<string | null>; close: jest.Mock; socket: object }> = []
jest.mock('@/lib/socket/connection', () => ({
    createGameSocket: (opts: { url: string; getToken: () => Promise<string | null> }) => {
        const connection = { ...opts, close: jest.fn(), socket: { id: `socket-${created.length + 1}` } }
        created.push(connection)
        return connection
    },
}))

import SocketProvider, { useSocket } from '@/components/SocketProvider'

function Probe() {
    const socket = useSocket() as { id: string } | null
    return <div data-testid="probe">{socket ? socket.id : 'none'}</div>
}

const tree = () => (
    <SocketProvider>
        <Probe />
    </SocketProvider>
)

beforeEach(() => {
    created.length = 0
    pathname = '/lobby'
    profile = null
    getSession.mockReset()
})

test('signed out: no socket is created', () => {
    render(tree())
    expect(created).toEqual([])
    expect(screen.getByTestId('probe')).toHaveTextContent('none')
})

test('signed in: one socket whose token comes from the current Supabase session', async () => {
    profile = { id: 'me' }
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } })
    render(tree())
    expect(created).toHaveLength(1)
    expect(screen.getByTestId('probe')).toHaveTextContent('socket-1')
    expect(await created[0].getToken()).toBe('session-token')
})

test('no session → the token getter yields null', async () => {
    profile = { id: 'me' }
    getSession.mockResolvedValue({ data: { session: null } })
    render(tree())
    expect(await created[0].getToken()).toBeNull()
})

test('sign-out closes the socket; signing in as someone else opens a new one', () => {
    profile = { id: 'me' }
    const view = render(tree())
    profile = null
    act(() => view.rerender(tree()))
    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('probe')).toHaveTextContent('none')

    profile = { id: 'other' }
    act(() => view.rerender(tree()))
    expect(created).toHaveLength(2)
    expect(screen.getByTestId('probe')).toHaveTextContent('socket-2')
})

test.each(['/login', '/signup', '/reset-password'])('no socket on %s even when signed in', (path) => {
    pathname = path
    profile = { id: 'me' }
    render(tree())
    expect(created).toEqual([])
})
