/** @jest-environment node */
/**
 * Every API route that identifies the caller from the Supabase auth cookie
 * must reject a missing, malformed, or expired session the same way.
 */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import * as friendById from '@/app/api/friends/[id]/route'
import * as friendRequest from '@/app/api/friends/request/route'
import * as gamesCreate from '@/app/api/games/private/create/route'
import * as notifRead from '@/app/api/notifications/read/route'
import * as notifications from '@/app/api/notifications/route'
import * as profileMe from '@/app/api/profile/me/route'
import * as friendsPending from '@/app/api/friends/pending/route'
import * as friendStatus from '@/app/api/friends/status/[username]/route'
import * as gamesActive from '@/app/api/games/active/route'
import { db, req, resetHarness, signInWithCookie, setRawCookie, AUTH_COOKIE, makeJwt } from '../helpers/routeHarness'

type Case = [string, () => Promise<Response>, number]

/** Routes that must answer 401 for an anonymous caller. */
const STRICT: Case[] = [
    ['PUT /api/friends/[id]', () => friendById.PUT(req('/api/friends/f1?action=accept', { method: 'PUT' }), { params: { id: 'f1' } }), 401],
    ['DELETE /api/friends/[id]', () => friendById.DELETE(req('/api/friends/f1', { method: 'DELETE' }), { params: { id: 'f1' } }), 401],
    ['POST /api/friends/request', () => friendRequest.POST(req('/api/friends/request', { method: 'POST', body: { addressee_username: 'bob' } })), 401],
    ['POST /api/games/private/create', () => gamesCreate.POST(req('/api/games/private/create', { method: 'POST', body: { timeControl: '10' } })), 401],
    ['PUT /api/notifications/read', () => notifRead.PUT(), 401],
    ['GET /api/notifications', () => notifications.GET(), 401],
    ['GET /api/profile/me', () => profileMe.GET(), 401],
    ['PATCH /api/profile/me', () => profileMe.PATCH(req('/api/profile/me', { method: 'PATCH', body: { bio: 'x' } })), 401],
]

beforeEach(() => resetHarness())

describe.each([
    ['no cookie', () => {}],
    ['garbage cookie', () => setRawCookie(AUTH_COOKIE, 'not-json')],
    ['token that is not a JWT', () => setRawCookie(AUTH_COOKIE, JSON.stringify({ access_token: 'abc' }))],
    ['expired token', () => signInWithCookie('u1', { expSecondsFromNow: -3600 })],
    ['JWT with an unparseable payload', () => setRawCookie(AUTH_COOKIE, JSON.stringify({ access_token: 'a.%%%.c' }))],
])('anonymous caller (%s)', (_label, setup) => {
    test.each(STRICT)('%s → %i and no database writes', async (_name, call, status) => {
        setup()
        const res = await call()
        expect(res.status).toBe(status)
        expect(db.calls.filter(c => db.op(c, 'insert') || db.op(c, 'update') || db.op(c, 'delete'))).toEqual([])
    })

    test('soft routes return an empty answer instead of data', async () => {
        setup()
        expect(await (await friendsPending.GET()).json()).toEqual([])
        expect(await (await friendStatus.GET(req('/x'), { params: { username: 'bob' } })).json()).toEqual({ status: 'none' })
        expect(await (await gamesActive.GET()).json()).toBeNull()
        expect(db.calls).toEqual([])
    })
})

describe('accepted session formats', () => {
    test.each([
        ['single cookie', {}],
        ['chunked cookie (.0/.1)', { chunked: true }],
        ['URI-encoded cookie', { encoded: true }],
        ['token expired less than 60 s ago (clock-skew grace)', { expSecondsFromNow: -30 }],
    ])('%s is accepted', async (_label, opts) => {
        signInWithCookie('user-42', opts)
        db.queue('profiles', { data: { id: 'user-42', username: 'me' }, error: null })
        const res = await profileMe.GET()
        expect(res.status).toBe(200)
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['eq', 'id', 'user-42'])
    })

    test('the user id comes from the token, not from anything the client sends', async () => {
        setRawCookie(AUTH_COOKIE, JSON.stringify({ access_token: makeJwt('real-user'), user: { id: 'spoofed' } }))
        db.queue('profiles', { data: { id: 'real-user' }, error: null })
        await profileMe.GET()
        expect(db.callsFor('profiles')[0].ops).toContainEqual(['eq', 'id', 'real-user'])
    })

    test.todo('the JWT signature is never verified — a forged cookie is trusted by every cookie-auth route (verify with supabase.auth.getUser or the JWT secret)')
})
