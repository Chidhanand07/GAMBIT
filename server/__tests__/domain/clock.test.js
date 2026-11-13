const {
    DISCONNECT_GRACE_MS,
    remainingMs,
    clocksAt,
    nextSide,
    clocksAfterMove,
    isClockRunning,
    freezeClocks,
    resumeClocks,
    activeRemainingMs,
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

describe('isClockRunning', () => {
    test('running once a move has been made and nobody is disconnected', () => {
        expect(isClockRunning(state())).toBe(true);
    });
    test.each([null, undefined])('not started (lastMoveAt %p) → not running', (lastMoveAt) => {
        expect(isClockRunning(state({ lastMoveAt }))).toBe(false);
    });
    test('frozen while a player is disconnected', () => {
        expect(isClockRunning(state({ disconnectInfo: { userId: 'u', side: 'white', at: NOW } }))).toBe(false);
    });
});

describe('clocksAt while frozen', () => {
    test('a disconnected game reports the stored clocks, whatever the time [G9]', () => {
        const frozen = state({ disconnectInfo: { userId: 'u', side: 'white', at: NOW } });
        expect(clocksAt(frozen, NOW + 15000)).toEqual({ whiteMs: 60000, blackMs: 50000 });
    });
});

describe('activeRemainingMs (the side to move)', () => {
    test('White to move', () => expect(activeRemainingMs(state(), NOW)).toBe(57000));
    test('Black to move', () => expect(activeRemainingMs(state({ activeSide: 'b' }), NOW)).toBe(47000));
    test('flagged clock reports zero', () => {
        expect(activeRemainingMs(state({ lastMoveAt: NOW - 61000 }), NOW)).toBe(0);
    });
    test('a clock that has not started has all its time', () => {
        expect(activeRemainingMs(state({ lastMoveAt: null }), NOW)).toBe(60000);
    });
});

describe('freezeClocks / resumeClocks: a disconnect never costs or gives time twice [G8, G9]', () => {
    const info = { userId: 'u', side: 'white', at: NOW };

    test('freezing charges the time used so far, once, and restarts the reference point', () => {
        expect(freezeClocks(state(), NOW)).toEqual({ whiteClockMs: 57000, blackClockMs: 50000, lastMoveAt: NOW });
    });

    test('no double deduction: during the disconnect the clocks do not move [G9]', () => {
        const frozen = { ...state(), ...freezeClocks(state(), NOW), disconnectInfo: info };
        // The old ticker subtracted (now - lastMoveAt) again from the already charged clock.
        expect(clocksAt(frozen, NOW + 10000)).toEqual({ whiteMs: 57000, blackMs: 50000 });
        expect(activeRemainingMs(frozen, NOW + 10000)).toBe(57000);
    });

    test('after a 10 s absence only the time played counts', () => {
        const frozen = { ...state(), ...freezeClocks(state(), NOW), disconnectInfo: info };
        const resumed = { ...frozen, ...resumeClocks(frozen, NOW + 10000), disconnectInfo: null };
        expect(resumed.lastMoveAt).toBe(NOW + 10000);
        // 3 s before the disconnect + 2 s after the return = 5 s; the 10 s away are not charged.
        expect(clocksAt(resumed, NOW + 12000)).toEqual({ whiteMs: 55000, blackMs: 50000 });
    });

    test('before the first move nothing is charged and the clock stays stopped [G8]', () => {
        const fresh = state({ lastMoveAt: null });
        expect(freezeClocks(fresh, NOW)).toEqual({ whiteClockMs: 60000, blackClockMs: 50000, lastMoveAt: null });
        const frozen = { ...fresh, ...freezeClocks(fresh, NOW), disconnectInfo: info };
        // Reconnecting must not start White's clock: no move has been made.
        expect(resumeClocks(frozen, NOW + 5000)).toEqual({ lastMoveAt: null });
        const resumed = { ...frozen, ...resumeClocks(frozen, NOW + 5000), disconnectInfo: null };
        expect(isClockRunning(resumed)).toBe(false);
        expect(clocksAt(resumed, NOW + 60000)).toEqual({ whiteMs: 60000, blackMs: 50000 });
    });
});

describe('isGraceExpired', () => {
    test('grace period is 20 s', () => expect(DISCONNECT_GRACE_MS).toBe(20000));
    test('19 999 ms → still waiting', () => expect(isGraceExpired({ at: NOW - 19999 }, NOW)).toBe(false));
    test('exactly 20 000 ms → expired', () => expect(isGraceExpired({ at: NOW - 20000 }, NOW)).toBe(true));
    test('missing timestamp never expires', () => expect(isGraceExpired({}, NOW)).toBe(false));
});
