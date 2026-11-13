/** @jest-environment node */
/**
 * RATE-LIMITS (SOLID-04, TEST-08): every RateLimitStore implementation passes the same
 * fixed-window contract. The Upstash adapter runs against a fake Upstash REST endpoint.
 */
import { UpstashRateLimitStore, type RateLimitStore } from '@/lib/server/rateLimitStore'
import { fakeClock, fakeUpstash, MemoryRateLimitStore, type Clock } from '../../helpers/rateLimitFakes'

const WINDOW_MS = 60_000

const implementations: [string, (clock: Clock) => RateLimitStore][] = [
    ['in-memory fake', (clock) => new MemoryRateLimitStore(clock.now)],
    [
        'Upstash REST',
        (clock) => new UpstashRateLimitStore({ url: 'https://up.test', token: 't', fetchFn: fakeUpstash(clock) }),
    ],
]

describe.each(implementations)('RateLimitStore contract: %s', (_name, make) => {
    let clock: Clock
    let store: RateLimitStore
    beforeEach(() => {
        clock = fakeClock()
        store = make(clock)
    })

    test('the first hit in a window counts 1 and the window resets after windowMs', async () => {
        expect(await store.hit('k', WINDOW_MS)).toEqual({ count: 1, resetMs: WINDOW_MS })
    })

    test('hits in the same window count up; the reset time does not move', async () => {
        await store.hit('k', WINDOW_MS)
        clock.advance(10_000)
        expect(await store.hit('k', WINDOW_MS)).toEqual({ count: 2, resetMs: WINDOW_MS - 10_000 })
        expect(await store.hit('k', WINDOW_MS)).toEqual({ count: 3, resetMs: WINDOW_MS - 10_000 })
    })

    test('keys are independent', async () => {
        await store.hit('a', WINDOW_MS)
        await store.hit('a', WINDOW_MS)
        expect((await store.hit('b', WINDOW_MS)).count).toBe(1)
    })

    test('a new window starts once the old one expired', async () => {
        await store.hit('k', WINDOW_MS)
        await store.hit('k', WINDOW_MS)
        clock.advance(WINDOW_MS)
        expect(await store.hit('k', WINDOW_MS)).toEqual({ count: 1, resetMs: WINDOW_MS })
    })
})

describe('UpstashRateLimitStore wire format', () => {
    const clock = fakeClock()

    test('one pipelined POST: INCR, PEXPIRE NX, PTTL with the bearer token', async () => {
        const fetchFn = fakeUpstash(clock)
        await new UpstashRateLimitStore({ url: 'https://up.test/', token: 'tok', fetchFn }).hit('k', WINDOW_MS)
        expect(fetchFn).toHaveBeenCalledTimes(1)
        const [url, init] = fetchFn.mock.calls[0]
        expect(url).toBe('https://up.test/pipeline')
        expect(init.method).toBe('POST')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
        expect(fetchFn.requests[0]).toEqual([
            ['INCR', 'k'],
            ['PEXPIRE', 'k', String(WINDOW_MS), 'NX'],
            ['PTTL', 'k'],
        ])
    })

    test.each([
        ['a non-2xx answer', new Response('unauthorized', { status: 401 })],
        ['a per-command error', new Response(JSON.stringify([{ error: 'ERR' }, { result: 1 }, { result: 5 }]))],
        ['an unexpected body', new Response(JSON.stringify({ result: 'x' }))],
    ])('rejects on %s (the limiter turns that into "allow")', async (_label, response) => {
        const fetchFn = jest.fn(async () => response)
        const store = new UpstashRateLimitStore({ url: 'https://up.test', token: 't', fetchFn })
        await expect(store.hit('k', WINDOW_MS)).rejects.toThrow()
    })
})
