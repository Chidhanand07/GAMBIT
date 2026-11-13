/**
 * The time-control model on the web side (TIME-CONTROL: G4, F7, F9; TEST-08).
 * The definition and the contract `cases` are the same file the game server tests run.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    DEFAULT_BASE_MINUTES,
    SPEED_BUCKET_LABELS,
    TIME_CONTROL_LIMITS,
    TIME_CONTROL_PRESETS,
    categoryOf,
    classifyTimeControl,
    displayTimeControl,
    formatTimeControl,
    normalizeTimeControl,
    parseBaseMinutes,
    parseTimeControl,
    ratingFieldFor,
    speedBucketForMinutes,
    timeControlOf,
} from '@/lib/chess/timeControl';
import data from '@/lib/chess/timeControl.data.json';

const SHARED = path.join(__dirname, '..', '..', '..', '..', 'shared', 'time-control.json');
const COPY = path.join(__dirname, '..', '..', '..', 'lib', 'chess', 'timeControl.data.json');

test("the web app's copy of the definition is identical to shared/time-control.json", () => {
    expect(fs.readFileSync(COPY, 'utf8')).toBe(fs.readFileSync(SHARED, 'utf8'));
});

describe('shared contract cases', () => {
    test.each(data.cases.valid)('$input (+$increment) → $canonical, $category', (c) => {
        const parsed = parseTimeControl(c.input, 'increment' in c ? c.increment : undefined);
        expect(parsed).toEqual({ minutes: c.minutes, incrementSeconds: c.incrementSeconds });
        expect(formatTimeControl(parsed!)).toBe(c.canonical);
        expect(categoryOf(parsed!)).toBe(c.category);
        expect(ratingFieldFor(c.canonical)).toBe(`rating_${c.category}`);
    });

    test.each((data.cases.invalid as unknown[]).map((input) => [input]))('%p is not a time control', (input) => {
        expect(parseTimeControl(input)).toBeNull();
        expect(normalizeTimeControl(input)).toBeNull();
    });
});

describe('stored values', () => {
    test.each([
        ['1', 1],
        ['10', 10],
        ['5+3', 5],
        ['1440', 1440],
        ['', DEFAULT_BASE_MINUTES],
        ['abc', DEFAULT_BASE_MINUTES],
        ['0', DEFAULT_BASE_MINUTES],
        // Was -5: a negative clock preset on the game page.
        ['-5', DEFAULT_BASE_MINUTES],
    ])('parseBaseMinutes(%j) → %i', (tc, mins) => {
        expect(parseBaseMinutes(tc)).toBe(mins);
    });

    test('timeControlOf falls back to the default for anything unreadable', () => {
        expect(timeControlOf('3+2')).toEqual({ minutes: 3, incrementSeconds: 2 });
        expect(timeControlOf(null)).toEqual({ minutes: DEFAULT_BASE_MINUTES, incrementSeconds: 0 });
        expect(timeControlOf('rapid')).toEqual({ minutes: DEFAULT_BASE_MINUTES, incrementSeconds: 0 });
    });
});

describe('one set of category thresholds everywhere [F7]', () => {
    test.each([
        [1, 'bullet'],
        [2, 'bullet'],
        [3, 'blitz'],
        [5, 'blitz'],
        [6, 'rapid'],
        [10, 'rapid'],
        [15, 'rapid'],
        // Was classical on the profile (> 15) and rapid on the server (≤ 60).
        [16, 'rapid'],
        [29, 'rapid'],
        [30, 'classical'],
        [60, 'classical'],
        [1440, 'classical'],
    ])('%d min → %s', (mins, bucket) => {
        expect(speedBucketForMinutes(mins)).toBe(bucket);
    });

    test.each([
        ['1', 'bullet'],
        ['3', 'blitz'],
        ['5+3', 'blitz'],
        ['9', 'rapid'],
        ['10', 'rapid'],
        ['30', 'classical'],
        // Unreadable stored values are the default 10+0, i.e. rapid.
        ['0', 'rapid'],
        ['', 'rapid'],
        ['abc', 'rapid'],
    ])('classifyTimeControl(%j) → %s', (tc, bucket) => {
        expect(classifyTimeControl(tc)).toBe(bucket);
    });

    test('missing value at runtime → rapid', () => {
        expect(classifyTimeControl(null as unknown as string)).toBe('rapid');
        expect(classifyTimeControl(undefined as unknown as string)).toBe('rapid');
    });

    test('every lobby preset lands in the category it is named after', () => {
        for (const id of ['bullet', 'blitz', 'rapid', 'classical'] as const) {
            expect(classifyTimeControl(TIME_CONTROL_PRESETS[id])).toBe(id);
        }
    });
});

test('limits and labels are exported from the shared definition', () => {
    expect(TIME_CONTROL_LIMITS).toEqual(data.limits);
    expect(SPEED_BUCKET_LABELS).toEqual({ bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' });
});

describe('displayTimeControl (what the UI prints for a stored value)', () => {
    test.each([
        ['10', '10 min'],
        ['10+0', '10 min'],
        ['5+3', '5+3'],
        ['1440+0', '1440 min'],
        [null, '10 min'],
    ])('%j → %s', (stored, text) => {
        expect(displayTimeControl(stored)).toBe(text);
    });
});
