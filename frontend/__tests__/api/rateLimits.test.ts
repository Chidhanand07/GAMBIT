/** @jest-environment node */
/**
 * RATE-LIMITS: the four public-facing writes are rate limited in a shared store (NODE-12;
 * Vercel runs many instances, so an in-process counter would give N× the limit).
 * A limited request answers 429 { error: 'rate_limited' } with Retry-After, BEFORE any
 * database or engine call. When the store is not configured or fails, requests go through.
 */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)
jest.mock('@/lib/server/rateLimitStore', () => ({
    ...jest.requireActual('@/lib/server/rateLimitStore'),
    rateLimitStore: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { POST as friendRequest } from '@/app/api/friends/request/route'
import { POST as maverickMove } from '@/app/api/maverick-move/route'
import { RATE_LIMITS } from '@/lib/server/rateLimit'
import { rateLimitStore } from '@/lib/server/rateLimitStore'
import { failingStore, MemoryRateLimitStore } from '../helpers/rateLimitFakes'
import { db, resetHarness, signInWithCookie, supabaseJsMock } from '../helpers/routeHarness'

const storeFactory = rateLimitStore as jest.MockedFunction<typeof rateLimitStore>
const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const IP_A = '203.0.113.7'
const IP_B = '198.51.100.4'

function post(path: string, body: unknown, ip = IP_A) {
    return new NextRequest(`http://localhost${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    })
}

async function expectLimited(res: Response) {
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
}

let engine: jest.SpyInstance
beforeEach(() => {
    resetHarness()
    storeFactory.mockReturnValue(new MemoryRateLimitStore())
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    engine = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{"uci":"e2e4"}', { status: 200 }))
})
afterEach(() => jest.restoreAllMocks())

/** Spend a rule's whole allowance with `send`, then return the next (limit + 1) response. */
async function exhaust(limit: number, send: () => Promise<Response>) {
    for (let i = 0; i < limit; i++) expect((await send()).status).not.toBe(429)
    return send()
}

describe('POST /api/maverick-move (per client IP)', () => {
    const send = (ip = IP_A) => maverickMove(post('/api/maverick-move', { fen: FEN }, ip))

    test('the request after the limit is 429 and the engine is not called', async () => {
        const res = await exhaust(RATE_LIMITS.maverickMove.limit, () => send())
        await expectLimited(res)
        expect(engine).toHaveBeenCalledTimes(RATE_LIMITS.maverickMove.limit)
    })

    test('another IP is not affected', async () => {
        await exhaust(RATE_LIMITS.maverickMove.limit, () => send())
        expect((await send(IP_B)).status).toBe(200)
    })

    test.each([
        ['not configured', null],
        ['failing', failingStore],
    ])('store %s → requests go through', async (_label, store) => {
        storeFactory.mockReturnValue(store)
        for (let i = 0; i <= RATE_LIMITS.maverickMove.limit; i++) expect((await send()).status).toBe(200)
    })
})

describe('POST /api/auth/login (per client IP and per e-mail)', () => {
    const send = (email = 'a@b.c', ip = IP_A) => login(post('/api/auth/login', { email, password: 'pw' }, ip))

    test('per e-mail: the request after the limit is 429 and Supabase Auth is not called', async () => {
        const res = await exhaust(RATE_LIMITS.loginEmail.limit, () => send())
        await expectLimited(res)
        expect(db.auth.signInWithPassword).toHaveBeenCalledTimes(RATE_LIMITS.loginEmail.limit)
    })

    test('the per-e-mail limit ignores case and follows the address across IPs', async () => {
        for (let i = 0; i < RATE_LIMITS.loginEmail.limit; i++) await send('A@B.C', i % 2 ? IP_A : IP_B)
        await expectLimited(await send('a@b.c', '192.0.2.99'))
    })

    test('per IP: many addresses from one IP are limited; another IP is not', async () => {
        const res = await exhaust(RATE_LIMITS.loginIp.limit, async () => send(`u${Math.random()}@b.c`))
        await expectLimited(res)
        expect(db.auth.signInWithPassword).toHaveBeenCalledTimes(RATE_LIMITS.loginIp.limit)
        expect((await send('fresh@b.c', IP_B)).status).not.toBe(429)
    })

    test.each([
        ['not configured', null],
        ['failing', failingStore],
    ])('store %s → requests go through', async (_label, store) => {
        storeFactory.mockReturnValue(store)
        for (let i = 0; i <= RATE_LIMITS.loginIp.limit; i++) expect((await send()).status).toBe(401)
    })
})

describe('POST /api/auth/signup (per client IP)', () => {
    let n = 0
    const send = (ip = IP_A) =>
        signup(post('/api/auth/signup', { email: `n${++n}@b.c`, password: 'secret123', username: `user${n}` }, ip))

    test('the request after the limit is 429 and the database is not touched', async () => {
        await exhaust(RATE_LIMITS.signup.limit, () => send())
        supabaseJsMock.createClient.mockClear()
        db.from.mockClear()
        await expectLimited(await send())
        expect(supabaseJsMock.createClient).not.toHaveBeenCalled()
        expect(db.from).not.toHaveBeenCalled()
    })

    test('another IP is not affected', async () => {
        await exhaust(RATE_LIMITS.signup.limit, () => send())
        expect((await send(IP_B)).status).not.toBe(429)
    })

    test.each([
        ['not configured', null],
        ['failing', failingStore],
    ])('store %s → requests go through', async (_label, store) => {
        storeFactory.mockReturnValue(store)
        for (let i = 0; i <= RATE_LIMITS.signup.limit; i++) expect((await send()).status).not.toBe(429)
    })
})

describe('POST /api/friends/request (per verified user)', () => {
    const send = (ip = IP_A) => friendRequest(post('/api/friends/request', { addressee_username: 'bob' }, ip))

    test('the request after the limit is 429 and the database is not touched', async () => {
        signInWithCookie('me')
        await exhaust(RATE_LIMITS.friendRequest.limit, () => send())
        db.from.mockClear()
        await expectLimited(await send(IP_B)) // the key is the user, not the IP
        expect(db.from).not.toHaveBeenCalled()
    })

    test('another user is not affected', async () => {
        signInWithCookie('me')
        await exhaust(RATE_LIMITS.friendRequest.limit, () => send())
        signInWithCookie('you')
        expect((await send()).status).not.toBe(429)
    })

    test('a signed-out caller is still 401 (identity first; nothing is counted)', async () => {
        const store = new MemoryRateLimitStore()
        storeFactory.mockReturnValue(store)
        expect((await send()).status).toBe(401)
        expect(store.keys).toEqual([])
    })

    test.each([
        ['not configured', null],
        ['failing', failingStore],
    ])('store %s → requests go through', async (_label, store) => {
        signInWithCookie('me')
        storeFactory.mockReturnValue(store)
        for (let i = 0; i <= RATE_LIMITS.friendRequest.limit; i++) expect((await send()).status).not.toBe(429)
    })
})
