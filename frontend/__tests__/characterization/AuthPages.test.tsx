/**
 * Characterization tests for the auth pages (fe-misc, PR 16 track):
 * app/auth/exchange/page.tsx, app/login/page.tsx, app/signup/page.tsx.
 * Black-box: render the default export, mock only next/* and the Supabase client.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = jest.fn()
const push = jest.fn()
const refresh = jest.fn()
let searchParams = new URLSearchParams()
// Next's router object is stable across renders; the mock must be too.
const router = { replace, push, refresh, back: jest.fn(), prefetch: jest.fn() }
jest.mock('next/navigation', () => ({
    useRouter: () => router,
    useSearchParams: () => searchParams,
}))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))

const auth = {
    exchangeCodeForSession: jest.fn(),
    setSession: jest.fn(),
    signInWithOAuth: jest.fn(),
    signInWithPassword: jest.fn(),
}
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }))

import ExchangePage from '@/app/auth/exchange/page'
import LoginPage from '@/app/login/page'
import SignupPage from '@/app/signup/page'

const flush = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {})
}

let fetchMock: jest.Mock
beforeEach(() => {
    jest.clearAllMocks()
    searchParams = new URLSearchParams()
    window.location.hash = ''
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

describe('auth/exchange', () => {
    test('PKCE code: exchanges it and replaces to `next`', async () => {
        searchParams = new URLSearchParams('code=c_FAKE&next=/profile/x')
        auth.exchangeCodeForSession.mockResolvedValue({ error: null })
        render(<ExchangePage />)
        await flush()
        expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c_FAKE')
        expect(replace.mock.calls).toEqual([['/profile/x']])
    })

    test.each([
        ['https://evil.example'],
        ['//evil.example'],
        ['/\\evil.example'],
        ['/\t/evil.example'],
        ['javascript:alert(1)'],
    ])('PKCE code: next=%j is not followed, the user lands on /lobby [S6]', async (next) => {
        searchParams = new URLSearchParams({ code: 'c_FAKE', next })
        auth.exchangeCodeForSession.mockResolvedValue({ error: null })
        render(<ExchangePage />)
        await flush()
        expect(replace.mock.calls).toEqual([['/lobby']])
    })

    test('implicit hash tokens: an off-site `next` is not followed either [S6]', async () => {
        searchParams = new URLSearchParams({ next: 'https://evil.example' })
        window.location.hash = '#access_token=at_FAKE&refresh_token=rt_FAKE'
        auth.setSession.mockResolvedValue({ error: null })
        render(<ExchangePage />)
        await flush()
        expect(replace.mock.calls).toEqual([['/lobby']])
    })

    test('implicit hash tokens: a same-origin `next` is followed', async () => {
        searchParams = new URLSearchParams({ next: '/join/tok' })
        window.location.hash = '#access_token=at_FAKE&refresh_token=rt_FAKE'
        auth.setSession.mockResolvedValue({ error: null })
        render(<ExchangePage />)
        await flush()
        expect(replace.mock.calls).toEqual([['/join/tok']])
    })

    test('PKCE failure: shows the error, then replaces to /login?error=oauth_failed after 2 s', async () => {
        jest.useFakeTimers()
        searchParams = new URLSearchParams('code=c_FAKE')
        auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } })
        render(<ExchangePage />)
        await flush()
        expect(screen.getByText('Sign-in error: bad code')).toBeInTheDocument()
        expect(console.error).not.toHaveBeenCalled() // S14
        expect(replace).not.toHaveBeenCalled()
        act(() => { jest.advanceTimersByTime(2000) })
        expect(replace.mock.calls).toEqual([['/login?error=oauth_failed']])
    })

    test('F17: leaving the page cancels the pending error redirect', async () => {
        jest.useFakeTimers()
        searchParams = new URLSearchParams('code=c_FAKE')
        auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } })
        const { unmount } = render(<ExchangePage />)
        await flush()
        unmount()
        act(() => { jest.advanceTimersByTime(2000) })
        expect(replace).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })

    test('F17: an exchange that settles after the page is gone navigates nowhere', async () => {
        searchParams = new URLSearchParams('code=c_FAKE')
        let settle!: (v: unknown) => void
        auth.exchangeCodeForSession.mockReturnValue(new Promise(r => { settle = r }))
        const { unmount } = render(<ExchangePage />)
        unmount()
        await act(async () => { settle({ error: null }) })
        expect(replace).not.toHaveBeenCalled()
    })

    test('implicit hash tokens: sets the session and replaces to /lobby by default', async () => {
        window.location.hash = '#access_token=at_FAKE&refresh_token=rt_FAKE'
        auth.setSession.mockResolvedValue({ error: null })
        render(<ExchangePage />)
        await flush()
        expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'at_FAKE', refresh_token: 'rt_FAKE' })
        expect(replace.mock.calls).toEqual([['/lobby']])
    })

    test('implicit hash failure shows the error', async () => {
        window.location.hash = '#access_token=at_FAKE&refresh_token=rt_FAKE'
        auth.setSession.mockResolvedValue({ error: { message: 'expired' } })
        render(<ExchangePage />)
        await flush()
        expect(screen.getByText('Sign-in error: expired')).toBeInTheDocument()
    })

    test('nothing to exchange: replaces straight to the login error', async () => {
        window.location.hash = '#foo=bar'
        render(<ExchangePage />)
        await flush()
        expect(replace.mock.calls).toEqual([['/login?error=oauth_failed']])
        expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
        expect(auth.setSession).not.toHaveBeenCalled()
    })
})

describe('login', () => {
    const fill = (container: HTMLElement, email: string, password: string) => {
        fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: email } })
        fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: password } })
    }

    test('bad credentials show an error that clears when the user types again', async () => {
        auth.signInWithPassword.mockResolvedValue({ error: { message: 'x' } })
        const { container } = render(<LoginPage />)
        fill(container, 'a@b.c', 'pw')
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await flush()
        expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' })
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
        fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: 'pw2' } })
        expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument()
    })

    test('a thrown sign-in shows the generic error', async () => {
        auth.signInWithPassword.mockRejectedValue(new Error('net'))
        const { container } = render(<LoginPage />)
        fill(container, 'a@b.c', 'pw')
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await flush()
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })

    test('success pushes to ?redirect (or /lobby) and refreshes', async () => {
        searchParams = new URLSearchParams('redirect=/join/tok')
        auth.signInWithPassword.mockResolvedValue({ error: null })
        const { container } = render(<LoginPage />)
        fill(container, 'a@b.c', 'pw')
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await flush()
        expect(push.mock.calls).toEqual([['/join/tok']])
        expect(refresh).toHaveBeenCalledTimes(1)
    })

    test.each([
        ['https://evil.example'],
        ['//evil.example'],
        ['/\\evil.example'],
        ['/\t/evil.example'],
        ['javascript:alert(1)'],
    ])('success with redirect=%j goes to /lobby, never off-site [S6]', async (redirect) => {
        searchParams = new URLSearchParams({ redirect })
        auth.signInWithPassword.mockResolvedValue({ error: null })
        const { container } = render(<LoginPage />)
        fill(container, 'a@b.c', 'pw')
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await flush()
        expect(push.mock.calls).toEqual([['/lobby']])
    })

    test('success without redirect goes to /lobby', async () => {
        auth.signInWithPassword.mockResolvedValue({ error: null })
        const { container } = render(<LoginPage />)
        fill(container, 'a@b.c', 'pw')
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await flush()
        expect(push.mock.calls).toEqual([['/lobby']])
    })

    test('Google sign-in uses the /auth/callback redirect and reports failure', async () => {
        auth.signInWithOAuth.mockResolvedValue({ error: { message: 'no' } })
        render(<LoginPage />)
        fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))
        await flush()
        expect(auth.signInWithOAuth).toHaveBeenCalledWith({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
        expect(screen.getByText('Google sign-in failed. Please try again.')).toBeInTheDocument()
    })

    test.each([
        ['oauth_failed', 'Google sign-in failed. Please try again.'],
        ['no_code', 'Google sign-in failed. Please try again.'],
        ['Some <b>raw</b> provider text', 'Sign-in failed. Please try again.'],
    ])('F17: ?error=%j from the OAuth callback is shown, not dropped', (code, message) => {
        searchParams = new URLSearchParams({ error: code, redirect: '/game/1' })
        window.history.replaceState(null, '', `/login?${searchParams}`)
        const { container } = render(<LoginPage />)
        expect(screen.getByText(message)).toBeInTheDocument()
        expect(window.location.search).toBe('?redirect=%2Fgame%2F1')
        fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: 'a' } })
        expect(screen.queryByText(message)).not.toBeInTheDocument()
        window.history.replaceState(null, '', '/')
    })

    test('static content and links', () => {
        render(<LoginPage />)
        expect(screen.getByText('Welcome Back')).toBeInTheDocument()
        expect(screen.getByText('Forgot password?').closest('a')).toHaveAttribute('href', '/reset-password')
        expect(screen.getByText('Sign up').closest('a')).toHaveAttribute('href', '/signup')
    })
})

describe('signup', () => {
    const type = (id: string, value: string) => fireEvent.change(document.getElementById(id)!, { target: { value } })
    const submit = () => fireEvent.submit(document.querySelector('form')!)

    async function renderSignup() {
        const utils = render(<SignupPage />)
        await flush()
        return utils
    }

    test.each([
        [{ password: 'short', confirm: 'short', username: 'abc' }, 'Password must be at least 8 characters'],
        [{ password: 'longenough', confirm: 'different', username: 'abc' }, 'Passwords do not match'],
        [{ password: 'longenough', confirm: 'longenough', username: 'ab' }, 'Username must be at least 3 characters'],
        [{ password: 'longenough', confirm: 'longenough', username: 'a-b-c' }, 'Username may only contain letters, numbers, and underscores'],
    ])('client validation %#', async (input, message) => {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
        await renderSignup()
        type('email', 'a@b.c')
        type('password', input.password)
        type('confirm', input.confirm)
        type('username', input.username)
        submit()
        expect(screen.getByText(message)).toBeInTheDocument()
        expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/signup', expect.anything())
    })

    test('mismatched passwords mark the confirm field red; typing clears the error', async () => {
        await renderSignup()
        type('password', 'longenough')
        type('confirm', 'different')
        submit()
        expect(document.getElementById('confirm')!.className).toContain('border-[#C0392B]')
        type('confirm', 'longenough')
        expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
        expect(document.getElementById('confirm')!.className).toContain('border-border-strong')
    })

    test('debounced username check: 500 ms, then taken disables submit', async () => {
        jest.useFakeTimers()
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ available: false }) })
        await renderSignup()
        type('username', 'taken_name')
        expect(fetchMock).not.toHaveBeenCalled()
        await act(async () => { jest.advanceTimersByTime(500) })
        await flush()
        expect(fetchMock.mock.calls).toEqual([['http://127.0.0.1:3001/api/users/check-username?u=taken_name']])
        expect(screen.getByRole('button', { name: 'Sign Up' })).toBeDisabled()
        expect(document.querySelector('.text-\\[\\#C0392B\\].lucide-x, svg.text-\\[\\#C0392B\\]')).not.toBeNull()
    })

    test('available username shows the green check; short usernames do not hit the API', async () => {
        jest.useFakeTimers()
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ available: true }) })
        await renderSignup()
        type('username', 'ab')
        await act(async () => { jest.advanceTimersByTime(600) })
        expect(fetchMock).not.toHaveBeenCalled()
        type('username', 'free_name')
        await act(async () => { jest.advanceTimersByTime(500) })
        await flush()
        expect(document.querySelector('svg.text-indicator-green')).not.toBeNull()
        expect(screen.getByRole('button', { name: 'Sign Up' })).not.toBeDisabled()
    })

    async function fillValid() {
        type('email', 'a@b.c')
        type('password', 'longenough')
        type('confirm', 'longenough')
        type('username', 'new_user')
    }

    test('API error is shown from data.error', async () => {
        fetchMock.mockImplementation(async (url: string) =>
            url === '/api/auth/signup'
                ? { ok: false, status: 400, json: async () => ({ error: 'Email taken' }) }
                : { ok: false, json: async () => ({}) },
        )
        await renderSignup()
        await fillValid()
        submit()
        await flush()
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'a@b.c', password: 'longenough', username: 'new_user' }),
        })
        expect(screen.getByText('Email taken')).toBeInTheDocument()
    })

    test.each([
        [{ data: { session: null, user: null }, error: { message: 'nope' } }, 'Account created! Please sign in.'],
        [{ data: { session: null, user: null }, error: null }, 'Account created! Please confirm your email then sign in.'],
    ])('post-signup sign-in outcome %#', async (signIn, message) => {
        fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }))
        auth.signInWithPassword.mockResolvedValue(signIn)
        await renderSignup()
        await fillValid()
        submit()
        await flush()
        expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'longenough' })
        expect(screen.getByText(message)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign Up' })).not.toBeDisabled()
    })

    test('network failure shows the connection error', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url === '/api/auth/signup') throw new Error('offline')
            return { ok: false, json: async () => ({}) }
        })
        await renderSignup()
        await fillValid()
        submit()
        await flush()
        expect(screen.getByText('Connection failed. Please check your internet connection.')).toBeInTheDocument()
        // S14: the failure is shown to the user, not written to the browser console.
        expect(console.error).not.toHaveBeenCalled()
        expect(console.log).not.toHaveBeenCalled()
        expect(console.warn).not.toHaveBeenCalled()
    })

    test('Google button calls OAuth with the callback redirect', async () => {
        auth.signInWithOAuth.mockResolvedValue({ error: null })
        await renderSignup()
        fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))
        await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledWith({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        }))
        expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/login')
    })
})
