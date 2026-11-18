import { Chess } from 'chess.js';
import { movesPlayed } from '@/lib/chess/fen';

describe('movesPlayed [F-124]', () => {
    test.each([
        [[], 0],
        [['e4'], 1],
        [['e4', 'e5'], 1],
        [['e4', 'e5', 'Nf3'], 2],
        [['f3', 'e5', 'g4', 'Qh4'], 2],
    ])('%p → %p moves', (sans, n) => {
        const board = new Chess();
        for (const san of sans) board.move(san);
        expect(movesPlayed(board.fen())).toBe(n);
    });

    test.each([null, undefined, '', 'not a fen', '8/8/8/8/8/8/8/8 x - - 0 1', '8/8/8/8/8/8/8/8 w - - 0 0', '8/8/8/8/8/8/8/8 w - - 0 x'])(
        '%p → null',
        (fen) => {
            expect(movesPlayed(fen)).toBeNull();
        },
    );
});
