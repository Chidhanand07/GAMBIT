/**
 * The time-control model (TIME-CONTROL: G4, F7, F9; SOLID-03, TEST-03, TEST-08).
 *
 * One definition (shared/time-control.json) drives the game server and the web app. The
 * `cases` in that file are the contract: both sides run them, so they cannot drift apart.
 */
const fs = require('node:fs');
const path = require('node:path');
const tc = require('../../src/domain/timeControl');

const data = require('../../src/domain/timeControl.data.json');

const SHARED = path.join(__dirname, '..', '..', '..', 'shared', 'time-control.json');
const COPY = path.join(__dirname, '..', '..', 'src', 'domain', 'timeControl.data.json');

test("the server's copy of the definition is identical to shared/time-control.json", () => {
    expect(fs.readFileSync(COPY, 'utf8')).toBe(fs.readFileSync(SHARED, 'utf8'));
});

describe('shared contract cases', () => {
    test.each(data.cases.valid)('$input (+$increment) → $canonical, $category', (c) => {
        const parsed = tc.parseTimeControl(c.input, c.increment);
        expect(parsed).toEqual({ minutes: c.minutes, incrementSeconds: c.incrementSeconds });
        expect(tc.formatTimeControl(parsed)).toBe(c.canonical);
        expect(tc.categoryOf(parsed)).toBe(c.category);
        expect(tc.ratingField(c.canonical)).toBe(`rating_${c.category}`);
        expect(tc.isValidTimeControl(c.input)).toBe(true);
    });

    test.each(data.cases.invalid.map((input) => [input]))('%p is not a time control', (input) => {
        expect(tc.parseTimeControl(input)).toBeNull();
        expect(tc.isValidTimeControl(input)).toBe(false);
    });
});

describe('parseTimeControl', () => {
    test('a separate increment is used only when the string carries none', () => {
        expect(tc.parseTimeControl('10', 5)).toEqual({ minutes: 10, incrementSeconds: 5 });
        expect(tc.parseTimeControl('10+2', 5)).toEqual({ minutes: 10, incrementSeconds: 2 });
    });

    test.each([-1, 181, 1.5, NaN, '3'])('an out-of-range or non-integer separate increment (%p) is invalid', (inc) => {
        expect(tc.parseTimeControl('10', inc)).toBeNull();
    });

    test('limits come from the shared definition', () => {
        const { minMinutes, maxMinutes, maxIncrementSeconds } = data.limits;
        expect(tc.parseTimeControl(String(minMinutes))).not.toBeNull();
        expect(tc.parseTimeControl(String(minMinutes - 1))).toBeNull();
        expect(tc.parseTimeControl(String(maxMinutes))).not.toBeNull();
        expect(tc.parseTimeControl(String(maxMinutes + 1))).toBeNull();
        expect(tc.parseTimeControl(`10+${maxIncrementSeconds}`)).not.toBeNull();
        expect(tc.parseTimeControl(`10+${maxIncrementSeconds + 1}`)).toBeNull();
    });
});

describe('normalizeTimeControl (canonical "M+S" string, or null)', () => {
    test.each([
        ['10', undefined, '10+0'],
        ['10', 5, '10+5'],
        ['5+3', undefined, '5+3'],
        [3, 2, '3+2'],
    ])('%p with increment %p → %p', (value, increment, canonical) => {
        expect(tc.normalizeTimeControl(value, increment)).toBe(canonical);
    });

    test('invalid input → null (the caller decides; nothing is silently defaulted)', () => {
        expect(tc.normalizeTimeControl('-5')).toBeNull();
        expect(tc.normalizeTimeControl('rapid')).toBeNull();
    });
});

describe('timeControlOf (stored values: a legacy or damaged row still gets a clock)', () => {
    test.each([
        ['10', { minutes: 10, incrementSeconds: 0 }],
        ['3+2', { minutes: 3, incrementSeconds: 2 }],
        [5, { minutes: 5, incrementSeconds: 0 }],
    ])('%p → %p', (stored, model) => expect(tc.timeControlOf(stored)).toEqual(model));

    // These used to produce a 0-minute, negative or 10-minute clock depending on the helper.
    test.each(['0', '', 'abc', null, undefined, '-5', 'rapid', '10+x'])('%p → the default 10+0', (stored) => {
        expect(tc.timeControlOf(stored)).toEqual({ minutes: 10, incrementSeconds: 0 });
    });
});

describe('clock values', () => {
    test.each([
        ['10', 600000, 0],
        ['3+2', 180000, 2000],
        ['15+10', 900000, 10000],
        ['-5', 600000, 0], // was a NEGATIVE clock (-300000 ms)
        [undefined, 600000, 0],
    ])('%p → %p ms base, %p ms increment', (value, baseMs, incMs) => {
        expect(tc.initialClockMs(value)).toBe(baseMs);
        expect(tc.parseIncrementMs(value)).toBe(incMs);
    });

    test('parseMinutes reads the base minutes of a stored value', () => {
        expect(tc.parseMinutes('90+30')).toBe(90);
        expect(tc.parseMinutes('0')).toBe(10);
    });
});

describe('categories (one set of thresholds for server and web) [F7]', () => {
    test.each([
        ['1', 'bullet'],
        ['2+1', 'bullet'],
        ['3', 'blitz'],
        ['5', 'blitz'],
        ['6', 'rapid'],
        ['10', 'rapid'],
        ['29', 'rapid'],
        // The lobby's "Classical" preset is 30 minutes; it used to be rated as rapid (≤ 60).
        ['30', 'classical'],
        ['60', 'classical'],
        ['90+30', 'classical'],
        [undefined, 'rapid'],
    ])('%p → rating_%s', (value, category) => {
        expect(tc.ratingField(value)).toBe(`rating_${category}`);
    });

    test('CATEGORY_IDS lists the categories in order', () => {
        expect(tc.CATEGORY_IDS).toEqual(['bullet', 'blitz', 'rapid', 'classical']);
    });
});
