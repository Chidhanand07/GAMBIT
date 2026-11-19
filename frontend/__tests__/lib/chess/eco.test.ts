import { Chess } from 'chess.js';
import { classifyOpening, MAX_BOOK_PLIES, normalizeSan } from '@/lib/chess/eco';
import { OPENINGS } from '@/lib/chess/openings.data';

const moves = (line: string) => line.split(' ');

describe('openings table [F-123]', () => {
    test.each(OPENINGS.map((row) => [row[2], row[3]]))('%s is a legal line written as chess.js writes it', (_name, line) => {
        const board = new Chess();
        for (const san of moves(line)) expect(normalizeSan(board.move(san).san)).toBe(san);
    });

    test('ECO codes have the A00–E99 form and every line is unique', () => {
        for (const [eco] of OPENINGS) expect(eco).toMatch(/^[A-E]\d{2}$/);
        const lines = OPENINGS.map((row) => row[3]);
        expect(new Set(lines).size).toBe(lines.length);
    });
});

describe('classifyOpening [F-123]', () => {
    test.each([
        ['e4 e5 f4 exf4 Nf3 g5', 'C33', "King's Gambit", "King's Gambit Accepted"],
        ['e4 e5 f4 d6', 'C30', "King's Gambit", "King's Gambit"],
        ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5', 'B90', 'Sicilian Defense', 'Sicilian Defense: Najdorf Variation'],
        ['e4 c5 Nf3 e6', 'B20', 'Sicilian Defense', 'Sicilian Defense'],
        ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1', 'C84', 'Ruy Lopez', 'Ruy Lopez: Closed'],
        ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', 'C53', 'Italian Game', 'Italian Game: Giuoco Piano'],
        ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7', 'C57', 'Italian Game', 'Italian Game: Fried Liver Attack'],
        ['d4 d5 c4 e6 Nc3 Nf6', 'D30', "Queen's Gambit Declined", "Queen's Gambit Declined"],
        ['d4 Nf6 c4 e6 Nc3 Bb4 e3', 'E20', 'Nimzo-Indian Defense', 'Nimzo-Indian Defense'],
        ['d4 Nf6 c4 g6 Nc3 d5 cxd5', 'D80', 'Grünfeld Defense', 'Grünfeld Defense'],
        ['e4 c6 d4 d5 e5 Bf5', 'B12', 'Caro-Kann Defense', 'Caro-Kann Defense: Advance Variation'],
        ['c4 e5 Nc3', 'A20', 'English Opening', 'English Opening: Reversed Sicilian'],
        ['Nf3 d5 g3 Nf6', 'A07', "King's Indian Attack", "King's Indian Attack"],
    ])('%s → %s %s', (line, eco, family, name) => {
        expect(classifyOpening(moves(line))).toEqual({ eco, family, name });
    });

    test('check and annotation marks are ignored', () => {
        expect(classifyOpening(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])?.name).toBe(
            "King's Pawn Game: Wayward Queen Attack",
        );
        expect(normalizeSan('Bb5+')).toBe('Bb5');
        expect(normalizeSan('Qxf7#')).toBe('Qxf7');
        expect(normalizeSan('e4!?')).toBe('e4');
    });

    test('no moves, or a first move outside the table, is unclassified', () => {
        expect(classifyOpening([])).toBeNull();
        expect(classifyOpening(['a3', 'e5'])).toBeNull();
    });

    test('only the first MAX_BOOK_PLIES plies are needed', () => {
        expect(MAX_BOOK_PLIES).toBe(11);
    });
});
