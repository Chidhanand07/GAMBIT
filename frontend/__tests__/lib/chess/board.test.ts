import { FILES, RANKS, coordsToSq, sqToCoords } from '@/lib/chess/board';

describe('coordsToSq', () => {
    test.each([
        [0, 0, 'a1'],
        [7, 7, 'h8'],
        [4, 3, 'e4'],
        [3, 7, 'd8'],
    ])('(%i, %i) → %s', (file, rank, sq) => {
        expect(coordsToSq(file, rank)).toBe(sq);
    });

    test('matches the inline template literal used by the pages for every square', () => {
        for (let file = 0; file < 8; file++) {
            for (let rank = 0; rank < 8; rank++) {
                expect(coordsToSq(file, rank)).toBe(`${String.fromCharCode(97 + file)}${rank + 1}`);
            }
        }
    });
});

describe('sqToCoords', () => {
    test.each([
        ['a1', [0, 0]],
        ['h8', [7, 7]],
        ['e4', [4, 3]],
    ])('%s → %j', (sq, coords) => {
        expect(sqToCoords(sq)).toEqual(coords);
    });

    test('round-trips with coordsToSq', () => {
        for (let file = 0; file < 8; file++) {
            for (let rank = 0; rank < 8; rank++) {
                expect(sqToCoords(coordsToSq(file, rank))).toEqual([file, rank]);
            }
        }
    });

    test('does not validate: a malformed square yields NaN rank', () => {
        expect(sqToCoords('z')[1]).toBeNaN();
    });
});

describe('FILES / RANKS', () => {
    test('files run a→h and ranks 8→1', () => {
        expect(FILES.join('')).toBe('abcdefgh');
        expect(RANKS.join('')).toBe('87654321');
    });

    test('square colour parity used by the boards: a8 light, h1 light, a1 dark', () => {
        const isLight = (f: string, r: string) => (FILES.indexOf(f) + RANKS.indexOf(r)) % 2 === 0;
        expect(isLight('a', '8')).toBe(true);
        expect(isLight('h', '1')).toBe(true);
        expect(isLight('a', '1')).toBe(false);
    });
});
