import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createCookieReadingClient, type RequestCookieStore } from './supabase';

// Caller identity for the route handlers.
//
// KNOWN BUG (preserved, see docs/refactor/adr/0202-route-identity-variants.md): the cookie
// variants base64-decode the access token WITHOUT verifying its signature, and the handlers
// then use the service-role client, so a forged cookie impersonates any user.

/** Supabase splits large session cookies into `<name>.0` … `<name>.9`. */
const MAX_COOKIE_CHUNKS = 10;
/** Tokens that expired less than this many seconds ago are still accepted (clock skew). */
const EXPIRY_LEEWAY_SECONDS = 60;
const JWT_PART_COUNT = 3;
const BASE64_BLOCK = 4;

function authCookieName(): string {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
    return `sb-${ref}-auth-token`;
}

function joinCookieChunks(cookieStore: RequestCookieStore, baseName: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
        const chunk = cookieStore.get(`${baseName}.${i}`);
        if (!chunk) break;
        chunks.push(chunk.value);
    }
    return chunks;
}

/** JWT claims as decoded; at runtime the payload can be any JSON value (even null). */
type JwtClaims = { exp?: unknown; sub?: unknown };

function decodeJwtPayload(token: string): JwtClaims {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((BASE64_BLOCK - (part.length % BASE64_BLOCK)) % BASE64_BLOCK);
    return JSON.parse(Buffer.from(padded, 'base64').toString());
}

/** `sub` of the (unverified) access token in a raw session cookie value, or null. */
function userIdFromSessionCookie(raw: string): string | null {
    try {
        let session: { access_token?: string } | null;
        try {
            session = JSON.parse(raw);
        } catch {
            session = JSON.parse(decodeURIComponent(raw));
        }
        const token = session?.access_token;
        if (!token || token.split('.').length !== JWT_PART_COUNT) return null;
        // A JSON `null` payload makes this destructuring throw → caught → null, as before.
        const { exp, sub } = decodeJwtPayload(token);
        const now = Math.floor(Date.now() / 1000);
        if (typeof exp === 'number' && exp < now - EXPIRY_LEEWAY_SECONDS) return null;
        return (sub as string | undefined) ?? null;
    } catch {
        return null;
    }
}

/**
 * User id from the `sb-<ref>-auth-token` cookie (the copy every cookie-auth handler had
 * inline). A present-but-empty base cookie wins over the chunks (`??`) and yields null.
 */
export function getUserId(cookieStore: RequestCookieStore): string | null {
    const baseName = authCookieName();
    const single = cookieStore.get(baseName)?.value;
    const raw = single ?? (joinCookieChunks(cookieStore, baseName).join('') || null);
    if (!raw) return null;
    return userIdFromSessionCookie(raw);
}

/**
 * `/api/profile/me` variant (its getRawAuthCookie): an EMPTY base cookie is skipped and
 * the chunks `.0`–`.9` are read instead. Otherwise identical to {@link getUserId}.
 */
export function getUserIdSkippingEmptyCookie(cookieStore: RequestCookieStore): string | null {
    const baseName = authCookieName();
    const single = cookieStore.get(baseName);
    const chunks = single?.value ? [single.value] : joinCookieChunks(cookieStore, baseName);
    const raw = chunks.length > 0 ? chunks.join('') : null;
    if (!raw) return null;
    return userIdFromSessionCookie(raw);
}

/**
 * User of the cookie session as reported by `auth.getSession()` on an anon @supabase/ssr
 * client with `persistSession: false` (`/api/games/[id]`). Also not server-verified.
 */
export async function getSessionUser(cookieStore: RequestCookieStore): Promise<User | null> {
    const supabase = createCookieReadingClient(cookieStore, { noPersistence: true });
    const {
        data: { session },
    } = await supabase.auth.getSession();
    return session?.user ?? null;
}
