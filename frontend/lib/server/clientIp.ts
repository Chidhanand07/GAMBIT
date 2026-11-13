import 'server-only';

// The caller's IP for per-IP rate limits (RATE-LIMITS). On Vercel the platform sets
// x-forwarded-for with the client address first (and x-real-ip); the first entry is the client.

const UNKNOWN_IP = 'unknown';

/** First x-forwarded-for entry, else x-real-ip, else 'unknown' (all unknown callers share one bucket). */
export function clientIp(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
    return headers.get('x-real-ip')?.trim() || UNKNOWN_IP;
}
