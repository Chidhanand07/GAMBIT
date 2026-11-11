// Clock display helpers.

const SECONDS_PER_MINUTE = 60;

/**
 * Seconds → "MM:SS" (minutes are not wrapped into hours: 3600 → "60:00").
 * Uses the absolute value, so negative input renders without a sign.
 */
export function fmtTime(s: number): string {
    const m = Math.floor(Math.abs(s) / SECONDS_PER_MINUTE)
        .toString()
        .padStart(2, '0');
    const ss = (Math.abs(s) % SECONDS_PER_MINUTE).toString().padStart(2, '0');
    return `${m}:${ss}`;
}
