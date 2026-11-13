/**
 * Test doubles for the rate limiter's store port (lib/server/rateLimitStore.ts).
 *
 * - MemoryRateLimitStore: the in-memory fake the route tests inject.
 * - fakeUpstash: a fetch function that answers Upstash's REST /pipeline the way Redis would
 *   for INCR / PEXPIRE ... NX / PTTL, so the real Upstash adapter can run the same contract.
 * Both read time from the same injectable clock.
 */
import type { RateLimitStore, WindowHit } from '@/lib/server/rateLimitStore'

export type Clock = { now: () => number; advance: (ms: number) => void }

export function fakeClock(start = 1_000_000): Clock {
    let t = start
    return { now: () => t, advance: (ms) => { t += ms } }
}

export class MemoryRateLimitStore implements RateLimitStore {
    private readonly windows = new Map<string, { count: number; expiresAt: number }>()
    readonly keys: string[] = []

    constructor(private readonly now: () => number = Date.now) {}

    async hit(key: string, windowMs: number): Promise<WindowHit> {
        this.keys.push(key)
        const t = this.now()
        let w = this.windows.get(key)
        if (!w || w.expiresAt <= t) {
            w = { count: 0, expiresAt: t + windowMs }
            this.windows.set(key, w)
        }
        w.count += 1
        return { count: w.count, resetMs: w.expiresAt - t }
    }
}

/** A store whose every call fails (network error). */
export const failingStore: RateLimitStore = {
    hit: async () => {
        throw new Error('ECONNRESET')
    },
}

type Entry = { value: number; expiresAt: number | null }
export type FakeUpstash = jest.Mock<Promise<Response>, [string, RequestInit]> & { requests: unknown[][][] }

/** fetch() for an Upstash REST endpoint: POST {url}/pipeline with a 2-D JSON array of commands. */
export function fakeUpstash(clock: Clock): FakeUpstash {
    const data = new Map<string, Entry>()
    const requests: unknown[][][] = []
    const live = (key: string) => {
        const e = data.get(key)
        if (e && e.expiresAt !== null && e.expiresAt <= clock.now()) data.delete(key)
        return data.get(key)
    }
    const run = ([cmd, key, ...args]: string[]): unknown => {
        const e = live(key)
        switch (cmd) {
            case 'INCR': {
                const next = { value: (e?.value ?? 0) + 1, expiresAt: e?.expiresAt ?? null }
                data.set(key, next)
                return next.value
            }
            case 'PEXPIRE': {
                if (!e || (args[1] === 'NX' && e.expiresAt !== null)) return 0
                e.expiresAt = clock.now() + Number(args[0])
                return 1
            }
            case 'PTTL':
                if (!e) return -2
                return e.expiresAt === null ? -1 : e.expiresAt - clock.now()
            default:
                return undefined
        }
    }
    const fn = jest.fn(async (url: string, init: RequestInit) => {
        const commands = JSON.parse(String(init.body)) as string[][]
        requests.push(commands)
        if (!url.endsWith('/pipeline')) return new Response('not found', { status: 404 })
        return new Response(JSON.stringify(commands.map((c) => ({ result: run(c) }))), { status: 200 })
    }) as FakeUpstash
    fn.requests = requests
    return fn
}
