/**
 * domain/clockVerdict.js: what the passing of time decides about an active game (TEST-03).
 * Pure: state in, verdict (or null) out. Rules in precedence order:
 * abandonment → first-move timeout → flag fall.
 */
const { clockVerdict, firstMoveDeadline, FIRST_MOVE_TIMEOUT_MS } = require('../../src/domain/clockVerdict');
const { makeGame } = require('../helpers/fixtures');

const T = 1_000_000;
const MOVE = { move: 'e2e4', fen: 'x', san: 'e4' };
const REPLY = { move: 'e7e5', fen: 'y', san: 'e5' };

/** A game that started at T with no move yet. */
const fresh = (overrides = {}) => makeGame({ startedAt: T, lastMoveAt: null, ...overrides });
/** White has moved at `at`; Black is to move. */
const afterWhiteMoved = (at, overrides = {}) =>
    makeGame({ startedAt: T, lastMoveAt: at, activeSide: 'b', moveLog: [MOVE], ...overrides });
/** Both sides have moved; White to move, clock running since `at`. */
const underway = (at, overrides = {}) =>
    makeGame({ startedAt: T, lastMoveAt: at, activeSide: 'w', moveLog: [MOVE, REPLY], ...overrides });

test('the first-move timeout is 30 seconds', () => expect(FIRST_MOVE_TIMEOUT_MS).toBe(30000));

describe('firstMoveDeadline', () => {
    test('White must move within 30 s of the start', () => expect(firstMoveDeadline(fresh())).toBe(T + 30000));
    test('then Black within 30 s of White\'s move', () => {
        expect(firstMoveDeadline(afterWhiteMoved(T + 4000))).toBe(T + 34000);
    });
    test('none once both sides have moved', () => expect(firstMoveDeadline(underway(T + 9000))).toBeNull());
    test('none for a state that carries no start time (games created before this rule)', () => {
        expect(firstMoveDeadline(makeGame({ lastMoveAt: null }))).toBeNull();
    });
});

describe('first-move timeout [FIRST-MOVE]', () => {
    test('nothing before the deadline', () => {
        expect(clockVerdict(fresh(), T + 29999)).toBeNull();
        expect(clockVerdict(afterWhiteMoved(T + 4000), T + 33999)).toBeNull();
    });

    test('White never moves → aborted, no winner', () => {
        expect(clockVerdict(fresh(), T + 30000)).toEqual({ winner: null, reason: 'Aborted', aborted: true });
    });

    test('Black never makes its first move → aborted, no winner (even with time on the clock)', () => {
        expect(clockVerdict(afterWhiteMoved(T + 4000), T + 34000)).toEqual({ winner: null, reason: 'Aborted', aborted: true });
    });

    test('Black\'s first-move deadline beats a flag fall in the same tick: the game is aborted, not lost', () => {
        const game = afterWhiteMoved(T, { blackClockMs: 10000 });
        expect(clockVerdict(game, T + 31000)).toMatchObject({ aborted: true });
    });

    test('once both sides have moved, slow play is a matter for the clock only', () => {
        expect(clockVerdict(underway(T + 9000), T + 200000)).toBeNull();
    });
});

describe('flag fall', () => {
    test('the side to move loses when its time is up', () => {
        expect(clockVerdict(underway(T, { whiteClockMs: 5000 }), T + 5000)).toEqual({ winner: 'black', reason: 'Time' });
        expect(clockVerdict(underway(T, { whiteClockMs: 5000 }), T + 4999)).toBeNull();
        const blackToMove = underway(T, { activeSide: 'b', blackClockMs: 1000, moveLog: [MOVE, REPLY, MOVE] });
        expect(clockVerdict(blackToMove, T + 1000)).toEqual({ winner: 'white', reason: 'Time' });
    });
});

describe('abandonment', () => {
    const away = (at, side = 'white') => ({ userId: `${side}-user`, side, at });

    test('inside the 20 s grace period nothing ends, whatever the clocks say', () => {
        const game = underway(T - 999999, { whiteClockMs: 1, disconnectInfo: away(T) });
        expect(clockVerdict(game, T + 19999)).toBeNull();
    });

    test('after the grace period the opponent wins', () => {
        expect(clockVerdict(underway(T, { disconnectInfo: away(T) }), T + 20000)).toEqual({ winner: 'black', reason: 'Abandonment' });
        expect(clockVerdict(underway(T, { disconnectInfo: away(T, 'black') }), T + 20000)).toEqual({
            winner: 'white',
            reason: 'Abandonment',
        });
    });

    test('a disconnect also suspends the first-move deadline during the grace period', () => {
        expect(clockVerdict(fresh({ disconnectInfo: away(T + 25000) }), T + 40000)).toBeNull();
    });
});

test('a game that is not active is never judged', () => {
    expect(clockVerdict(fresh({ status: 'completed' }), T + 999999)).toBeNull();
    expect(clockVerdict(null, T)).toBeNull();
});
