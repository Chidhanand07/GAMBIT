import type { SupabaseClient } from '@supabase/supabase-js';
import { openingsOfGames, openingStats, OTHER_OPENING } from '@/lib/server/openings';
import { createSupabaseMock } from '../../helpers/supabaseMock';

const ME = 'me';
const line = (gameId: string, sans: string) =>
    sans.split(' ').map((san, i) => ({ game_id: gameId, move_number: i + 1, san }));

describe('openingsOfGames [F-123]', () => {
    test('reads the first 11 plies of the games and names each opening', async () => {
        const db = createSupabaseMock();
        db.queue('moves', { data: [...line('g1', 'e4 e5 f4 exf4'), ...line('g2', 'a3 e5')], error: null });
        const openings = await openingsOfGames(db as unknown as SupabaseClient, ['g1', 'g2', 'g3']);
        expect(openings?.get('g1')).toEqual({ eco: 'C33', family: "King's Gambit", name: "King's Gambit Accepted" });
        expect(openings?.get('g2')).toBeNull(); // moves outside the table
        expect(openings?.has('g3')).toBe(false); // no stored moves
        const call = db.callsFor('moves')[0];
        expect(call.ops).toEqual(
            expect.arrayContaining([
                ['select', 'game_id, move_number, san'],
                ['in', 'game_id', ['g1', 'g2', 'g3']],
                ['lte', 'move_number', 11],
            ]),
        );
    });

    test('rows may arrive in any order; a missing ply ends the readable opening', async () => {
        const db = createSupabaseMock();
        const rows = line('g1', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6').reverse();
        db.queue('moves', { data: [...rows, ...line('g2', 'e4 e5 Nf3').filter((r) => r.move_number !== 2)], error: null });
        const openings = await openingsOfGames(db as unknown as SupabaseClient, ['g1', 'g2']);
        expect(openings?.get('g1')?.name).toBe('Sicilian Defense: Najdorf Variation');
        expect(openings?.get('g2')?.name).toBe("King's Pawn Opening");
    });

    test('many games are read in chunks that stay under 1000 rows per request', async () => {
        const db = createSupabaseMock();
        const ids = Array.from({ length: 100 }, (_, i) => `g${i}`);
        await openingsOfGames(db as unknown as SupabaseClient, ids);
        const sizes = db.callsFor('moves').map((c) => (db.op(c, 'in')![1] as string[]).length);
        expect(sizes).toEqual([90, 10]);
    });

    test('a failed read gives null (no partial table)', async () => {
        const db = createSupabaseMock();
        db.queue('moves', { data: null, error: { message: 'down' } });
        expect(await openingsOfGames(db as unknown as SupabaseClient, ['g1'])).toBeNull();
    });
});

describe('openingStats [F-123]', () => {
    const game = (id: string, result: string, accuracy: number | null = null) => ({
        id,
        white_id: ME,
        black_id: 'opp',
        result,
        winner_id: null,
        white_accuracy: accuracy,
    });
    const op = (family: string) => ({ eco: 'X00', family, name: family });

    test('games, win rate and mean analysed accuracy per family, most played first', () => {
        const openings = new Map([
            ['a', op('Ruy Lopez')],
            ['b', op("King's Gambit")],
            ['c', op("King's Gambit")],
            ['d', null],
            ['e', op('Ruy Lopez')],
        ]);
        const games = [
            game('a', 'white', 80),
            game('b', 'white', 70),
            game('c', 'black', 91),
            game('d', 'draw'),
            game('e', 'black'),
            game('f', 'white'), // no moves: not counted
            { ...game('a2', 'aborted'), status: 'aborted' },
        ];
        expect(openingStats(games, new Map([...openings, ['a2', op('Ruy Lopez')]]), ME)).toEqual([
            { name: "King's Gambit", games: 2, winRate: 50, accuracy: 81 },
            { name: 'Ruy Lopez', games: 2, winRate: 50, accuracy: 80 },
            { name: OTHER_OPENING, games: 1, winRate: 0, accuracy: null },
        ]);
    });

    test('at most five rows: past four openings, the rest is counted in Other, which comes last', () => {
        const families = ['A', 'B', 'C', 'D', 'E', 'F'];
        const openings = new Map<string, ReturnType<typeof op> | null>();
        const games = [];
        families.forEach((f, i) => {
            for (let n = 0; n <= families.length - i; n++) {
                openings.set(`${f}${n}`, op(f));
                games.push(game(`${f}${n}`, 'white'));
            }
        });
        openings.set('x', null);
        games.push(game('x', 'black'));
        const rows = openingStats(games, openings, ME);
        expect(rows.map((r) => [r.name, r.games])).toEqual([
            ['A', 7],
            ['B', 6],
            ['C', 5],
            ['D', 4],
            [OTHER_OPENING, 3 + 2 + 1],
        ]);
    });

    test('five openings and nothing else fit without an Other row', () => {
        const openings = new Map(['A', 'B', 'C', 'D', 'E'].map((f) => [f, op(f)]));
        const rows = openingStats(['A', 'B', 'C', 'D', 'E'].map((f) => game(f, 'white')), openings, ME);
        expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });
});
