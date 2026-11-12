/**
 * src/domain/adjudication.js — the server decides when a game is over [S3]
 * (NODE-16, TEST-03). Pure: a chess.js position in, a verdict out.
 */
const { Chess } = require('chess.js');
const { adjudicate, REASON } = require('../../src/domain/adjudication');

const at = (fen) => new Chess(fen);

/** Play SAN moves from the start position and return the board (history kept). */
function played(...sans) {
    const chess = new Chess();
    for (const san of sans) chess.move(san);
    return chess;
}

describe('play continues', () => {
    test.each([
        ['the start position', new Chess()],
        ['a normal middlegame', played('e4', 'e5', 'Nf3', 'Nc6')],
        ['a check that can be answered', at('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1')],
        ['king and pawn vs king (mating material exists)', at('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')],
        ['a position seen only twice', played('Nf3', 'Nf6', 'Ng1', 'Ng8')],
        ['halfmove clock at 99', at('4k3/8/8/8/8/8/4R3/4K3 w - - 99 80')],
    ])('%s → null', (_name, position) => {
        expect(adjudicate(position)).toBeNull();
    });
});

describe('checkmate: the side that delivered it wins', () => {
    test('fool’s mate → black wins', () => {
        expect(adjudicate(played('f3', 'e5', 'g4', 'Qh4#'))).toEqual({ winner: 'black', reason: 'Checkmate' });
    });

    test('scholar’s mate → white wins', () => {
        expect(adjudicate(played('e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'))).toEqual({
            winner: 'white',
            reason: 'Checkmate',
        });
    });

    test('back-rank mate from a bare FEN', () => {
        expect(adjudicate(at('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'))).toEqual({ winner: 'white', reason: 'Checkmate' });
    });
});

describe('draws', () => {
    test('stalemate', () => {
        // Black to move, not in check, no legal move.
        expect(adjudicate(at('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ winner: null, reason: 'Stalemate' });
    });

    test.each([
        ['king vs king', '4k3/8/8/8/8/8/8/4K3 w - - 0 1'],
        ['king and bishop vs king', '4k3/8/8/8/8/8/8/4KB2 w - - 0 1'],
        ['king and knight vs king', '4k3/8/8/8/8/8/8/4KN2 w - - 0 1'],
        ['same-coloured bishops only', '4k3/8/8/8/8/3b4/8/4KB2 w - - 0 1'],
    ])('insufficient material: %s', (_name, fen) => {
        expect(adjudicate(at(fen))).toEqual({ winner: null, reason: 'Insufficient material' });
    });

    test('threefold repetition (needs the move history, not just a FEN)', () => {
        const position = played('Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
        expect(adjudicate(position)).toEqual({ winner: null, reason: 'Threefold repetition' });
        // The same final position loaded from its FEN alone has no history to repeat.
        expect(adjudicate(at(position.fen()))).toBeNull();
    });

    test('fifty-move rule: halfmove clock reaches 100', () => {
        expect(adjudicate(at('4k3/8/8/8/8/8/4R3/4K3 w - - 100 80'))).toEqual({
            winner: null,
            reason: 'Fifty-move rule',
        });
    });
});

describe('precedence', () => {
    test('checkmate on the move that also hits the fifty-move count is a win, not a draw', () => {
        const mate = at('R5k1/5ppp/8/8/8/8/8/6K1 b - - 100 80');
        expect(adjudicate(mate)).toEqual({ winner: 'white', reason: 'Checkmate' });
    });

    test('stalemate is reported as stalemate even with bare material', () => {
        // King vs king + pawn-blocked stalemate: the stalemate rule comes first.
        expect(adjudicate(at('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason).toBe('Stalemate');
    });
});

test('the reason strings are the ones shown to players', () => {
    expect(REASON).toEqual({
        CHECKMATE: 'Checkmate',
        STALEMATE: 'Stalemate',
        INSUFFICIENT_MATERIAL: 'Insufficient material',
        THREEFOLD_REPETITION: 'Threefold repetition',
        FIFTY_MOVE_RULE: 'Fifty-move rule',
        RESIGNATION: 'Resignation',
        // Decided by the clock, finalized through the same path [G3].
        TIME: 'Time',
        ABANDONMENT: 'Abandonment',
    });
});
