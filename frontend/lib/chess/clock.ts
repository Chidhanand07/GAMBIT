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

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
/** Below this many seconds a clock turns coral (Game.dc.html `myLow` / `oppLow`). */
export const LOW_CLOCK_SECONDS = 30;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Seconds → the redesign's clock text: "3:00", "0:07", "1:05:00" from an hour up, and "2 days"
 * for daily (correspondence) clocks. Negative or fractional input is clamped and floored.
 */
export function formatClock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    if (s >= SECONDS_PER_DAY) {
        const days = Math.floor(s / SECONDS_PER_DAY);
        return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    const m = Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    if (s >= SECONDS_PER_HOUR) return `${Math.floor(s / SECONDS_PER_HOUR)}:${pad2(m)}:${pad2(s % SECONDS_PER_MINUTE)}`;
    return `${m}:${pad2(s % SECONDS_PER_MINUTE)}`;
}

/** A clock is low under 30 s, except in games of more than an hour a side (daily). */
export function isClockLow(seconds: number, totalSeconds: number): boolean {
    return totalSeconds <= SECONDS_PER_HOUR && seconds < LOW_CLOCK_SECONDS;
}

/** Remaining time as a whole percentage of the starting time, for the draining time bar. */
export function clockPercent(seconds: number, totalSeconds: number): number {
    if (totalSeconds <= 0) return 0;
    return Math.round((Math.min(Math.max(seconds, 0), totalSeconds) / totalSeconds) * 100);
}
