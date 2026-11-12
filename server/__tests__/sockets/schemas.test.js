/**
 * src/sockets/schemas.js — one zod schema per client → server event [S15] (NODE-08).
 */
const { schemas } = require('../../src/sockets/schemas');

const ok = (event, payload) => schemas[event].safeParse(payload).success;

test('there is a schema for every client → server event (and none for `authenticate`)', () => {
    expect(Object.keys(schemas).sort()).toEqual(
        [
            'join_queue',
            'leave_queue',
            'join_game',
            'spectate_game',
            'make_move',
            'resign',
            'send_message',
            'rematch_request',
            'rematch_accept',
            'rematch_decline',
            'challenge_request',
            'challenge_accept',
            'challenge_decline',
        ].sort(),
    );
});

test.each(Object.keys(schemas).filter((e) => e !== 'leave_queue'))('%s rejects null, undefined and arrays', (event) => {
    expect(ok(event, null)).toBe(false);
    expect(ok(event, undefined)).toBe(false);
    expect(ok(event, [])).toBe(false);
});

describe('ids', () => {
    test('accept UUIDs and short slugs', () => {
        expect(ok('join_game', '2f1c0b9e-8a53-4f0e-9c5b-0d3c1c1f7a10')).toBe(true);
        expect(ok('join_game', 'game-1')).toBe(true);
    });

    test.each([[''], ['a'.repeat(65)], ['a,b'], ['x.or(1)'], [42], [{ id: 'g' }]])('reject %p', (value) => {
        expect(ok('join_game', value)).toBe(false);
    });
});

describe('make_move', () => {
    const move = { game_id: 'g1', from: 'e2', to: 'e4' };

    test('accepts a plain move and a promotion', () => {
        expect(ok('make_move', move)).toBe(true);
        expect(ok('make_move', { ...move, from: 'e7', to: 'e8', promotion: 'q' })).toBe(true);
    });

    test.each([
        ['missing game_id', { from: 'e2', to: 'e4' }],
        ['square off the board', { ...move, to: 'e9' }],
        ['square not a string', { ...move, from: 12 }],
        ['unknown promotion piece', { ...move, promotion: 'k' }],
        ['no from/to (the old `move`-only shape)', { game_id: 'g1', move: 'e2e4' }],
    ])('rejects: %s', (_name, payload) => {
        expect(ok('make_move', payload)).toBe(false);
    });

    test('client-computed fields never reach the service: fen, san, move and captured are stripped [S1]', () => {
        const parsed = schemas.make_move.parse({ ...move, fen: 'client-fen', san: 'Qxf7#', move: 'd1f7', captured: true });
        expect(parsed).toEqual(move);
    });
});

describe('resign (there is no game_end schema: clients cannot report results) [S3]', () => {
    test('needs only the game id; a claimed result is stripped', () => {
        expect(schemas.game_end).toBeUndefined();
        expect(schemas.resign.parse({ game_id: 'g1', result: 'White wins', winner_id: 'me' })).toEqual({ game_id: 'g1' });
        expect(ok('resign', {})).toBe(false);
    });
});

describe('send_message', () => {
    test('bounds the text', () => {
        expect(ok('send_message', { game_id: 'g1', text: 'hi' })).toBe(true);
        expect(ok('send_message', { game_id: 'g1', text: 'x'.repeat(501) })).toBe(false);
    });
});

describe('join_queue', () => {
    test('accepts the lobby payloads and bounds the time control', () => {
        expect(ok('join_queue', { user: { id: 'u1' }, time_control: '5+3', increment: 3, is_rated: true })).toBe(true);
        expect(ok('join_queue', { user: { id: 'u1' }, time_control: 10, increment: 0 })).toBe(true);
        expect(ok('join_queue', { time_control: '10' })).toBe(true);
        expect(ok('join_queue', { user: { id: 'u1' }, time_control: 'x'.repeat(17) })).toBe(false);
        expect(ok('join_queue', {})).toBe(true); // no time control → the server's default
        expect(ok('join_queue', { user: { id: 'u1' }, time_control: '10', is_rated: 'yes' })).toBe(false);
    });
});

describe('the acting user is never read from a payload [S2]', () => {
    test.each([
        ['join_queue', { user: { id: 'victim' }, time_control: '10' }, 'user'],
        ['rematch_request', { from_user_id: 'victim', to_user_id: 'u2' }, 'from_user_id'],
        ['challenge_request', { from_user_id: 'victim', to_user_id: 'u2' }, 'from_user_id'],
        ['rematch_accept', { from_user_id: 'u2', to_user_id: 'victim' }, 'to_user_id'],
        ['challenge_accept', { from_user_id: 'u2', to_user_id: 'victim' }, 'to_user_id'],
        ['rematch_decline', { from_user_id: 'u2', to_user_id: 'victim' }, 'to_user_id'],
        ['challenge_decline', { from_user_id: 'u2', to_user_id: 'victim' }, 'to_user_id'],
        // Terms in an accept are never read: the stored request decides them [S4].
        ['rematch_accept', { from_user_id: 'u2', time_control: '1' }, 'time_control'],
        ['challenge_accept', { from_user_id: 'u2', is_rated: true }, 'is_rated'],
        ['challenge_accept', { from_user_id: 'u2', color: 'white' }, 'color'],
    ])('%s strips %j → no `%s`', (event, payload, key) => {
        expect(schemas[event].parse(payload)).not.toHaveProperty(key);
    });
});

describe('challenge / rematch', () => {
    test('colour is one of white, black, random', () => {
        const base = { from_user_id: 'u1', to_user_id: 'u2', time_control: '10', is_rated: true };
        expect(ok('challenge_request', { ...base, color: 'random' })).toBe(true);
        expect(ok('challenge_request', { ...base, color: 'purple' })).toBe(false);
        expect(ok('rematch_request', base)).toBe(true);
        expect(ok('rematch_request', { ...base, to_user_id: null })).toBe(false);
    });
});

describe('time-control ranges (shared model) [TIME-CONTROL]', () => {
    const { limits } = require('../../src/domain/timeControl.data.json');
    const EVENTS = [
        ['join_queue', {}],
        ['rematch_request', { to_user_id: 'u2' }],
        ['challenge_request', { to_user_id: 'u2' }],
    ];
    const BAD = ['0', '-5', 'rapid', '1.5', '10+', '+3', ' 10', `${limits.maxMinutes + 1}`, `10+${limits.maxIncrementSeconds + 1}`, 0, -1, 2.5];
    const GOOD = ['1', '10', '5+3', '1440', `10+${limits.maxIncrementSeconds}`, 10];

    describe.each(EVENTS)('%s', (event, base) => {
        test.each(BAD)('rejects time_control %p', (value) => {
            expect(ok(event, { ...base, time_control: value })).toBe(false);
        });
        test.each(GOOD)('accepts time_control %p', (value) => {
            expect(ok(event, { ...base, time_control: value })).toBe(true);
        });
    });

    test('join_queue: the separate increment is range-checked together with the time control', () => {
        expect(ok('join_queue', { time_control: '10', increment: limits.maxIncrementSeconds })).toBe(true);
        expect(ok('join_queue', { time_control: '10', increment: limits.maxIncrementSeconds + 1 })).toBe(false);
        expect(ok('join_queue', { time_control: '10', increment: 1.5 })).toBe(false);
        expect(ok('join_queue', { time_control: '10', increment: -1 })).toBe(false);
    });
});
