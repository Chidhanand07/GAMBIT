/** @jest-environment node */
// CHANGE-EMAIL (ADR F-143): POST /api/account/email and the /auth/confirm link handler.
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)
jest.mock('@/lib/server/rateLimitStore', () => ({
    ...jest.requireActual('@/lib/server/rateLimitStore'),
    rateLimitStore: jest.fn(),
}))

import { POST } from '@/app/api/account/email/route'
import { GET as confirm } from '@/app/auth/confirm/route'
import { rateLimitStore } from '@/lib/server/rateLimitStore'
import { failingStore, MemoryRateLimitStore } from '../helpers/rateLimitFakes'
import { db, forgeCookie, json, req, resetHarness, signInWithCookie, supabaseJsMock, uid } from '../helpers/routeHarness'

const storeFactory = rateLimitStore as jest.MockedFunction<typeof rateLimitStore>
const post = (body: unknown) => POST(req('/api/account/email', { method: 'POST', body }))

function signedInAs(email: string) {
    signInWithCookie(uid('me'))
    db.auth.getUser.mockResolvedValue({ data: { user: { id: uid('me'), email } }, error: null } as any)
}

beforeEach(() => {
    resetHarness()
    storeFactory.mockReturnValue(new MemoryRateLimitStore())
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/account/email', () => {
    test('signed out or a forged cookie → 401, Auth is never asked to change anything', async () => {
        expect((await post({ email: 'new@example.com' })).status).toBe(401)
        forgeCookie(uid('me'))
        expect((await post({ email: 'new@example.com' })).status).toBe(401)
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })

    test.each([[{}], [{ email: 'not-an-email' }], [{ email: `${'a'.repeat(250)}@x.io` }]])('invalid body %p → 400', async (body) => {
        signedInAs('me@example.com')
        expect((await post(body)).status).toBe(400)
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })

    test('the current address (any case) → 400, nothing mailed', async () => {
        signedInAs('me@example.com')
        expect(await json(await post({ email: ' ME@Example.com ' }))).toEqual({ status: 400, body: { error: 'That is already your email.' } })
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })

    test('starts the change on the session client with the confirm link; answers pending', async () => {
        signedInAs('me@example.com')
        supabaseJsMock.createClient.mockClear()
        db.auth.updateUser.mockResolvedValue({ data: { user: { new_email: 'new@example.com' } }, error: null })
        expect(await json(await post({ email: 'New@Example.com' }))).toEqual({ status: 200, body: { pending: true, email: 'new@example.com' } })
        expect(db.auth.updateUser).toHaveBeenCalledWith(
            { email: 'new@example.com' },
            { emailRedirectTo: 'http://localhost/auth/confirm?next=%2Fsettings' },
        )
        expect(supabaseJsMock.createClient).not.toHaveBeenCalled()
    })

    test.each([
        [{ code: 'email_exists', message: 'A user with this email address has already been registered', status: 422 }, 409],
        [{ code: 'over_email_send_rate_limit', message: 'rate', status: 429 }, 429],
        [{ code: 'email_address_invalid', message: 'bad', status: 400 }, 400],
        [{ code: 'unexpected_failure', message: 'boom', status: 500 }, 500],
    ])('Auth error %p → %p with a fixed message', async (error, status) => {
        signedInAs('me@example.com')
        db.auth.updateUser.mockResolvedValue({ data: { user: null }, error })
        const res = await json(await post({ email: 'new@example.com' }))
        expect(res.status).toBe(status)
        expect(res.body.error).not.toContain('boom')
    })

    test('rate limited per user: the 6th request in an hour is a 429 before any Auth call', async () => {
        signedInAs('me@example.com')
        for (let i = 0; i < 5; i++) await post({ email: `n${i}@example.com` })
        db.auth.updateUser.mockClear()
        const res = await post({ email: 'n9@example.com' })
        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBeTruthy()
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })

    test('fail closed: a broken rate-limit store refuses with 503', async () => {
        storeFactory.mockReturnValue(failingStore)
        signedInAs('me@example.com')
        expect(await json(await post({ email: 'new@example.com' }))).toEqual({ status: 503, body: { error: 'rate_limit_unavailable' } })
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })

    test('fail closed in production without a store; allowed in development', async () => {
        storeFactory.mockReturnValue(null)
        signedInAs('me@example.com')
        const env = process.env as Record<string, string | undefined>
        const before = env.NODE_ENV
        env.NODE_ENV = 'production'
        try {
            expect((await post({ email: 'new@example.com' })).status).toBe(503)
        } finally {
            env.NODE_ENV = before
        }
        expect((await post({ email: 'new@example.com' })).status).toBe(200)
    })
})

describe('GET /auth/confirm', () => {
    const get = (query: string) => confirm(req(`/auth/confirm?${query}`))

    test('a valid email_change link: verified server-side, then the settings page says so', async () => {
        const res = await get('token_hash=abc123&type=email_change&next=%2Fsettings')
        expect(db.auth.verifyOtp).toHaveBeenCalledWith({ type: 'email_change', token_hash: 'abc123' })
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('http://localhost/settings?email=confirmed')
    })

    test('any other link type, or no token, is refused without asking Auth', async () => {
        for (const q of ['token_hash=abc&type=signup&next=%2Fsettings', 'type=email_change&next=%2Fsettings', 'token_hash=abc&type=recovery']) {
            const res = await get(q)
            expect(res.headers.get('location')).toContain('email=link_invalid')
        }
        expect(db.auth.verifyOtp).not.toHaveBeenCalled()
    })

    test('an expired or used token → link_invalid', async () => {
        db.auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'Token has expired', status: 403 } })
        const res = await get('token_hash=abc&type=email_change&next=%2Fsettings')
        expect(res.headers.get('location')).toBe('http://localhost/settings?email=link_invalid')
    })

    test('next must be a path on this site (S6): an absolute URL falls back to /lobby', async () => {
        const res = await get('token_hash=abc&type=email_change&next=https%3A%2F%2Fevil.example')
        expect(res.headers.get('location')).toBe('http://localhost/lobby?email=confirmed')
    })
})

describe('POST /api/account/email with two-factor on (ADR F-144)', () => {
    test('an AAL1 session cannot change the e-mail: 403 mfa_required, nothing mailed', async () => {
        signInWithCookie(uid('me'))
        db.auth.getClaims.mockResolvedValue({ data: { claims: { sub: uid('me'), aal: 'aal1' } }, error: null })
        db.auth.getUser.mockResolvedValue({ data: { user: { id: uid('me'), email: 'me@example.com', factors: [{ status: 'verified' }] } }, error: null } as any)
        expect(await json(await post({ email: 'new@example.com' }))).toEqual({ status: 403, body: { error: 'mfa_required' } })
        expect(db.auth.updateUser).not.toHaveBeenCalled()
    })
})
