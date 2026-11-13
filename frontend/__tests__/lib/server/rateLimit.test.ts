/** @jest-environment node */
/**
 * RATE-LIMITS: limit(key, rule) over the store port, its fail-open behaviour, and the
 * client-IP helper.
 */
jest.mock('@/lib/server/rateLimitStore', () => ({
    ...jest.requireActual('@/lib/server/rateLimitStore'),
    rateLimitStore: jest.fn(),
}))

import { clientIp } from '@/lib/server/clientIp'
import { enforceRateLimit, limit, RATE_LIMITS, type RateLimitRule } from '@/lib/server/rateLimit'
import { rateLimitStore, UpstashRateLimitStore } from '@/lib/server/rateLimitStore'
import { failingStore, fakeClock, MemoryRateLimitStore } from '../../helpers/rateLimitFakes'

const storeFactory = rateLimitStore as jest.MockedFunction<typeof rateLimitStore>
const RULE: RateLimitRule = { id: 'test', limit: 3, windowMs: 60_000 }

let warn: jest.SpyInstance
beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('limit()', () => {
    test('allows `limit` hits per window, then refuses with the seconds until the window resets', async () => {
        const clock = fakeClock()
        storeFactory.mockReturnValue(new MemoryRateLimitStore(clock.now))
        for (let i = 0; i < RULE.limit; i++) expect(await limit('ip', RULE)).toEqual({ ok: true })
        clock.advance(20_500)
        expect(await limit('ip', RULE)).toEqual({ ok: false, retryAfterSeconds: 40 })
        expect(await limit('other-ip', RULE)).toEqual({ ok: true })
    })

    test('namespaces keys by rule and never stores the raw key (an e-mail or an IP)', async () => {
        const store = new MemoryRateLimitStore()
        storeFactory.mockReturnValue(store)
        await limit('a@b.c', RULE)
        await limit('a@b.c', { ...RULE, id: 'other' })
        expect(store.keys).toHaveLength(2)
        expect(new Set(store.keys).size).toBe(2)
        expect(store.keys.join(' ')).not.toContain('a@b.c')
        expect(store.keys[0]).toMatch(/^gambit:rl:test:/)
    })

    test('store not configured → allow, and warn only once', async () => {
        storeFactory.mockReturnValue(null)
        for (let i = 0; i < RULE.limit * 3; i++) expect(await limit('ip', RULE)).toEqual({ ok: true })
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('not configured'))).toHaveLength(1)
    })

    test('store failing → allow and log, never throw', async () => {
        storeFactory.mockReturnValue(failingStore)
        for (let i = 0; i < RULE.limit * 2; i++) expect(await limit('ip', RULE)).toEqual({ ok: true })
        expect(warn).toHaveBeenCalled()
    })

    test('a store answering 500 → allow', async () => {
        const fetchFn = jest.fn(async () => new Response('boom', { status: 500 }))
        storeFactory.mockReturnValue(new UpstashRateLimitStore({ url: 'https://up.test', token: 't', fetchFn }))
        expect(await limit('ip', RULE)).toEqual({ ok: true })
    })

    test('enforceRateLimit: null while allowed, then 429 rate_limited with Retry-After', async () => {
        storeFactory.mockReturnValue(new MemoryRateLimitStore(fakeClock().now))
        const one: RateLimitRule = { id: 'one', limit: 1, windowMs: 30_000 }
        expect(await enforceRateLimit('ip', one)).toBeNull()
        const res = await enforceRateLimit('ip', one)
        expect(res?.status).toBe(429)
        expect(res?.headers.get('Retry-After')).toBe('30')
        expect(await res?.json()).toEqual({ error: 'rate_limited' })
    })
})

describe('RATE_LIMITS', () => {
    test('every rule is a positive limit over a positive window, with a unique id', () => {
        const rules = Object.values(RATE_LIMITS)
        expect(rules.map((r) => r.id).sort()).toEqual(
            ['friendRequest', 'loginEmail', 'loginIp', 'maverickMove', 'signup'].sort(),
        )
        for (const r of rules) {
            expect(r.limit).toBeGreaterThan(0)
            expect(r.windowMs).toBeGreaterThan(0)
        }
    })
})

describe('clientIp()', () => {
    const h = (init: Record<string, string>) => new Headers(init)

    test.each([
        [{ 'x-forwarded-for': '203.0.113.7' }, '203.0.113.7'],
        [{ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2' }, '203.0.113.7'],
        [{ 'x-forwarded-for': '2001:db8::1, 10.0.0.1' }, '2001:db8::1'],
        [{ 'x-real-ip': '198.51.100.4' }, '198.51.100.4'],
        [{ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.4' }, '198.51.100.4'],
        [{ 'x-forwarded-for': ' , 10.0.0.1' }, 'unknown'],
        [{}, 'unknown'],
    ])('%p → %s', (headers, expected) => {
        expect(clientIp(h(headers))).toBe(expected)
    })
})
