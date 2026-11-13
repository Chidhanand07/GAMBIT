/**
 * src/domain/gameDto.js — what a game looks like to a browser [S8] (NX-04).
 */
const { toPublicGame } = require('../../src/domain/gameDto');

const row = {
    id: 'pg-1',
    white_id: 'alice',
    black_id: null,
    time_control: '5+2',
    increment: 2,
    status: 'waiting',
    is_rated: true,
    started_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    white: { username: 'alice', avatar_url: null, email: 'a@b.c', rating_vol: 0.06 },
    black: null,
    invite_token: 'tok1234567',
    invite_expires_at: '2026-01-03T00:00:00.000Z',
    fen: null,
    some_future_internal_column: 'x',
};

test('keeps what the join page and the game_start listeners read', () => {
    expect(toPublicGame(row)).toEqual({
        id: 'pg-1',
        white_id: 'alice',
        black_id: null,
        time_control: '5+2',
        increment: 2,
        status: 'waiting',
        is_rated: true,
        started_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        white: { username: 'alice', avatar_url: null },
        black: null,
    });
});

test.each(['invite_token', 'invite_expires_at', 'some_future_internal_column'])('never includes %s', (key) => {
    expect(toPublicGame(row)).not.toHaveProperty(key);
    expect(JSON.stringify(toPublicGame(row))).not.toContain('tok1234567');
});

test('columns the row does not have are simply absent; embedded players only when present', () => {
    expect(toPublicGame({ id: 'g', status: 'active' })).toEqual({ id: 'g', status: 'active' });
});

test('null / undefined pass through (callers decide what "no game" means)', () => {
    expect(toPublicGame(null)).toBeNull();
    expect(toPublicGame(undefined)).toBeUndefined();
});
