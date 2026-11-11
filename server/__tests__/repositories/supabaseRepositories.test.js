/**
 * server/src/repositories/* (Supabase) — each function issues exactly the
 * query chain its pre-refactor call site built, and hands back the query
 * result untouched.
 */
const { createSupabaseMock } = require('../helpers/mockSupabase');
const { createGamesRepository } = require('../../src/repositories/gamesRepository');
const { createMovesRepository } = require('../../src/repositories/movesRepository');
const { createMessagesRepository } = require('../../src/repositories/messagesRepository');
const { createProfilesRepository } = require('../../src/repositories/profilesRepository');
const { createFriendshipsRepository } = require('../../src/repositories/friendshipsRepository');
const { createNotificationsRepository } = require('../../src/repositories/notificationsRepository');

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
            ['select', 'id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms'],
            ['eq', 'id', 'g1'],
            ['maybeSingle'],
        ]);
    });

    test('findByInviteToken keeps the multi-line select verbatim', async () => {
        const { ops } = await run(repo.findByInviteToken('tok'));
        expect(ops).toEqual([
            [
                'select',
                '\n                *,\n                white:profiles!white_id(username, avatar_url),\n                black:profiles!black_id(username, avatar_url)\n            ',
            ],
            ['eq', 'invite_token', 'tok'],
            ['maybeSingle'],
        ]);
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

describe('profilesRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createProfilesRepository(supabase);
    });

    test.each([
        ['findUsernameByUsername', ['bob'], [['select', 'username'], ['eq', 'username', 'bob'], ['single']]],
        ['findIdByUsername', ['bob'], [['select', 'id'], ['eq', 'username', 'bob'], ['single']]],
        ['findUsernameById', ['u1'], [['select', 'username'], ['eq', 'id', 'u1'], ['maybeSingle']]],
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
        ['insert', [[{ id: 'u1' }]], [['insert', [{ id: 'u1' }]]]],
        [
            'updateById',
            ['u1', { bio: 'x' }],
            [
                ['update', { bio: 'x' }],
                ['eq', 'id', 'u1'],
            ],
        ],
    ])('%s', async (name, args, expected) => {
        const { table, ops } = await run(repo[name](...args));
        expect(table).toBe('profiles');
        expect(ops).toEqual(expected);
    });
});

describe('friendshipsRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createFriendshipsRepository(supabase);
    });

    test.each([
        [
            'findBetween',
            ['me', 'them'],
            [
                ['select', 'status, requester_id'],
                ['or', 'and(requester_id.eq.me,addressee_id.eq.them),and(requester_id.eq.them,addressee_id.eq.me)'],
                ['maybeSingle'],
            ],
        ],
        ['insertRequest', ['me', 'them'], [['insert', { requester_id: 'me', addressee_id: 'them' }]]],
        [
            'listAccepted',
            ['me'],
            [
                [
                    'select',
                    'id, requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(username,avatar_url,rating_rapid), addressee:profiles!friendships_addressee_id_fkey(username,avatar_url,rating_rapid)',
                ],
                ['or', 'requester_id.eq.me,addressee_id.eq.me'],
                ['eq', 'status', 'accepted'],
            ],
        ],
        [
            'listPendingFor',
            ['me'],
            [
                [
                    'select',
                    'id, created_at, requester:profiles!friendships_requester_id_fkey(id,username,display_name,avatar_url,rating_rapid)',
                ],
                ['eq', 'addressee_id', 'me'],
                ['eq', 'status', 'pending'],
                ['order', 'created_at', { ascending: false }],
            ],
        ],
        [
            'setStatusAsAddressee',
            ['f1', 'me', 'declined'],
            [
                ['update', { status: 'declined' }],
                ['eq', 'id', 'f1'],
                ['eq', 'addressee_id', 'me'],
            ],
        ],
        [
            'deleteInvolving',
            ['f1', 'me'],
            [['delete'], ['eq', 'id', 'f1'], ['or', 'requester_id.eq.me,addressee_id.eq.me']],
        ],
    ])('%s', async (name, args, expected) => {
        const { table, ops } = await run(repo[name](...args));
        expect(table).toBe('friendships');
        expect(ops).toEqual(expected);
    });
});

describe('notificationsRepository', () => {
    let repo;
    beforeEach(() => {
        repo = createNotificationsRepository(supabase);
    });

    test.each([
        ['insert', [{ type: 't' }], [['insert', { type: 't' }]]],
        [
            'listRecent',
            ['me'],
            [
                ['select', '*'],
                ['eq', 'user_id', 'me'],
                ['order', 'created_at', { ascending: false }],
                ['limit', 30],
            ],
        ],
        [
            'markAllRead',
            ['me'],
            [
                ['update', { read: true }],
                ['eq', 'user_id', 'me'],
                ['eq', 'read', false],
            ],
        ],
        [
            'markRead',
            ['n1', 'me'],
            [
                ['update', { read: true }],
                ['eq', 'id', 'n1'],
                ['eq', 'user_id', 'me'],
            ],
        ],
    ])('%s', async (name, args, expected) => {
        const { table, ops } = await run(repo[name](...args));
        expect(table).toBe('notifications');
        expect(ops).toEqual(expected);
    });
});
