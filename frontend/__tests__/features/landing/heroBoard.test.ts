import { heroSquares } from '@/features/landing/heroBoard';
import { HERO_POSITION } from '@/features/landing/landingContent';

describe('heroSquares (Home.dc.html baseVals)', () => {
    const squares = heroSquares(HERO_POSITION);
    const at = (sq: string) => squares.find((s) => s.square === sq)!;

    test('64 squares in reading order, a8 first and h1 last, light on a8', () => {
        expect(squares).toHaveLength(64);
        expect(squares[0]).toMatchObject({ square: 'a8', fill: 'light', piece: { color: 'b', type: 'r' } });
        expect(squares[63]).toMatchObject({ square: 'h1', fill: 'light', piece: { color: 'w', type: 'r' } });
    });

    test('the last move (h2-h4) is gold, by square colour', () => {
        expect(at('h2')).toMatchObject({ fill: 'last-dark', piece: null });
        expect(at('h4')).toMatchObject({ fill: 'last-dark', piece: { color: 'w', type: 'p' } });
        expect(squares.filter((s) => s.fill.startsWith('last'))).toHaveLength(2);
    });

    test("the King's Gambit after 4. h4: 31 pieces, f2 empty, black pawns on f4 and g5", () => {
        expect(squares.filter((s) => s.piece)).toHaveLength(31);
        expect(at('f2').piece).toBeNull();
        expect(at('f4').piece).toEqual({ color: 'b', type: 'p' });
        expect(at('g5').piece).toEqual({ color: 'b', type: 'p' });
        expect(at('f3').piece).toEqual({ color: 'w', type: 'n' });
    });
});
