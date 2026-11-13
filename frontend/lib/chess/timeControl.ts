// The time-control model: base minutes + increment seconds, written "M+S".
//
// Limits, category thresholds and the lobby presets come from one definition,
// `timeControl.data.json`: a copy of `shared/time-control.json`, which the game server
// carries too (scripts/sync-shared.js; a test on each side fails when a copy differs).
// The lobby, the game page, the profile and the API routes all classify through this file,
// so "blitz" means the same thing everywhere (F7).
import type { RatingField, SpeedBucket, TimeControl } from '@/types/timeControl';
import data from './timeControl.data.json';

export interface TimeControlModel {
    minutes: number;
    incrementSeconds: number;
}

export const TIME_CONTROL_LIMITS = data.limits;

/** Lobby preset id → canonical time control ("rapid" → "10+0"). */
export const TIME_CONTROL_PRESETS: Readonly<Record<string, TimeControl>> = data.presets;

/** Base minutes assumed when a stored time control is missing or unreadable. */
export const DEFAULT_BASE_MINUTES = data.defaultMinutes;

const DEFAULT_MODEL: TimeControlModel = { minutes: DEFAULT_BASE_MINUTES, incrementSeconds: 0 };

export const SPEED_BUCKET_LABELS: Record<SpeedBucket, string> = {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
};

/** "M" or "M+S": digits only, no sign, no spaces, no decimals. */
const PATTERN = /^(\d{1,4})(?:\+(\d{1,3}))?$/;

const { minMinutes, maxMinutes, maxIncrementSeconds } = data.limits;

const isMinutes = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) >= minMinutes && (n as number) <= maxMinutes;
const isIncrement = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= maxIncrementSeconds;

/** The text form's parts: [minutes, increment or undefined], or null. */
function readParts(value: unknown): [number, number | undefined] | null {
    if (typeof value === 'number') return [value, undefined];
    if (typeof value !== 'string') return null;
    const match = PATTERN.exec(value);
    if (!match) return null;
    return [Number(match[1]), match[2] === undefined ? undefined : Number(match[2])];
}

/**
 * Strict parse of user input: "10", "5+3" or a number of minutes, optionally with a separate
 * increment (used only when the text carries none). Null when malformed or out of range.
 */
export function parseTimeControl(value: unknown, increment?: unknown): TimeControlModel | null {
    const parts = readParts(value);
    if (!parts) return null;
    const [minutes, ownIncrement] = parts;
    const incrementSeconds = ownIncrement ?? increment ?? 0;
    if (!isMinutes(minutes) || !isIncrement(incrementSeconds)) return null;
    return { minutes, incrementSeconds };
}

/** Canonical text: "M+S", always with the increment. */
export function formatTimeControl({ minutes, incrementSeconds }: TimeControlModel): TimeControl {
    return `${minutes}+${incrementSeconds}`;
}

/** User input → canonical text, or null when invalid. */
export function normalizeTimeControl(value: unknown, increment?: unknown): TimeControl | null {
    const parsed = parseTimeControl(value, increment);
    return parsed ? formatTimeControl(parsed) : null;
}

/** The model of a stored value; anything unreadable is the default (10+0). */
export function timeControlOf(stored: unknown): TimeControlModel {
    return parseTimeControl(stored) ?? DEFAULT_MODEL;
}

/** Category for a number of base minutes: the first threshold the minutes fit under. */
export function speedBucketForMinutes(mins: number): SpeedBucket {
    const match = data.categories.find((c) => c.maxMinutes === null || mins <= c.maxMinutes);
    return (match ?? data.categories[data.categories.length - 1]).id as SpeedBucket;
}

export function categoryOf(model: TimeControlModel): SpeedBucket {
    return speedBucketForMinutes(model.minutes);
}

/** Base minutes of a stored time control. */
export function parseBaseMinutes(tc: unknown): number {
    return timeControlOf(tc).minutes;
}

/** Category of a stored time control. */
export function classifyTimeControl(tc: unknown): SpeedBucket {
    return categoryOf(timeControlOf(tc));
}

/** The `profiles` rating column for a stored time control. */
export function ratingFieldFor(tc: unknown): RatingField {
    return `rating_${classifyTimeControl(tc)}`;
}

/** Text for the UI: "10 min" without an increment, "5+3" with one. Accepts old ("10") and canonical values. */
export function displayTimeControl(stored: unknown): string {
    const { minutes, incrementSeconds } = timeControlOf(stored);
    return incrementSeconds === 0 ? `${minutes} min` : `${minutes}+${incrementSeconds}`;
}
