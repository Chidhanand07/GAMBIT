/** @jest-environment node */
/**
 * frontend/proxy.ts (Next 16; was middleware.ts) — NX-09, NX-10.
 *
 * The proxy does two things only: it lets @supabase/ssr refresh the session cookies, and it
 * sends visitors without a VERIFIED session away from protected pages. It is an optimistic
 * redirect, not an authorization check: every route handler still calls requireUser().
 */
import { NextRequest } from 'next/server'
import { proxy, config } from '@/proxy'
import { AUTH_COOKIE, sessionCookie } from './helpers/routeHarness'

type CookieToSet = { name: string; value: string; options?: object }
type SsrOptions = {
    cookieEncoding?: string
    cookies: { getAll: () => { name: string; value: string }[]; setAll: (c: CookieToSet[], h: Record<string, string>) => void }
}

const getClaims = jest.fn()
const createServerClient = jest.fn((_url: string, _key: string, _options: SsrOptions) => ({ auth: { getClaims } }))
jest.mock('@supabase/ssr', () => ({
    createServerClient: (url: string, key: string, options: SsrOptions) => createServerClient(url, key, options),
}))

const verified = (sub: string) => ({ data: { claims: { sub } }, error: null })
const notVerified = { data: null, error: null }

beforeEach(() => {
    getClaims.mockReset().mockResolvedValue(notVerified)
    createServerClient.mockClear()
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

function visit(path: string, cookies: Record<string, string> = {}) {
    const headers = new Headers()
    const cookieHeader = Object.entries(cookies)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('; ')
    if (cookieHeader) headers.set('cookie', cookieHeader)
    return proxy(new NextRequest(`http://localhost${path}`, { headers }))
}

const PROTECTED = ['/lobby', '/game/abc', '/profile/bob', '/leaderboard', '/settings', '/challenge/bob']
const PUBLIC = ['/', '/login', '/signup', '/join/tok', '/analysis', '/offline', '/reset-password', '/auth/callback']

describe('without a verified session', () => {
    test.each(PROTECTED)('%s redirects to /login with a return path', async (path) => {
        const res = await visit(`${path}?x=1`)
        expect(res.status).toBe(307)
        const location = new URL(res.headers.get('location')!)
        expect(location.pathname).toBe('/login')
        expect(location.searchParams.get('redirect')).toBe(`${path}?x=1`)
    })

    test('a well-formed but unverified (forged) session cookie is treated as signed out', async () => {
        const res = await visit('/lobby', { [AUTH_COOKIE]: sessionCookie('victim') })
        expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    })

    test.each([
        ['Supabase Auth reports an error', { data: null, error: { message: 'bad jwt' } }],
        ['claims without a subject', { data: { claims: {} }, error: null }],
        ['an empty subject', { data: { claims: { sub: '' } }, error: null }],
    ])('%s → signed out (fail closed)', async (_label, result) => {
        getClaims.mockResolvedValue(result)
        const res = await visit('/lobby', { [AUTH_COOKIE]: sessionCookie('u1') })
        expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    })

    test('verification throwing → signed out (fail closed), nothing leaks', async () => {
        getClaims.mockRejectedValue(new Error('network down'))
        const res = await visit('/lobby', { [AUTH_COOKIE]: sessionCookie('u1') })
        expect(res.status).toBe(307)
        expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    })
})

describe('with a verified session', () => {
    test.each(PROTECTED)('%s is reachable', async (path) => {
        getClaims.mockResolvedValue(verified('u1'))
        const res = await visit(path, { [AUTH_COOKIE]: sessionCookie('u1') })
        expect(res.headers.get('location')).toBeNull()
        expect(res.status).toBe(200)
    })

    test('identity comes from getClaims on a client bound to the request cookies', async () => {
        getClaims.mockResolvedValue(verified('u1'))
        await visit('/lobby', { [AUTH_COOKIE]: 'cookie-value' })
        const [url, key, options] = createServerClient.mock.calls[0]
        expect(url).toBe('https://testref.supabase.co')
        expect(key).toBe('test-anon-key')
        expect(options.cookieEncoding).toBe('raw')
        expect(options.cookies.getAll()).toEqual([{ name: AUTH_COOKIE, value: 'cookie-value' }])
        expect(getClaims).toHaveBeenCalledTimes(1)
    })
})

describe('session refresh', () => {
    const refreshed: CookieToSet[] = [{ name: AUTH_COOKIE, value: 'fresh', options: { path: '/', httpOnly: false } }]
    const cacheHeaders = { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Expires: '0', Pragma: 'no-cache' }

    /** getClaims that first "refreshes": Supabase hands new cookies and cache headers to setAll. */
    const refreshThen = (result: unknown) => async () => {
        const options = createServerClient.mock.calls[createServerClient.mock.calls.length - 1][2]
        options.cookies.setAll(refreshed, cacheHeaders)
        return result
    }

    test('refreshed cookies are on the response the proxy returns, and it is not cacheable', async () => {
        getClaims.mockImplementation(refreshThen(verified('u1')))
        const res = await visit('/lobby', { [AUTH_COOKIE]: 'stale' })
        expect(res.headers.get('location')).toBeNull()
        expect(res.cookies.get(AUTH_COOKIE)?.value).toBe('fresh')
        expect(res.headers.get('cache-control')).toContain('no-store')
        expect(res.headers.get('pragma')).toBe('no-cache')
    })

    test('the refreshed cookie is also visible to the page being rendered (request cookies updated)', async () => {
        getClaims.mockImplementation(refreshThen(verified('u1')))
        const res = await visit('/lobby', { [AUTH_COOKIE]: 'stale' })
        // NextResponse.next({ request }) forwards overridden request headers through this header.
        expect(res.headers.get('x-middleware-request-cookie')).toContain(`${AUTH_COOKIE}=fresh`)
    })

    test('cookies Supabase sets (or clears) survive on the redirect to /login, uncached', async () => {
        getClaims.mockImplementation(refreshThen(notVerified))
        const res = await visit('/lobby', { [AUTH_COOKIE]: 'stale' })
        expect(res.status).toBe(307)
        expect(res.cookies.get(AUTH_COOKIE)?.value).toBe('fresh')
        expect(res.headers.get('cache-control')).toContain('no-store')
    })
})

describe('matcher (allow-list, NX-09)', () => {
    const matches = (path: string) =>
        config.matcher.some((pattern) => {
            const prefix = pattern.replace('/:path*', '')
            return path === prefix || path.startsWith(`${prefix}/`)
        })

    test('lists exactly the protected page prefixes', () => {
        expect(config.matcher).toEqual([
            '/lobby/:path*',
            '/game/:path*',
            '/profile/:path*',
            '/leaderboard/:path*',
            '/settings/:path*',
            '/challenge/:path*',
        ])
    })

    test.each(PROTECTED)('%s is matched', (path) => expect(matches(path)).toBe(true))

    test.each([...PUBLIC, '/api/profile/me', '/api/games/x', '/_next/static/chunk.js', '/pieces/classic/wk.png', '/favicon.ico'])(
        '%s is not matched: the proxy never runs there',
        (path) => expect(matches(path)).toBe(false),
    )
})
