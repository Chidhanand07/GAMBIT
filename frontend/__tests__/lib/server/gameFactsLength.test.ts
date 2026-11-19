import { averageGameLength, endings, fastestWin, gameMoves, NOT_RECORDED } from '@/lib/server/gameFacts';

const ME = 'me';
const fenAt = (fullmove: number, turn: 'w' | 'b') => `8/8/8/8/8/8/8/8 ${turn} - - 0 ${fullmove}`;
const g = (over: Record<string, unknown>) => ({ white_id: ME, black_id: 'x', result: null, winner_id: null, ...over });

describe('game length [F-124]', () => {
    test('moves from the final position, the live position for older rows', () => {
        expect(gameMoves({ final_fen: fenAt(18, 'w') })).toBe(17);
        expect(gameMoves({ final_fen: null, fen: fenAt(18, 'b') })).toBe(18);
        expect(gameMoves({})).toBeNull();
    });

    test('average over played games with a readable position; aborted and empty games are left out', () => {
        const games = [
            g({ result: 'white', final_fen: fenAt(21, 'w') }),
            g({ result: 'black', final_fen: fenAt(40, 'b') }),
            g({ status: 'aborted', final_fen: fenAt(90, 'w') }),
            g({ result: 'draw', final_fen: fenAt(1, 'w') }),
            g({ result: 'draw', final_fen: null }),
        ];
        expect(averageGameLength(games, ME)).toBe(30);
        expect(averageGameLength([], ME)).toBeNull();
    });

    test('fastest win counts wins only', () => {
        const games = [
            g({ result: 'white', final_fen: fenAt(30, 'w') }),
            g({ result: 'white', final_fen: fenAt(18, 'b') }),
            g({ result: 'black', final_fen: fenAt(5, 'b') }),
        ];
        expect(fastestWin(games, ME)).toBe(18);
        expect(fastestWin([g({ result: 'black', final_fen: fenAt(5, 'b') })], ME)).toBeNull();
    });
});

describe('endings [F-124]', () => {
    test("the mockup's rows; draws grouped; unknown reasons only as Not recorded; aborted games left out", () => {
        const rows = endings(
            [
                g({ result: 'white', end_reason: 'checkmate' }),
                g({ result: 'black', end_reason: 'resignation' }),
                g({ result: 'draw', end_reason: 'stalemate' }),
                g({ result: 'draw', end_reason: 'fifty_move_rule' }),
                g({ result: 'white', end_reason: 'abandonment' }),
                g({ result: 'white', end_reason: null }),
                g({ status: 'aborted', end_reason: 'aborted' }),
            ],
            ME,
        );
        expect(rows).toEqual([
            { name: 'Checkmate', count: 1 },
            { name: 'Resignation', count: 1 },
            { name: 'On time', count: 0 },
            { name: 'Stalemate or draw', count: 2 },
            { name: 'Abandoned', count: 1 },
            { name: NOT_RECORDED, count: 1 },
        ]);
    });

    test('no Not recorded row when every game has a reason', () => {
        expect(endings([g({ result: 'white', end_reason: 'timeout' })], ME).map((r) => r.name)).not.toContain(NOT_RECORDED);
    });
});
