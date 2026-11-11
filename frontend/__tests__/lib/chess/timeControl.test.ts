import {
    DEFAULT_BASE_MINUTES,
    SPEED_BUCKET_LABELS,
    classifyTimeControl,
    parseBaseMinutes,
    speedBucketForMinutes,
} from '@/lib/chess/timeControl';

describe('parseBaseMinutes', () => {
    test.each([
        ['1', 1],
        ['10', 10],
        ['5+3', 5],
        ['1440', 1440],
        ['', DEFAULT_BASE_MINUTES],
        ['abc', DEFAULT_BASE_MINUTES],
        ['0', DEFAULT_BASE_MINUTES],
        ['-5', -5],
    ])('%j → %i', (tc, mins) => {
        expect(parseBaseMinutes(tc)).toBe(mins);
    });
});

describe('speedBucketForMinutes', () => {
    test.each([
        [-1, 'bullet'],
        [0, 'bullet'],
        [1, 'bullet'],
        [2, 'bullet'],
        [3, 'blitz'],
        [5, 'blitz'],
        [6, 'rapid'],
        [10, 'rapid'],
        [15, 'rapid'],
        [16, 'classical'],
        [30, 'classical'],
        [1440, 'classical'],
        [NaN, 'classical'],
    ])('%d min → %s', (mins, bucket) => {
        expect(speedBucketForMinutes(mins)).toBe(bucket);
    });
});

describe('classifyTimeControl', () => {
    test.each([
        ['1', 'bullet'],
        ['3', 'blitz'],
        ['5+3', 'blitz'],
        ['10', 'rapid'],
        ['30', 'classical'],
        ['0', 'bullet'],
        ['', 'rapid'],
        ['abc', 'rapid'],
    ])('%j → %s', (tc, bucket) => {
        expect(classifyTimeControl(tc)).toBe(bucket);
    });

    test('missing value at runtime → rapid', () => {
        expect(classifyTimeControl(null as unknown as string)).toBe('rapid');
        expect(classifyTimeControl(undefined as unknown as string)).toBe('rapid');
    });

    test('"0": parseBaseMinutes-based bucketing says rapid, classifyTimeControl says bullet', () => {
        expect(speedBucketForMinutes(parseBaseMinutes('0'))).toBe('rapid');
        expect(classifyTimeControl('0')).toBe('bullet');
    });
});

describe('SPEED_BUCKET_LABELS', () => {
    test('title-case labels for the four buckets', () => {
        expect(SPEED_BUCKET_LABELS).toEqual({
            bullet: 'Bullet',
            blitz: 'Blitz',
            rapid: 'Rapid',
            classical: 'Classical',
        });
    });
});
