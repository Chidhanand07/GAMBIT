/** @jest-environment node */
// DELETE-ACCOUNT (ADR F-145): POST /api/account/delete re-authenticates, then removes the data in
// one transaction, the avatar files and the auth user, failing closed at every step.
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)
jest.mock('@/lib/server/rateLimitStore', () => ({
    ...jest.requireActual('@/lib/server/rateLimitStore'),
    rateLimitStore: jest.fn(),
}))

import { POST } from '@/app/api/account/delete/route'
import { rateLimitStore } from '@/lib/server/rateLimitStore'
import { failingStore, MemoryRateLimitStore } from '../helpers/rateLimitFakes'
import { db, forgeCookie, json, req, resetHarness, signInWithCookie, uid } from '../helpers/routeHarness'

const storeFactory = rateLimitStore as jest.MockedFunction<typeof rateLimitStore>
const ME = uid('me')
const NOW_S = Math.floor(Date.now() / 1000)
const del = (body: unknown) => POST(req('/api/account/delete', { method: 'POST', body }))

/** A signed-in user: `password` account or OAuth-only, signed in `signedInSecondsAgo` ago. */
function signedIn({ password = true, signedInSecondsAgo = 60, aal = 'aal1', factors = [] as object[] } = {}) {
    signInWithCookie(ME)
    db.auth.getClaims.mockResolvedValue({
        data: { claims: { sub: ME, aal, amr: [{ method: password ? 'password' : 'oauth', timestamp: NOW_S - signedInSecondsAgo }] } },
        error: null,
    })
    db.auth.getUser.mockResolvedValue({
        data: { user: { id: ME, email: 'me@example.com', factors, identities: [{ provider: password ? 'email' : 'google' }] } },
        error: null,
    } as any)
    db.queue('profiles', { data: { username: 'me1' }, error: null })
}
const passwordOk = () => db.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: ME }, session: {} }, error: null } as any)

let log: jest.SpyInstance
beforeEach(() => {
    resetHarness()
    storeFactory.mockReturnValue(new MemoryRateLimitStore())
    jest.spyOn(console, 'error').mockImplementation(() => {})
    log = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const nothingRemoved = () => {
    expect(db.rpc).not.toHaveBeenCalled()
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(db.auth.admin.updateUserById).not.toHaveBeenCalled()
}

describe('who may delete', () => {
    test('signed out or a forged cookie → 401, nothing removed', async () => {
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(401)
        forgeCookie(ME)
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(401)
        nothingRemoved()
    })

    test('two-factor on and only a password session (AAL1) → 403 mfa_required', async () => {
        signedIn({ factors: [{ status: 'verified' }] })
        expect(await json(await del({ confirmUsername: 'me1', password: 'pw' }))).toEqual({ status: 403, body: { error: 'mfa_required' } })
        nothingRemoved()
    })

    test('the username must be typed exactly (case included)', async () => {
        signedIn()
        expect(await json(await del({ confirmUsername: 'ME1', password: 'pw' }))).toEqual({ status: 400, body: { error: 'username_mismatch' } })
        expect(db.auth.signInWithPassword).not.toHaveBeenCalled()
        nothingRemoved()
    })

    test.each([[{}], [{ confirmUsername: '' }], [{ confirmUsername: 'me1', password: 'x'.repeat(201) }]])('invalid body %p → 400', async (body) => {
        signedIn()
        expect((await del(body)).status).toBe(400)
        nothingRemoved()
    })

    test('a password account must give its password, and the right one', async () => {
        signedIn()
        expect(await json(await del({ confirmUsername: 'me1' }))).toEqual({ status: 401, body: { error: 'password_required' } })
        db.queue('profiles', { data: { username: 'me1' }, error: null })
        db.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } } as any)
        expect(await json(await del({ confirmUsername: 'me1', password: 'wrong' }))).toEqual({ status: 401, body: { error: 'wrong_password' } })
        expect(db.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'wrong' })
        nothingRemoved()
    })

    test('an OAuth-only account needs a sign-in in the last 10 minutes', async () => {
        signedIn({ password: false, signedInSecondsAgo: 11 * 60 })
        expect(await json(await del({ confirmUsername: 'me1' }))).toEqual({ status: 401, body: { error: 'reauth_required' } })
        nothingRemoved()
        signedIn({ password: false, signedInSecondsAgo: 5 * 60 })
        expect((await del({ confirmUsername: 'me1' })).status).toBe(200)
        expect(db.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    test('rate limited per user (5 an hour), and refused when the limiter is down', async () => {
        for (let i = 0; i < 5; i++) {
            signedIn()
            await del({ confirmUsername: 'nope' })
        }
        signedIn()
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(429)
        storeFactory.mockReturnValue(failingStore)
        signedIn()
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(503)
        nothingRemoved()
    })
})

describe('what is removed, in which order', () => {
    test('ban → delete_account (one transaction) → avatar files → auth user → session cookies', async () => {
        signedIn()
        passwordOk()
        db.storage.bucket.list.mockResolvedValue({ data: [{ name: 'avatar.png' }], error: null })
        const order: string[] = []
        db.auth.admin.updateUserById.mockImplementation(async (_id: string, attrs: any) => (order.push(`ban:${attrs.ban_duration}`), { data: {}, error: null }))
        db.rpc.mockImplementation(async (fn: string, args: any) => (order.push(`${fn}:${args.p_user_id === ME}`), { data: {}, error: null }))
        db.storage.bucket.remove.mockImplementation(async (paths: any) => (order.push(`remove:${paths}`), { data: [], error: null }))
        db.auth.admin.deleteUser.mockImplementation(async () => (order.push('deleteUser'), { data: null, error: null }))
        expect(await json(await del({ confirmUsername: 'me1', password: 'pw' }))).toEqual({ status: 200, body: { deleted: true } })
        expect(order).toEqual(['ban:876000h', 'delete_account:true', `remove:${ME}/avatar.png`, 'deleteUser'])
        expect(db.storage.from).toHaveBeenCalledWith('avatars')
        expect(db.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    test('logged without PII: a hash reference, never the user id or the e-mail', async () => {
        signedIn()
        passwordOk()
        await del({ confirmUsername: 'me1', password: 'pw' })
        const lines = log.mock.calls.map((c) => c.join(' '))
        expect(lines.some((l) => /account deleted \(ref [0-9a-f]{12}\)/.test(l))).toBe(true)
        expect(lines.join('\n')).not.toMatch(new RegExp(`${ME}|me@example.com`))
    })

    test('still playing a game → 409 active_game; the ban is lifted again, nothing else happens', async () => {
        signedIn()
        passwordOk()
        db.rpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'active_game' } })
        expect(await json(await del({ confirmUsername: 'me1', password: 'pw' }))).toEqual({ status: 409, body: { error: 'active_game' } })
        expect(db.auth.admin.updateUserById.mock.calls.map((c: any[]) => c[1].ban_duration)).toEqual(['876000h', 'none'])
        expect(db.auth.admin.deleteUser).not.toHaveBeenCalled()
    })

    test('the data transaction fails → 500, unbanned, the auth user kept', async () => {
        signedIn()
        passwordOk()
        db.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(500)
        expect(db.auth.admin.updateUserById).toHaveBeenLastCalledWith(ME, { ban_duration: 'none' })
        expect(db.auth.admin.deleteUser).not.toHaveBeenCalled()
    })

    test('the ban fails → 500 before any data is touched (fail closed)', async () => {
        signedIn()
        passwordOk()
        db.auth.admin.updateUserById.mockResolvedValue({ data: null, error: { message: 'down' } })
        expect((await del({ confirmUsername: 'me1', password: 'pw' })).status).toBe(500)
        expect(db.rpc).not.toHaveBeenCalled()
    })

    test('the auth user cannot be deleted → 500 auth_delete_failed, and the user stays banned', async () => {
        signedIn()
        passwordOk()
        db.auth.admin.deleteUser.mockResolvedValue({ data: null, error: { message: 'down' } } as any)
        expect(await json(await del({ confirmUsername: 'me1', password: 'pw' }))).toEqual({ status: 500, body: { error: 'auth_delete_failed' } })
        expect(db.auth.admin.updateUserById.mock.calls.map((c: any[]) => c[1].ban_duration)).toEqual(['876000h'])
    })
})
