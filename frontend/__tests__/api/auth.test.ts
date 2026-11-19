/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)
// The failure floor (F-101) is tested in loginIdentity.test.ts; here it only has to be awaited.
jest.mock('@/lib/server/loginIdentity', () => ({
    ...jest.requireActual('@/lib/server/loginIdentity'),
    waitForFailureFloor: jest.fn(async () => {}),
}))

import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { waitForFailureFloor } from '@/lib/server/loginIdentity'
import { db, req, json, resetHarness, supabaseSsrMock, uid } from '../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/auth/login', () => {
    test.each([
        [{}],
        [{ email: 'a@b.c' }],
        [{ password: 'pw' }],
    ])('400 when email or password is missing: %j', async (body) => {
        const res = await json(await login(req('/api/auth/login', { method: 'POST', body })))
        expect(res).toEqual({ status: 400, body: { error: 'Email and password are required' } })
        expect(db.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    test('wrong credentials → 401 with a generic message (no account enumeration)', async () => {
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } } as any)
        const res = await json(await login(req('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } })))
        // was: 'Invalid email or password' — [F-101] the field also takes a username
        expect(res).toEqual({ status: 401, body: { error: 'Invalid email, username or password' } })
    })

    test('unconfirmed email → 401 asking the user to confirm', async () => {
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Email not confirmed' } } as any)
        const res = await json(await login(req('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } })))
        expect(res.status).toBe(401)
        expect(res.body.error).toMatch(/confirm your email/)
    })

    test('no session returned → 401', async () => {
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null } as any)
        const res = await login(req('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } }))
        expect(res.status).toBe(401)
    })

    test('success → 200 and the session cookies Supabase sets land on the response', async () => {
        db.auth.signInWithPassword.mockImplementation(async () => {
            const cookies = (supabaseSsrMock.createServerClient.mock.calls.at(-1) as any)[2].cookies
            // @supabase/ssr ≥ 0.4 hands every cookie to setAll (was: one `set` call per cookie).
            cookies.setAll([{ name: 'sb-testref-auth-token', value: 'session-value', options: { path: '/' } }], { 'Cache-Control': 'private, no-store' })
            return { data: { session: { access_token: 't' } }, error: null } as any
        })
        const res = await login(req('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'pw' } }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(res.headers.get('set-cookie')).toContain('sb-testref-auth-token=session-value')
        // A response that sets session cookies must not be cached (NX-11).
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(db.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' })
    })
})

describe('POST /api/auth/login with an e-mail or a username [F-101]', () => {
    const EMAIL = 'magnus@example.com'
    const send = (body: unknown) => login(req('/api/auth/login', { method: 'POST', body }))
    const wrongPassword = { data: { session: null }, error: { message: 'Invalid login credentials' } } as any
    const knownUser = () => {
        db.queue('profiles', { data: [{ id: uid('magnus'), username: 'Magnus_C' }], error: null })
        db.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: uid('magnus'), email: EMAIL } }, error: null } as any)
    }
    const signedInWith = () => (db.auth.signInWithPassword.mock.calls.at(-1) as any)[0]
    let logs: jest.SpyInstance[]
    beforeEach(() => {
        jest.mocked(waitForFailureFloor).mockClear()
        logs = (['log', 'info', 'warn', 'error'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}))
    })
    afterEach(() => {
        // The account's e-mail is never logged, whatever happened.
        for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(EMAIL)
    })

    test('an e-mail goes straight to Supabase Auth: no profile lookup, no admin call', async () => {
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as any)
        const res = await send({ identifier: EMAIL, password: 'pw' })
        expect(res.status).toBe(200)
        expect(signedInWith()).toEqual({ email: EMAIL, password: 'pw' })
        expect(db.callsFor('profiles')).toHaveLength(0)
        expect(db.auth.admin.getUserById).not.toHaveBeenCalled()
    })

    test('the older { email } body is still accepted', async () => {
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as any)
        expect((await send({ email: EMAIL, password: 'pw' })).status).toBe(200)
        expect(signedInWith()).toEqual({ email: EMAIL, password: 'pw' })
    })

    test('a username is matched case-insensitively and exactly, then signs in with its e-mail', async () => {
        knownUser()
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as any)
        const res = await send({ identifier: 'magnus_c', password: 'pw' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        const [call] = db.callsFor('profiles')
        // `_` is escaped: ilike must not treat it as "any one character"
        expect(db.op(call, 'ilike')).toEqual(['username', 'magnus\\_c'])
        expect(db.auth.admin.getUserById).toHaveBeenCalledWith(uid('magnus'))
        expect(signedInWith()).toEqual({ email: EMAIL, password: 'pw' })
    })

    test('two names that differ only in case: the exact spelling wins; otherwise nobody matches', async () => {
        const rows = [{ id: uid('lower'), username: 'bob' }, { id: uid('upper'), username: 'Bob' }]
        db.queue('profiles', { data: rows, error: null }, { data: rows, error: null })
        await send({ identifier: 'Bob', password: 'pw' })
        expect(db.auth.admin.getUserById).toHaveBeenLastCalledWith(uid('upper'))
        const res = await json(await send({ identifier: 'BOB', password: 'pw' }))
        expect(res).toEqual({ status: 401, body: { error: 'Invalid email, username or password' } })
    })

    test('unknown username and wrong password: identical status and body, the same work and the same floor', async () => {
        knownUser()
        db.auth.signInWithPassword.mockResolvedValue(wrongPassword)
        const wrong = await json(await send({ identifier: 'Magnus_C', password: 'bad' }))
        const wrongCalls = { admin: db.auth.admin.getUserById.mock.calls.length, auth: db.auth.signInWithPassword.mock.calls.length }

        db.reset()
        db.auth.signInWithPassword.mockResolvedValue(wrongPassword)
        db.queue('profiles', { data: [], error: null })
        const unknown = await json(await send({ identifier: 'nobody_here', password: 'bad' }))

        expect(unknown).toEqual(wrong)
        expect(unknown).toEqual({ status: 401, body: { error: 'Invalid email, username or password' } })
        // Same calls on both paths: one admin lookup, one password check (against a .invalid address)
        expect(db.auth.admin.getUserById).toHaveBeenCalledTimes(wrongCalls.admin)
        expect(db.auth.signInWithPassword).toHaveBeenCalledTimes(wrongCalls.auth)
        expect(signedInWith().email).toMatch(/@login\.invalid$/)
        expect(waitForFailureFloor).toHaveBeenCalledTimes(2)
    })

    test('an unknown user is refused even if the dummy password check were to pass', async () => {
        db.queue('profiles', { data: [], error: null })
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as any)
        const res = await json(await send({ identifier: 'nobody_here', password: 'pw' }))
        expect(res).toEqual({ status: 401, body: { error: 'Invalid email, username or password' } })
    })

    test('a failed profile lookup or a user without an e-mail reads as unknown', async () => {
        db.queue('profiles', { data: null, error: { message: 'boom' } })
        expect((await send({ identifier: 'Magnus_C', password: 'pw' })).status).toBe(401)
        db.queue('profiles', { data: [{ id: uid('magnus'), username: 'Magnus_C' }], error: null })
        db.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'gone' } } as any)
        expect((await send({ identifier: 'Magnus_C', password: 'pw' })).status).toBe(401)
    })

    test('a username the schema could never hold is unknown without a database query', async () => {
        const res = await json(await send({ identifier: 'no spaces%', password: 'pw' }))
        expect(res).toEqual({ status: 401, body: { error: 'Invalid email, username or password' } })
        expect(db.callsFor('profiles')).toHaveLength(0)
    })

    test('success is not padded by the failure floor', async () => {
        knownUser()
        db.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as any)
        await send({ identifier: 'Magnus_C', password: 'pw' })
        expect(waitForFailureFloor).not.toHaveBeenCalled()
    })

    test('an empty identifier is a 400', async () => {
        const res = await json(await send({ identifier: '   ', password: 'pw' }))
        expect(res).toEqual({ status: 400, body: { error: 'Email and password are required' } })
    })
})

describe('POST /api/auth/signup', () => {
    const body = { email: 'new@b.c', password: 'secret123', username: 'newbie' }
    const post = (b: unknown = body) => signup(req('/api/auth/signup', { method: 'POST', body: b }))

    test('400 when a field is missing', async () => {
        for (const b of [{}, { email: 'a', password: 'b' }, { email: 'a', username: 'c' }]) {
            expect((await post(b)).status).toBe(400)
        }
    })

    test('500 when the service role key is not configured', async () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        const res = await json(await post())
        expect(res).toEqual({ status: 500, body: { error: 'Server configuration error' } })
    })

    test('username already taken → 400 and no auth user is created', async () => {
        db.queue('profiles', { data: { id: 'x' }, error: null })
        const res = await json(await post())
        expect(res).toEqual({ status: 400, body: { error: 'Username already taken' } })
        expect(db.auth.admin.createUser).not.toHaveBeenCalled()
    })

    test('email already registered → friendly 400', async () => {
        db.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } } as any)
        const res = await json(await post())
        expect(res).toEqual({ status: 400, body: { error: 'An account with this email already exists' } })
    })

    test('success creates the auth user and a profile with starting ratings', async () => {
        db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null } as any)
        const res = await json(await post())
        expect(res).toEqual({ status: 200, body: { ok: true } })
        expect(db.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@b.c', password: 'secret123' }))

        const profile = db.op(db.callsFor('profiles')[1], 'insert')![0]
        expect(profile).toMatchObject({
            id: 'uid-1', username: 'newbie',
            rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1200, rating_classical: 1200,
            games_played: 0, wins: 0, losses: 0, draws: 0,
        })
    })

    test('if the profile insert fails, the auth user is rolled back', async () => {
        db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null } as any)
        db.queue('profiles', { data: null, error: null }, { data: null, error: { message: 'duplicate key violates unique constraint' } })
        const res = await json(await post())
        expect(res).toEqual({ status: 400, body: { error: 'Username already taken' } })
        expect(db.auth.admin.deleteUser).toHaveBeenCalledWith('uid-1')
    })

    test.each([
        ['returns an error', () => db.auth.admin.deleteUser.mockResolvedValue({ data: null, error: { message: 'boom' } } as any)],
        ['throws', () => db.auth.admin.deleteUser.mockRejectedValue(new Error('network'))],
    ])('F18: when the rollback deleteUser %s, it is logged and the signup fails with a 500', async (_name, setup) => {
        setup()
        db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null } as any)
        db.queue('profiles', { data: null, error: null }, { data: null, error: { message: 'insert failed' } })
        const res = await json(await post())
        expect(res.status).toBe(500)
        expect(res.body.error).toMatch(/could not be completed/i)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('rollback'), 'uid-1', expect.anything())
    })
})
