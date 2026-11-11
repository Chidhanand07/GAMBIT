const { parseMinutes, parseIncrementMs, initialClockMs, ratingField } = require('../../src/domain/timeControl');

describe('parseMinutes', () => {
    test.each([
        ['10', 10],
        ['3+2', 3],
        ['1', 1],
        [5, 5],
        ['90+30', 90],
        ['7.9', 7], // parseInt truncates
        [' 4', 4], // parseInt skips leading whitespace
        ['0', 10], // `|| 10`, not `?? 10`
        ['', 10],
        ['abc', 10],
        [null, 10],
        [undefined, 10],
        ['-5', -5], // negative survives `||`
    ])('%p → %p', (tc, mins) => expect(parseMinutes(tc)).toBe(mins));
});

describe('parseIncrementMs', () => {
    test.each([
        ['3+2', 2000],
        ['15+10', 10000],
        ['10', 0], // no "+" → 0 (known bug: the increment is lost)
        ['10+', 0],
        ['10+x', 0],
        ['1+1+5', 1000],
        ['+3', 3000],
        [0, 0],
        [null, 0],
        [undefined, 0],
        ['', 0],
    ])('%p → %p ms', (tc, ms) => expect(parseIncrementMs(tc)).toBe(ms));
});

describe('initialClockMs', () => {
    test.each([
        ['10', 600000],
        ['3+2', 180000],
        ['0', 600000],
        [undefined, 600000],
    ])('%p → %p ms', (tc, ms) => expect(initialClockMs(tc)).toBe(ms));
});

describe('ratingField', () => {
    test.each([
        ['1', 'rating_bullet'],
        ['2+1', 'rating_bullet'],
        ['-5', 'rating_bullet'],
        ['3', 'rating_blitz'],
        ['5', 'rating_blitz'],
        ['6', 'rating_rapid'],
        ['60', 'rating_rapid'],
        ['0', 'rating_rapid'], // falls back to 10 minutes
        [undefined, 'rating_rapid'],
        ['61', 'rating_classical'],
        ['90+30', 'rating_classical'],
    ])('%p → %p', (tc, field) => expect(ratingField(tc)).toBe(field));
});
