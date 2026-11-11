/** @jest-environment node */
/**
 * frontend/middleware.ts — redirects signed-out visitors away from protected pages.
 */
import { NextRequest } from 'next/server'
import { middleware, config } from '@/middleware'
import { AUTH_COOKIE, sessionCookie } from './helpers/routeHarness'

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}))
afterEach(() => jest.restoreAllMocks())

function visit(path: string, cookies: Record<string, string> = {}) {
    const headers = new Headers()
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
    if (cookieHeader) headers.set('cookie', cookieHeader)
    return middleware(new NextRequest(`http://localhost${path}`, { headers }))
}

const PROTECTED = ['/lobby', '/game/abc', '/profile/bob', '/leaderboard', '/settings', '/challenge/bob']
const PUBLIC = ['/', '/login', '/signup', '/join/tok', '/analysis', '/offline', '/reset-password']

describe('signed out', () => {
    test.each(PROTECTED)('%s redirects to /login with a return path', async (path) => {
        const res = await visit(`${path}?x=1`)
        expect(res.status).toBe(307)
        const location = new URL(res.headers.get('location')!)
        expect(location.pathname).toBe('/login')
        expect(location.searchParams.get('redirect')).toBe(`${path}?x=1`)
    })

    test.each(PUBLIC)('%s is reachable', async (path) => {
        const res = await visit(path)
        expect(res.headers.get('location')).toBeNull()
    })
})

describe('signed in', () => {
    test.each(PROTECTED)('%s is reachable with a valid session', async (path) => {
        const res = await visit(path, { [AUTH_COOKIE]: sessionCookie('u1') })
        expect(res.headers.get('location')).toBeNull()
    })

    test('a session split across chunked cookies is accepted', async () => {
        const value = sessionCookie('u1')
        const half = Math.ceil(value.length / 2)
        const res = await visit('/lobby', { [`${AUTH_COOKIE}.0`]: value.slice(0, half), [`${AUTH_COOKIE}.1`]: value.slice(half) })
        expect(res.headers.get('location')).toBeNull()
    })

    test('a token that expired under a minute ago is still accepted (clock skew)', async () => {
        const res = await visit('/lobby', { [AUTH_COOKIE]: sessionCookie('u1', -30) })
        expect(res.headers.get('location')).toBeNull()
    })

    test.each([
        ['expired session', sessionCookie('u1', -3600)],
        ['not JSON', 'garbage'],
        ['no access token', JSON.stringify({ refresh_token: 'r' })],
        ['token without three parts', JSON.stringify({ access_token: 'a.b' })],
        ['token with no exp', JSON.stringify({ access_token: `x.${Buffer.from('{"sub":"u"}').toString('base64')}.z` })],
    ])('%s is treated as signed out', async (_label, cookie) => {
        const res = await visit('/lobby', { [AUTH_COOKIE]: cookie })
        expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    })
})

test('the matcher skips static assets and images', () => {
    const re = new RegExp(`^${config.matcher[0]}$`)
    expect(re.test('/lobby')).toBe(true)
    expect(re.test('/_next/static/chunk.js')).toBe(false)
    expect(re.test('/pieces/classic/wk.png')).toBe(false)
    expect(re.test('/favicon.ico')).toBe(false)
})
