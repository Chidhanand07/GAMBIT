// TWO-FACTOR (ADR F-144): "Ask for a code when you sign in". After the password, an AAL1 session
// of a user with a verified factor must enter the code before it is sent on; pages send such a
// session back to /login to finish.
import { act, fireEvent, render, screen } from '@testing-library/react'

const push = jest.fn()
const replace = jest.fn()
const refresh = jest.fn()
let params = new URLSearchParams('redirect=/settings')
let pathname = '/lobby'
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace, refresh }),
    useSearchParams: () => params,
    usePathname: () => pathname,
}))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))

const auth = {
    mfa: {
        getAuthenticatorAssuranceLevel: jest.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })),
        listFactors: jest.fn(async () => ({ data: { totp: [{ id: 'f1' }], all: [] }, error: null })),
        challengeAndVerify: jest.fn(async ({ code }: { code: string }) =>
            code === '123456' ? { data: {}, error: null } : { data: null, error: { message: 'Invalid' } }),
    },
}
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }))
let profile: { id: string } | null = { id: 'u1' }
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, refetch: jest.fn() }) }))

import { LoginForm } from '@/features/auth/components/LoginForm'
import SecondFactorGate from '@/features/auth/components/SecondFactorGate'

const flush = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {})
}

beforeEach(() => {
    jest.clearAllMocks()
    // F-101: the password goes to POST /api/auth/login, which sets the session cookies.
    ;(global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    params = new URLSearchParams('redirect=/settings')
    pathname = '/lobby'
    profile = { id: 'u1' }
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
})

async function signInWithPassword() {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email or username'), { target: { value: 'me@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
}

describe('sign-in with two-factor on', () => {
    test('after the password, the code step is shown and nothing is opened yet', async () => {
        await signInWithPassword()
        expect(screen.getByText('Two-factor sign-in')).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
    })

    test('a wrong code is refused; the right one continues to the requested page', async () => {
        await signInWithPassword()
        fireEvent.change(screen.getByLabelText('Authentication code'), { target: { value: '000000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
        await flush()
        expect(screen.getByText(/That code is not right/)).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
        fireEvent.change(screen.getByLabelText('Authentication code'), { target: { value: '123456' } })
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
        await flush()
        expect(auth.mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'f1', code: '123456' })
        expect(push).toHaveBeenCalledWith('/settings')
    })

    test('two-factor off: the password alone signs in, as before', async () => {
        auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
        await signInWithPassword()
        expect(push).toHaveBeenCalledWith('/settings')
        expect(screen.queryByText('Two-factor sign-in')).not.toBeInTheDocument()
    })

    test('sent back with ?mfa=1 (e.g. after Google), the code step opens at once', async () => {
        params = new URLSearchParams('mfa=1&redirect=/lobby')
        render(<LoginForm />)
        await flush()
        expect(screen.getByText('Two-factor sign-in')).toBeInTheDocument()
    })
})

describe('SecondFactorGate', () => {
    test('an unfinished two-factor sign-in on any page is sent to /login to finish', async () => {
        render(<SecondFactorGate />)
        await flush()
        expect(replace).toHaveBeenCalledWith('/login?mfa=1&redirect=%2Flobby')
    })

    test('finished (AAL2), signed out, or already on /login: nothing happens', async () => {
        auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
        const { unmount } = render(<SecondFactorGate />)
        await flush()
        unmount()
        auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
        pathname = '/login'
        const second = render(<SecondFactorGate />)
        await flush()
        second.unmount()
        profile = null
        pathname = '/lobby'
        render(<SecondFactorGate />)
        await flush()
        expect(replace).not.toHaveBeenCalled()
    })
})
