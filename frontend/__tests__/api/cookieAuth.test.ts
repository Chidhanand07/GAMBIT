/** @jest-environment node */
/**
 * Caller identity for the route handlers [S5] (NX-07, NX-10, SEC-01).
 *
 * The handlers used to base64-decode the access token in the session cookie
 * WITHOUT verifying its signature and then query with the service-role client,
 * so a hand-made cookie impersonated any user. Identity now comes only from
 * `supabase.auth.getUser()` on a cookie-bound server client, i.e. from
 * Supabase Auth; the cookie's own claims are never read.
 */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import * as debugSession from '@/app/api/debug/session/route'
import * as friendById from '@/app/api/friends/[id]/route'
import * as friendsPending from '@/app/api/friends/pending/route'
import * as friendRequest from '@/app/api/friends/request/route'
import * as friends from '@/app/api/friends/route'
import * as friendStatus from '@/app/api/friends/status/[username]/route'
import * as gameById from '@/app/api/games/[id]/route'
import * as gamesActive from '@/app/api/games/active/route'
import * as gamesCreate from '@/app/api/games/private/create/route'
import * as notifRead from '@/app/api/notifications/read/route'
import * as notifications from '@/app/api/notifications/route'
import * as profileGames from '@/app/api/profile/[username]/games/route'
import * as profileByName from '@/app/api/profile/[username]/route'
import * as profileStats from '@/app/api/profile/[username]/stats/route'
import * as profileMe from '@/app/api/profile/me/route'
import { requireUser } from '@/lib/server/identity'
import {
    AUTH_COOKIE,
    cookieStore,
    db,
    forgeCookie,
    req,
    resetHarness,
    setRawCookie,
    signInWithCookie,
    supabaseSsrMock,
} from '../helpers/routeHarness'

const ME = '11111111-1111-4111-8111-111111111111'
const VICTIM = '99999999-9999-4999-8999-999999999999'
const GAME = '22222222-2222-4222-8222-222222222222'
const FRIENDSHIP = '33333333-3333-4333-8333-333333333333'

type Case = [string, () => Promise<Response>]

/** Every route handler that touches user data: all must answer 401 without a verified user. */
const PROTECTED: Case[] = [
    ['GET /api/debug/session', () => debugSession.GET()],
    ['PUT /api/friends/[id]', () => friendById.PUT(req(`/api/friends/${FRIENDSHIP}?action=accept`, { method: 'PUT' }), { params: { id: FRIENDSHIP } })],
    ['DELETE /api/friends/[id]', () => friendById.DELETE(req(`/api/friends/${FRIENDSHIP}`, { method: 'DELETE' }), { params: { id: FRIENDSHIP } })],
    ['GET /api/friends/pending', () => friendsPending.GET()],
    ['POST /api/friends/request', () => friendRequest.POST(req('/api/friends/request', { method: 'POST', body: { addressee_username: 'bob' } }))],
    ['GET /api/friends', () => friends.GET(req(`/api/friends?userId=${VICTIM}`))],
    ['GET /api/friends/status/[username]', () => friendStatus.GET(req('/x'), { params: { username: 'bob' } })],
    ['GET /api/games/[id]', () => gameById.GET(req(`/api/games/${GAME}`), { params: { id: GAME } })],
    ['PATCH /api/games/[id]', () => gameById.PATCH(req(`/api/games/${GAME}`, { method: 'PATCH', body: { draw_offer: true } }), { params: { id: GAME } })],
    ['GET /api/games/active', () => gamesActive.GET()],
    ['POST /api/games/private/create', () => gamesCreate.POST(req('/api/games/private/create', { method: 'POST', body: { timeControl: '10' } }))],
    ['PUT /api/notifications/read', () => notifRead.PUT()],
    ['GET /api/notifications', () => notifications.GET()],
    ['GET /api/profile/[username]', () => profileByName.GET(req('/x'), { params: { username: 'bob' } })],
    ['GET /api/profile/[username]/games', () => profileGames.GET(req('/x'), { params: { username: 'bob' } })],
    ['GET /api/profile/[username]/stats', () => profileStats.GET(req('/x'), { params: { username: 'bob' } })],
    ['GET /api/profile/me', () => profileMe.GET()],
    ['PATCH /api/profile/me', () => profileMe.PATCH(req('/api/profile/me', { method: 'PATCH', body: { bio: 'x' } }))],
]

beforeEach(() => {
    resetHarness()
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe.each([
    ['no cookie', () => {}],
    ['garbage cookie', () => setRawCookie(AUTH_COOKIE, 'not-json')],
    // The attack S5 describes: a well-formed, unexpired JWT naming the victim, signed by nobody.
    ['FORGED cookie claiming to be another user', () => forgeCookie(VICTIM)],
    ['forged cookie, chunked', () => forgeCookie(VICTIM, { chunked: true })],
    ['forged cookie, URI-encoded', () => forgeCookie(VICTIM, { encoded: true })],
    ['an expired session Supabase Auth no longer accepts', () => forgeCookie(ME, { expSecondsFromNow: -3600 })],
    [
        'Supabase Auth reports an error',
        () => {
            forgeCookie(ME)
            db.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } } as never)
        },
    ],
    [
        'Supabase Auth is unreachable (fail closed)',
        () => {
            forgeCookie(ME)
            db.auth.getUser.mockRejectedValue(new Error('fetch failed'))
        },
    ],
    [
        'Supabase Auth answers with a user but also an error',
        () => db.auth.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: { message: 'expired' } } as never),
    ],
])('unverified caller (%s)', (_label, setup) => {
    test.each(PROTECTED)('%s → 401 and the database is never touched', async (_name, call) => {
        setup()
        const res = await call()
        expect(res.status).toBe(401)
        // Not "no writes": NO query at all runs with the service-role client for an unverified caller.
        expect(db.calls).toEqual([])
        expect(db.auth.admin.getUserById).not.toHaveBeenCalled()
    })
})

describe('verified caller', () => {
    test('the user id is the one Supabase Auth returns', async () => {
        signInWithCookie(ME)
        db.queue('profiles', { data: { id: ME, username: 'me' }, error: null })
        const res = await profileMe.GET()
        expect(res.status).toBe(200)
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['eq', 'id', ME])
    })

    test('a cookie that claims a different user than Supabase Auth confirms is ignored', async () => {
        forgeCookie(VICTIM) // the cookie says VICTIM...
        db.signIn(ME) // ...Supabase Auth says ME
        db.queue('profiles', { data: { id: ME }, error: null })
        await profileMe.GET()
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['eq', 'id', ME])
        expect(JSON.stringify(db.calls)).not.toContain(VICTIM)
    })

    test('getUser() is called (verified by Supabase Auth); getSession() is never trusted', async () => {
        signInWithCookie(ME)
        await requireUser()
        expect(db.auth.getUser).toHaveBeenCalledTimes(1)
        expect(db.auth.getUser).toHaveBeenCalledWith()
        expect(db.auth.getSession).not.toHaveBeenCalled()
    })

    test('requireUser returns the user id, or a ready-made 401 response', async () => {
        expect(await requireUser()).toMatchObject({ ok: false })
        const denied = await requireUser()
        expect(denied.ok === false && denied.response.status).toBe(401)
        signInWithCookie(ME)
        expect(await requireUser()).toEqual({ ok: true, userId: ME })
    })
})

type CookieToSet = { name: string; value: string; options: object }
type SessionClientOptions = {
    cookieEncoding?: string
    cookies: { getAll: () => unknown; setAll: (c: CookieToSet[]) => void }
}

/** The options the route passed to the most recent createServerClient(url, key, options). */
function lastSessionClientOptions(): SessionClientOptions {
    const call = supabaseSsrMock.createServerClient.mock.calls.at(-1) as unknown as [string, string, SessionClientOptions]
    return call[2]
}

describe('the session client', () => {
    test('is an anon-key @supabase/ssr server client bound to the request cookies (getAll/setAll)', async () => {
        signInWithCookie(ME)
        await requireUser()
        const [url, key] = supabaseSsrMock.createServerClient.mock.calls.at(-1) as unknown as [string, string]
        const options = lastSessionClientOptions()
        expect(url).toBe('https://testref.supabase.co')
        expect(key).toBe('test-anon-key') // never the service-role key
        expect(options.cookies.getAll()).toEqual(cookieStore.getAll())
        // Same cookie format as before the upgrade, so existing sessions and middleware.ts keep working.
        expect(options.cookieEncoding).toBe('raw')
    })

    test('a refreshed session is written back to the response cookies', async () => {
        signInWithCookie(ME)
        await requireUser()
        const { cookies } = lastSessionClientOptions()
        cookies.setAll([{ name: AUTH_COOKIE, value: 'refreshed', options: { path: '/' } }])
        expect(cookieStore.set).toHaveBeenCalledWith(AUTH_COOKIE, 'refreshed', { path: '/' })
    })

    test('a cookie store that cannot be written (Server Component) does not break verification', async () => {
        signInWithCookie(ME)
        cookieStore.set.mockImplementation(() => {
            throw new Error('Cookies can only be modified in a Server Action or Route Handler')
        })
        await requireUser()
        const { cookies } = lastSessionClientOptions()
        expect(() => cookies.setAll([{ name: AUTH_COOKIE, value: 'x', options: {} }])).not.toThrow()
    })
})

describe('route handlers that read identity are always dynamic (NX-11)', () => {
    const MODULES: Array<[string, { dynamic?: string }]> = [
        ['debug/session', debugSession],
        ['friends/[id]', friendById],
        ['friends/pending', friendsPending],
        ['friends/request', friendRequest],
        ['friends', friends],
        ['friends/status/[username]', friendStatus],
        ['games/[id]', gameById],
        ['games/active', gamesActive],
        ['games/private/create', gamesCreate],
        ['notifications/read', notifRead],
        ['notifications', notifications],
        ['profile/[username]', profileByName],
        ['profile/[username]/games', profileGames],
        ['profile/[username]/stats', profileStats],
        ['profile/me', profileMe],
    ]

    test.each(MODULES)('/api/%s exports dynamic = "force-dynamic"', (_name, mod) => {
        expect(mod.dynamic).toBe('force-dynamic')
    })

    test('Next’s "dynamic server usage" signal from cookies() is not swallowed', async () => {
        // If it were caught, `next build` would prerender the handler and cache its 401 for everyone.
        const signal = Object.assign(new Error('Dynamic server usage: cookies'), { digest: 'DYNAMIC_SERVER_USAGE' })
        const headers = jest.requireMock('next/headers') as { cookies: () => unknown }
        const original = headers.cookies
        headers.cookies = () => {
            throw signal
        }
        try {
            await expect(requireUser()).rejects.toBe(signal)
        } finally {
            headers.cookies = original
        }
    })
})
