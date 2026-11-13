import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rateLimitStore } from './rateLimitStore';

// Fixed-window rate limits for the public-facing route handlers (RATE-LIMITS, NODE-12).
//
// Availability over strictness: when the store is not configured, or is configured but fails,
// the request is ALLOWED and the problem is logged (ADR: rate limiter fails open). The limiter
// never throws. A limited request gets 429 { error: 'rate_limited' } with Retry-After.

export type RateLimitRule = { id: string; limit: number; windowMs: number };
export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const HTTP_TOO_MANY_REQUESTS = 429;
const MIN_RETRY_AFTER_SECONDS = 1;
const KEY_PREFIX = 'gambit:rl';
/** Hex characters of the SHA-256 kept in a key: no raw IP or e-mail is stored in Redis. */
const KEY_HASH_LENGTH = 32;

/** Every limit in one table. Why these numbers: see the RATE-LIMITS ADR. */
export const RATE_LIMITS = {
    /** One engine call per computer move; one move a second sustained covers a fast human. */
    maverickMove: { id: 'maverickMove', limit: 60, windowMs: MINUTE_MS },
    /** Per IP: a household or office behind one NAT, with typos, stays well under it. */
    loginIp: { id: 'loginIp', limit: 20, windowMs: 10 * MINUTE_MS },
    /** Per e-mail across IPs: slows guessing one account's password from a botnet. */
    loginEmail: { id: 'loginEmail', limit: 10, windowMs: 15 * MINUTE_MS },
    /** Per IP: nobody creates more than a few accounts an hour. */
    signup: { id: 'signup', limit: 5, windowMs: HOUR_MS },
    /** Per verified user: a busy social session, not a spam run. */
    friendRequest: { id: 'friendRequest', limit: 30, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitRule>;

const ALLOWED: LimitResult = { ok: true };
let warnedUnconfigured = false;

function storeKey(key: string, rule: RateLimitRule): string {
    const digest = createHash('sha256').update(key).digest('hex').slice(0, KEY_HASH_LENGTH);
    return `${KEY_PREFIX}:${rule.id}:${digest}`;
}

/** Counts one request for `key` under `rule`. Never throws; fails open. */
export async function limit(key: string, rule: RateLimitRule): Promise<LimitResult> {
    const store = rateLimitStore();
    if (!store) {
        if (!warnedUnconfigured) {
            warnedUnconfigured = true;
            console.warn('[rate-limit] UPSTASH_REDIS_REST_URL / _TOKEN not configured: rate limits are OFF');
        }
        return ALLOWED;
    }
    try {
        const { count, resetMs } = await store.hit(storeKey(key, rule), rule.windowMs);
        if (count <= rule.limit) return ALLOWED;
        return { ok: false, retryAfterSeconds: Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(resetMs / SECOND_MS)) };
    } catch (e: unknown) {
        console.warn(`[rate-limit] store unavailable, allowing the request (${rule.id}):`, (e as Error)?.message);
        return ALLOWED;
    }
}

/** null when `key` may proceed; otherwise the 429 response to return as-is. */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<NextResponse | null> {
    const result = await limit(key, rule);
    if (result.ok) return null;
    return NextResponse.json(
        { error: 'rate_limited' },
        { status: HTTP_TOO_MANY_REQUESTS, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
    );
}
