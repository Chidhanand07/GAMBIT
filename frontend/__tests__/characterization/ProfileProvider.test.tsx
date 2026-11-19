/**
 * Characterization tests (fe-misc, PR 16 track) for components/ProfileProvider.tsx.
 */
import { act, render, screen } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

// ── Supabase client double: auth state listener ──
let authListener: ((event: string) => void) | null = null
const unsubscribe = jest.fn()
// F-111: the provider asks for /api/profile/me only when the browser holds a session.
const getSession = jest.fn(async () => ({ data: { session: { access_token: 't' } as object | null } }))
const supabase = {
    auth: {
        getSession,
        onAuthStateChange: jest.fn((cb: any) => {
            authListener = cb
            return { data: { subscription: { unsubscribe } } }
        }),
    },
}
jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))

import ProfileProvider, { useProfile } from '@/components/ProfileProvider'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

beforeEach(() => {
    jest.clearAllMocks()
    authListener = null
})

describe('ProfileProvider', () => {
    let fetchMock: jest.Mock
    let reads: any[]
    function Probe() {
        const v = useProfile()
        reads.push(v)
        return <div data-testid="probe">{v.loading ? 'loading' : v.profile ? v.profile.username : 'none'}</div>
    }
    beforeEach(() => {
        reads = []
        fetchMock = jest.fn(async () => jsonResponse({ id: 'u1', username: 'alice' }))
        ;(global as any).fetch = fetchMock
    })

    test('default context outside the provider', () => {
        render(<Probe />)
        expect(reads[0].profile).toBeNull()
        expect(reads[0].loading).toBe(true)
        expect(reads[0].refetch()).toBeUndefined()
    })

    test('fetches /api/profile/me once on mount and exposes the profile', async () => {
        render(<ProfileProvider><Probe /></ProfileProvider>)
        expect(screen.getByTestId('probe')).toHaveTextContent('loading')
        await flush()
        expect(fetchMock.mock.calls).toEqual([['/api/profile/me']])
        expect(screen.getByTestId('probe')).toHaveTextContent('alice')
    })

    test('non-ok and thrown fetches both leave profile null and stop loading', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(null, false))
        const { unmount } = render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
        unmount()
        fetchMock.mockRejectedValueOnce(new Error('offline'))
        render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
    })

    test('auth events: SIGNED_OUT clears, SIGNED_IN / TOKEN_REFRESHED refetch, others ignored', async () => {
        const { unmount } = render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
        act(() => authListener!('SIGNED_OUT'))
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
        act(() => authListener!('SIGNED_IN'))
        await flush()
        expect(screen.getByTestId('probe')).toHaveTextContent('alice')
        act(() => authListener!('TOKEN_REFRESHED'))
        act(() => authListener!('USER_UPDATED'))
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(3)
        unmount()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    test('F17: a profile request still in flight at SIGNED_OUT does not bring the profile back', async () => {
        render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        expect(screen.getByTestId('probe')).toHaveTextContent('alice')
        let resolveLate!: (v: unknown) => void
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolveLate = r }))
        await act(async () => { authListener!('TOKEN_REFRESHED') })
        await act(async () => { authListener!('SIGNED_OUT') })
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
        await act(async () => { resolveLate(jsonResponse({ id: 'u1', username: 'alice' })) })
        await flush()
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
    })

    test('[F-111] a guest (no session in this browser) never requests /api/profile/me, so no 401 is logged', async () => {
        getSession.mockResolvedValue({ data: { session: null } })
        render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        expect(fetchMock).not.toHaveBeenCalled()
        expect(screen.getByTestId('probe')).toHaveTextContent('none')
        getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    })

    test('refetch from context re-requests the profile', async () => {
        render(<ProfileProvider><Probe /></ProfileProvider>)
        await flush()
        await act(async () => { await reads[reads.length - 1].refetch() })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})

