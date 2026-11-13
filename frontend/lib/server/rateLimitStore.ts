import 'server-only';
import { z } from 'zod';

// Shared store for the rate limiter (RATE-LIMITS, NODE-12). Vercel runs the route handlers on
// many short-lived instances, so a counter in process memory would give N× the limit; the
// counter lives in Upstash Redis, reached over HTTPS with plain fetch (no Redis client).

/** One counted hit in a fixed window. */
export type WindowHit = {
    /** Hits in the current window, this one included. */
    count: number;
    /** Milliseconds until the current window ends. */
    resetMs: number;
};

/**
 * Port: a fixed-window counter. `hit` increments `key`, starting a window of `windowMs` when
 * none is open. Rejects when the store cannot answer; the limiter decides what that means.
 * Every implementation passes __tests__/lib/server/rateLimitStore.contract.test.ts (SOLID-04).
 */
export interface RateLimitStore {
    hit(key: string, windowMs: number): Promise<WindowHit>;
}

export type UpstashOptions = {
    url: string;
    token: string;
    fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
    timeoutMs?: number;
};

/** A slow store must not hold a sign-in up for long; on timeout the limiter lets it through. */
const DEFAULT_TIMEOUT_MS = 1000;

const commandResult = z.object({ result: z.number() });
const pipelineResponse = z.tuple([commandResult, commandResult, commandResult]);

/**
 * Upstash Redis REST adapter. One pipelined request (https://upstash.com/docs/redis/features/restapi,
 * "Pipelining": POST {url}/pipeline, a 2-D JSON array of commands, Bearer token; the answer is
 * one { result } or { error } per command, in order):
 *   INCR key                    → the count
 *   PEXPIRE key windowMs NX     → starts the window only when the key has no expiry yet, so the
 *                                 window never slides and a key never lives forever
 *   PTTL key                    → time left in the window (for Retry-After)
 */
export class UpstashRateLimitStore implements RateLimitStore {
    private readonly endpoint: string;
    private readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;

    constructor(private readonly options: UpstashOptions) {
        this.endpoint = `${options.url.replace(/\/+$/, '')}/pipeline`;
        this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    }

    async hit(key: string, windowMs: number): Promise<WindowHit> {
        const res = await this.fetchFn(this.endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.options.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([
                ['INCR', key],
                ['PEXPIRE', key, String(windowMs), 'NX'],
                ['PTTL', key],
            ]),
            cache: 'no-store',
            signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Upstash answered HTTP ${res.status}`);
        const parsed = pipelineResponse.safeParse(await res.json());
        if (!parsed.success) throw new Error('Unexpected Upstash pipeline response');
        const [count, , ttl] = parsed.data.map((entry) => entry.result);
        return { count, resetMs: ttl > 0 ? ttl : windowMs };
    }
}

/**
 * The configured store, or null when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not
 * both set. The one place the limiter's secrets are read (NX-05); tests replace this factory.
 */
export function rateLimitStore(): RateLimitStore | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? new UpstashRateLimitStore({ url, token }) : null;
}
