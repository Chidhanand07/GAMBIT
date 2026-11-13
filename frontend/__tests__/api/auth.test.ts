/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { db, req, json, resetHarness, supabaseSsrMock } from '../helpers/routeHarness'

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
        expect(res).toEqual({ status: 401, body: { error: 'Invalid email or password' } })
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
})
