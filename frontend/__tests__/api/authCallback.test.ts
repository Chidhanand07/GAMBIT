/** @jest-environment node */
/**
 * GET /auth/callback [S6]: after the OAuth code exchange the user is sent to `next` only
 * when it is a path on this site; anything else goes to /lobby (was: `new URL(next, request.url)`
 * followed `?next=https://evil.example`).
 */
const exchangeCodeWithRetry = jest.fn()
const ensureOAuthProfile = jest.fn()
jest.mock('@/lib/server/auth', () => ({ exchangeCodeWithRetry: (...a: unknown[]) => exchangeCodeWithRetry(...a) }))
jest.mock('@/lib/server/profiles', () => ({ ensureOAuthProfile: (...a: unknown[]) => ensureOAuthProfile(...a) }))
jest.mock('@/lib/server/supabase', () => ({ createResponseCookieClient: () => ({}) }))

import { NextRequest } from 'next/server'
import { GET } from '@/app/auth/callback/route'

const ORIGIN = 'https://gambit.example'
const callback = (query: string) => GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`))
const location = async (query: string) => (await callback(query)).headers.get('location')

beforeEach(() => {
    jest.clearAllMocks()
    exchangeCodeWithRetry.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', user_metadata: {} }, lastError: null })
    ensureOAuthProfile.mockResolvedValue(undefined)
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('GET /auth/callback', () => {
    test('without `next` the user lands on /lobby', async () => {
        expect(await location('code=c_FAKE')).toBe(`${ORIGIN}/lobby`)
        expect(exchangeCodeWithRetry).toHaveBeenCalledWith(expect.anything(), 'c_FAKE')
    })

    test('a same-origin path in `next` is followed, query string included', async () => {
        expect(await location(`code=c_FAKE&next=${encodeURIComponent('/join/tok_1?x=1')}`)).toBe(`${ORIGIN}/join/tok_1?x=1`)
    })

    test.each([
        ['https://evil.example'],
        ['https://evil.example/lobby'],
        ['//evil.example'],
        ['/\\evil.example'],
        ['\\\\evil.example'],
        ['/\t/evil.example'],
        ['/.//evil.example'],
        ['javascript:alert(1)'],
        ['evil.example'],
        [''],
    ])('next=%j is not followed: the user lands on /lobby [S6]', async (next) => {
        const res = await callback(`code=c_FAKE&next=${encodeURIComponent(next)}`)
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe(`${ORIGIN}/lobby`)
    })

    test('no code → /login?error=no_code, whatever `next` says', async () => {
        expect(await location(`next=${encodeURIComponent('https://evil.example')}`)).toBe(`${ORIGIN}/login?error=no_code`)
        expect(exchangeCodeWithRetry).not.toHaveBeenCalled()
    })

    test('a provider error → /login?error=…', async () => {
        expect(await location('error=access_denied&next=//evil.example')).toBe(`${ORIGIN}/login?error=access_denied`)
    })

    test('a failed exchange → /login?error=…, not `next`', async () => {
        exchangeCodeWithRetry.mockResolvedValue({ user: null, lastError: { message: 'bad code' } })
        expect(await location('code=c_FAKE&next=//evil.example')).toBe(`${ORIGIN}/login?error=bad%20code`)
    })
})
