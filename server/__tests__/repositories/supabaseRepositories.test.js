/**
 * server/src/repositories/* (Supabase) — each function issues exactly the
 * query chain its pre-refactor call site built, and hands back the query
 * result untouched.
 */
const { createSupabaseMock } = require('../helpers/mockSupabase');
const { createGamesRepository } = require('../../src/repositories/gamesRepository');
const { createGameInvitesRepository } = require('../../src/repositories/gameInvitesRepository');
const { createMovesRepository } = require('../../src/repositories/movesRepository');
const { createMessagesRepository } = require('../../src/repositories/messagesRepository');
const { createProfilesRepository } = require('../../src/repositories/profilesRepository');
const { createNotificationsRepository } = require('../../src/repositories/notificationsRepository');
const { createGameResultsRepository } = require('../../src/repositories/gameResultsRepository');

let supabase;
beforeEach(() => {
    supabase = createSupabaseMock();
});

/** Run `query`, return [table, ops] of the single recorded call and the resolved value. */
async function run(query) {
    const result = await query;
    expect(supabase.calls).toHaveLength(1);
    return { table: supabase.calls[0].table, ops: supabase.calls[0].ops, result };
}

describe('gamesRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createGamesRepository(supabase);
    });

    test('findForRestore', async () => {
        const { table, ops } = await run(repo.findForRestore('g1'));
        expect(table).toBe('games');
        expect(ops).toEqual([
            // result + winner_id: so a finished game restores with its real outcome (G1).
            [
                'select',
                'id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms, result, winner_id',
            ],
            ['eq', 'id', 'g1'],
            ['maybeSingle'],
        ]);
    });

    test('findByIdWithPlayers keeps the multi-line select verbatim and filters by id (never by token) [INV-TOKEN]', async () => {
        const { table, ops } = await run(repo.findByIdWithPlayers('g1'));
        expect(table).toBe('games');
        expect(ops).toEqual([
            [
                'select',
                '\n                *,\n                white:profiles!white_id(username, avatar_url),\n                black:profiles!black_id(username, avatar_url)\n            ',
            ],
            ['eq', 'id', 'g1'],
            ['maybeSingle'],
        ]);
        expect(repo.findByInviteToken).toBeUndefined();
    });

    test('deleteById', async () => {
        const { table, ops } = await run(repo.deleteById('g1'));
        expect(table).toBe('games');
        expect(ops).toEqual([['delete'], ['eq', 'id', 'g1']]);
    });

    test('insertReturning', async () => {
        const row = { white_id: 'w' };
        const { ops } = await run(repo.insertReturning(row));
        expect(ops).toEqual([['insert', row], ['select'], ['single']]);
    });

    test('updateById / updateIfActive', async () => {
        const fields = { fen: 'F' };
        expect((await run(repo.updateById('g1', fields))).ops).toEqual([
            ['update', fields],
            ['eq', 'id', 'g1'],
        ]);
        supabase.reset();
        expect((await run(repo.updateIfActive('g1', fields))).ops).toEqual([
            ['update', fields],
            ['eq', 'id', 'g1'],
            ['eq', 'status', 'active'],
        ]);
    });

    test('finishIfActive / startIfWaiting', async () => {
        const fields = { status: 'x' };
        expect((await run(repo.finishIfActive('g1', fields))).ops).toEqual([
            ['update', fields],
            ['eq', 'id', 'g1'],
            ['eq', 'status', 'active'],
            ['select', 'id'],
            ['maybeSingle'],
        ]);
        supabase.reset();
        expect((await run(repo.startIfWaiting('g1', fields))).ops).toEqual([
            ['update', fields],
            ['eq', 'id', 'g1'],
            ['eq', 'status', 'waiting'],
            ['select'],
            ['maybeSingle'],
        ]);
    });

    test('returns the query result untouched', async () => {
        const result = { data: { id: 'g1' }, error: null };
        supabase.queue('games', result);
        await expect(repo.findForRestore('g1')).resolves.toBe(result);
    });
});

test('movesRepository.insert / messagesRepository.insert', async () => {
    const row = { a: 1 };
    const moves = await run(createMovesRepository(supabase).insert(row));
    expect([moves.table, moves.ops]).toEqual(['moves', [['insert', row]]]);
    supabase.reset();
    const messages = await run(createMessagesRepository(supabase).insert(row));
    expect([messages.table, messages.ops]).toEqual(['messages', [['insert', row]]]);
});

describe('gameInvitesRepository [INV-TOKEN]', () => {
    let repo;
    beforeEach(() => {
        repo = createGameInvitesRepository(supabase);
    });

    test('insert stores game_id, token and expiry in game_invites', async () => {
        const row = { game_id: 'g1', token: 'tok', expires_at: '2026-01-03T00:00:00.000Z' };
        const { table, ops } = await run(repo.insert(row));
        expect(table).toBe('game_invites');
        expect(ops).toEqual([['insert', row]]);
    });

    test('findByToken selects only game_id and expires_at, by token', async () => {
        const { table, ops } = await run(repo.findByToken('tok'));
        expect(table).toBe('game_invites');
        expect(ops).toEqual([['select', 'game_id, expires_at'], ['eq', 'token', 'tok'], ['maybeSingle']]);
    });
});

describe('profilesRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createProfilesRepository(supabase);
    });

    test.each([
        ['findUsernameByUsername', ['bob'], [['select', 'username'], ['eq', 'username', 'bob'], ['maybeSingle']]],
        [
            'findForMatchmaking',
            ['u1'],
            [
                ['select', 'id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, games_played'],
                ['eq', 'id', 'u1'],
                ['maybeSingle'],
            ],
        ],
        [
            'findRatingsByIds',
            [['w', 'b']],
            [
                [
                    'select',
                    'id, rating_rapid, rating_blitz, rating_bullet, rating_classical, rating_rd, rating_vol, games_played, wins, losses, draws',
                ],
                ['in', 'id', ['w', 'b']],
            ],
        ],
    ])('%s', async (name, args, expected) => {
        const { table, ops } = await run(repo[name](...args));
        expect(table).toBe('profiles');
        expect(ops).toEqual(expected);
    });

    test('has no direct profile write: ratings and stats go through apply_game_result [RATING-ATOMIC]', () => {
        expect(repo.updateById).toBeUndefined();
    });
});

describe('gameResultsRepository [RATING-ATOMIC]', () => {
    test('applyGameResult calls apply_game_result with the p_-prefixed arguments and returns its result', async () => {
        supabase.queue('rpc:apply_game_result', { data: 'applied', error: null });
        const white = { old_rating: 1500, old_rd: 100, old_vol: 0.06, old_games_played: 10, new_rating: 1510, new_rd: 95, new_vol: 0.06 };
        const black = { ...white, new_rating: 1490 };
        const repo = createGameResultsRepository(supabase);

        const { table, ops, result } = await run(
            repo.applyGameResult({ gameId: 'g', whiteId: 'w', blackId: 'b', result: 'white', ratingField: 'rating_rapid', white, black }),
        );

        expect(table).toBe('rpc:apply_game_result');
        expect(ops).toEqual([
            [
                'rpc',
                {
                    p_game_id: 'g',
                    p_white_id: 'w',
                    p_black_id: 'b',
                    p_result: 'white',
                    p_rating_field: 'rating_rapid',
                    p_white: white,
                    p_black: black,
                },
            ],
        ]);
        expect(result).toEqual({ data: 'applied', error: null });
    });
});

describe('notificationsRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createNotificationsRepository(supabase);
    });

    test.each([
        ['insert', [{ type: 't' }], [['insert', { type: 't' }]]],
    ])('%s', async (name, args, expected) => {
        const { table, ops } = await run(repo[name](...args));
        expect(table).toBe('notifications');
        expect(ops).toEqual(expected);
    });
});
