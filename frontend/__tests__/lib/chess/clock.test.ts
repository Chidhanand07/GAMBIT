import { fmtTime } from '@/lib/chess/clock';

describe('fmtTime', () => {
    test.each([
        [600, '10:00'],
        [65, '01:05'],
        [0, '00:00'],
        [59, '00:59'],
        [3600, '60:00'],
        [6000, '100:00'],
    ])('%i s → %s', (s, out) => {
        expect(fmtTime(s)).toBe(out);
    });

    test('negative seconds render as their absolute value', () => {
        expect(fmtTime(-5)).toBe('00:05');
        expect(fmtTime(-65)).toBe('01:05');
    });
});
