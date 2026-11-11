const {
    DISCONNECT_GRACE_MS,
    remainingMs,
    clocksAt,
    nextSide,
    clocksAfterMove,
    tickerSnapshot,
    isGraceExpired,
} = require('../../src/domain/clock');

const NOW = 1_000_000;

function state(overrides = {}) {
    return { whiteClockMs: 60000, blackClockMs: 50000, activeSide: 'w', lastMoveAt: NOW - 3000, ...overrides };
}

describe('remainingMs', () => {
    test('subtracts elapsed time', () => expect(remainingMs(1000, 300)).toBe(700));
    test('never goes below zero', () => expect(remainingMs(1000, 5000)).toBe(0));
});

describe('clocksAt', () => {
    test('charges White when White is to move', () => {
        expect(clocksAt(state(), NOW)).toEqual({ whiteMs: 57000, blackMs: 50000 });
    });

    test('charges Black when Black is to move', () => {
        expect(clocksAt(state({ activeSide: 'b' }), NOW)).toEqual({ whiteMs: 60000, blackMs: 47000 });
    });

    test('any side other than "w" charges Black', () => {
        expect(clocksAt(state({ activeSide: 'x' }), NOW)).toEqual({ whiteMs: 60000, blackMs: 47000 });
    });

    test.each([null, undefined, 0])('clock not started (lastMoveAt %p) → unchanged', (lastMoveAt) => {
        expect(clocksAt(state({ lastMoveAt }), NOW)).toEqual({ whiteMs: 60000, blackMs: 50000 });
    });

    test('clamps at zero', () => {
        expect(clocksAt(state({ lastMoveAt: NOW - 70000 }), NOW)).toEqual({ whiteMs: 0, blackMs: 50000 });
    });
});

describe('nextSide', () => {
    test.each([
        ['w', 'b'],
        ['b', 'w'],
        ['x', 'w'],
    ])('%p → %p', (side, next) => expect(nextSide(side)).toBe(next));
});

describe('clocksAfterMove', () => {
    test('charges the mover, adds the increment and passes the turn', () => {
        expect(clocksAfterMove(state({ incrementMs: 2000 }), NOW)).toEqual({
            whiteMs: 59000,
            blackMs: 50000,
            nextSide: 'b',
        });
    });

    test('Black mover gets the increment', () => {
        expect(clocksAfterMove(state({ activeSide: 'b', incrementMs: 1000 }), NOW)).toEqual({
            whiteMs: 60000,
            blackMs: 48000,
            nextSide: 'w',
        });
    });

    test('missing increment counts as 0; first move does not charge time', () => {
        expect(clocksAfterMove(state({ lastMoveAt: null }), NOW)).toEqual({
            whiteMs: 60000,
            blackMs: 50000,
            nextSide: 'b',
        });
    });

    test('increment is added after clamping at zero', () => {
        expect(clocksAfterMove(state({ lastMoveAt: NOW - 99999, incrementMs: 3000 }), NOW).whiteMs).toBe(3000);
    });
});

describe('tickerSnapshot', () => {
    test('White to move', () => {
        expect(tickerSnapshot(state(), NOW)).toEqual({ remainingMs: 57000, whiteMs: 57000, blackMs: 50000 });
    });

    test('Black to move', () => {
        expect(tickerSnapshot(state({ activeSide: 'b' }), NOW)).toEqual({
            remainingMs: 47000,
            whiteMs: 60000,
            blackMs: 47000,
        });
    });

    test('unknown side: remaining comes from Black but neither displayed clock changes', () => {
        expect(tickerSnapshot(state({ activeSide: 'x' }), NOW)).toEqual({
            remainingMs: 47000,
            whiteMs: 60000,
            blackMs: 50000,
        });
    });

    test('flagged clock reports zero', () => {
        expect(tickerSnapshot(state({ lastMoveAt: NOW - 61000 }), NOW).remainingMs).toBe(0);
    });
});

describe('isGraceExpired', () => {
    test('grace period is 20 s', () => expect(DISCONNECT_GRACE_MS).toBe(20000));
    test('19 999 ms → still waiting', () => expect(isGraceExpired({ at: NOW - 19999 }, NOW)).toBe(false));
    test('exactly 20 000 ms → expired', () => expect(isGraceExpired({ at: NOW - 20000 }, NOW)).toBe(true));
    test('missing timestamp never expires', () => expect(isGraceExpired({}, NOW)).toBe(false));
});
