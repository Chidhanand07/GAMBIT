/**
 * Shared setup for API route tests.
 *
 * Each route test file must declare these mocks itself (jest.mock is hoisted
 * per file), then use the helpers below:
 *
 *   jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
 *   jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
 *   jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)
 */
import { NextRequest } from 'next/server'
import { createSupabaseMock } from './supabaseMock'

/**
 * A stable UUID for a readable label, so tests can keep saying `uid('me')` while every id
 * that reaches a route handler is a real UUID (route params, query ids and filter values are
 * validated as UUIDs).
 */
export function uid(label: string): string {
    const hex = Buffer.from(label).toString('hex').slice(0, 12).padEnd(12, '0')
    return `00000000-0000-4000-8000-${hex}`
}

/** Project ref derived from NEXT_PUBLIC_SUPABASE_URL in jest.setup.ts. */
export const AUTH_COOKIE = 'sb-testref-auth-token'

/** The one fake client every mocked createClient / createServerClient returns. */
export const db = createSupabaseMock()

// ── Cookie jar used by the mocked next/headers cookies() ─────────────────────
const jar = new Map<string, string>()

export const cookieStore = {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
    set: jest.fn(),
}

export const nextHeadersMock = { cookies: () => cookieStore, headers: () => new Headers() }
export const supabaseJsMock = { createClient: jest.fn(() => db) }
export const supabaseSsrMock = { createServerClient: jest.fn(() => db) }

function b64url(obj: object) {
    return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A JWT-shaped access token with a fake signature (only Supabase Auth can tell it is not real). */
export function makeJwt(sub: string, expSecondsFromNow = 3600) {
    const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow
    return `${b64url({ alg: 'HS256' })}.${b64url({ sub, exp })}.sig`
}

/** The raw Supabase session cookie value for a user. */
export function sessionCookie(userId: string, expSecondsFromNow = 3600) {
    return JSON.stringify({ access_token: makeJwt(userId, expSecondsFromNow) })
}

/**
 * Sign a user in: the session cookie is present AND Supabase Auth (`auth.getUser()`)
 * confirms it. This is a genuine session; see {@link forgeCookie} for a fake one.
 */
export function signInWithCookie(userId: string, opts: { expSecondsFromNow?: number; chunked?: boolean; encoded?: boolean } = {}) {
    setSessionCookie(userId, opts)
    db.signIn(userId)
}

/**
 * A session cookie whose (unsigned) JWT *claims* to be `userId`, which Supabase Auth does
 * not confirm. The route handlers used to trust exactly this (S5).
 */
export function forgeCookie(userId: string, opts: { expSecondsFromNow?: number; chunked?: boolean; encoded?: boolean } = {}) {
    setSessionCookie(userId, opts)
}

function setSessionCookie(userId: string, opts: { expSecondsFromNow?: number; chunked?: boolean; encoded?: boolean }) {
    let value = sessionCookie(userId, opts.expSecondsFromNow)
    if (opts.encoded) value = encodeURIComponent(value)
    if (opts.chunked) {
        const half = Math.ceil(value.length / 2)
        jar.set(`${AUTH_COOKIE}.0`, value.slice(0, half))
        jar.set(`${AUTH_COOKIE}.1`, value.slice(half))
    } else {
        jar.set(AUTH_COOKIE, value)
    }
}

export function setRawCookie(name: string, value: string) {
    jar.set(name, value)
}

export function resetHarness() {
    jar.clear()
    db.reset()
    cookieStore.set.mockClear()
}

export function req(path: string, init: { method?: string; body?: unknown } = {}) {
    const { method = 'GET', body } = init
    return new NextRequest(`http://localhost${path}`, {
        method,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    })
}

export async function json(res: Response) {
    return { status: res.status, body: await res.json() }
}
