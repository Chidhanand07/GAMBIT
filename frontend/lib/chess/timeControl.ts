// Time-control parsing and speed-bucket classification.
//
// NOTE: the codebase uses several *different* minute→bucket thresholds today
// (see docs/refactor/adr/0200-time-control-buckets-not-unified.md). Only the
// frontend's "≤2 / ≤5 / ≤15" variant lives here; the game page's player-strip
// rating (<3 / <10 / ≥30) and the realtime server's rating pool (≤2 / ≤5 / ≤60)
// are intentionally not merged.
import type { SpeedBucket, TimeControl } from '@/types/timeControl';

/** Base minutes assumed when a time control is missing or unparseable (or "0"). */
export const DEFAULT_BASE_MINUTES = 10;

const BULLET_MAX_MINUTES = 2;
const BLITZ_MAX_MINUTES = 5;
const RAPID_MAX_MINUTES = 15;

export const SPEED_BUCKET_LABELS: Record<SpeedBucket, string> = {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
};

/** Leading integer of the time control; falls back to 10 for NaN *and* 0 (`parseInt(tc) || 10`). */
export function parseBaseMinutes(tc: TimeControl): number {
    return parseInt(tc) || DEFAULT_BASE_MINUTES;
}

/** ≤2 bullet, ≤5 blitz, ≤15 rapid, otherwise classical. NaN falls through to classical. */
export function speedBucketForMinutes(mins: number): SpeedBucket {
    if (mins <= BULLET_MAX_MINUTES) return 'bullet';
    if (mins <= BLITZ_MAX_MINUTES) return 'blitz';
    if (mins <= RAPID_MAX_MINUTES) return 'rapid';
    return 'classical';
}

/**
 * Bucket for a stored time control. Empty/missing or unparseable → 'rapid';
 * unlike `parseBaseMinutes`, "0" stays 0 minutes and is 'bullet'.
 */
export function classifyTimeControl(tc: TimeControl): SpeedBucket {
    if (!tc) return 'rapid';
    const mins = parseInt(tc);
    if (isNaN(mins)) return 'rapid';
    return speedBucketForMinutes(mins);
}
