/**
 * Tests for clock utility logic (increment parsing, time formatting).
 */

function parseIncrement(timeControl: string): number {
    const parts = String(timeControl || '0').split('+');
    return (parseInt(parts[1]) || 0) * 1000;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

describe('parseIncrement', () => {
    test('no increment (e.g. "10") returns 0ms', () => expect(parseIncrement('10')).toBe(0));
    test('"5+3" returns 3000ms', () => expect(parseIncrement('5+3')).toBe(3000));
    test('"3+2" returns 2000ms', () => expect(parseIncrement('3+2')).toBe(2000));
    test('"1+0" returns 0ms', () => expect(parseIncrement('1+0')).toBe(0));
    test('empty string returns 0ms', () => expect(parseIncrement('')).toBe(0));
    test('"0+30" returns 30000ms', () => expect(parseIncrement('0+30')).toBe(30000));
    test('large increment "10+60" returns 60000ms', () => expect(parseIncrement('10+60')).toBe(60000));
});

describe('formatTime', () => {
    test('600 seconds = 10:00', () => expect(formatTime(600)).toBe('10:00'));
    test('65 seconds = 01:05', () => expect(formatTime(65)).toBe('01:05'));
    test('0 seconds = 00:00', () => expect(formatTime(0)).toBe('00:00'));
    test('59 seconds = 00:59', () => expect(formatTime(59)).toBe('00:59'));
    test('3600 seconds = 60:00', () => expect(formatTime(3600)).toBe('60:00'));
});

describe('clock deduction logic', () => {
    function applyMove(
        clock: { whiteMs: number; blackMs: number; turn: 'w' | 'b'; incrementMs: number },
        elapsedMs: number,
    ) {
        const movedColor = clock.turn;
        if (movedColor === 'w') {
            clock.whiteMs = Math.max(0, clock.whiteMs - elapsedMs) + clock.incrementMs;
        } else {
            clock.blackMs = Math.max(0, clock.blackMs - elapsedMs) + clock.incrementMs;
        }
        clock.turn = movedColor === 'w' ? 'b' : 'w';
        return clock;
    }

    test('white move deducts from white and adds increment', () => {
        const clock = { whiteMs: 180000, blackMs: 180000, turn: 'w' as const, incrementMs: 3000 };
        applyMove(clock, 5000);
        expect(clock.whiteMs).toBe(178000); // 180000 - 5000 + 3000
        expect(clock.blackMs).toBe(180000); // unchanged
        expect(clock.turn).toBe('b');
    });

    test('black move deducts from black and adds increment', () => {
        const clock = { whiteMs: 180000, blackMs: 180000, turn: 'b' as const, incrementMs: 2000 };
        applyMove(clock, 10000);
        expect(clock.blackMs).toBe(172000); // 180000 - 10000 + 2000
        expect(clock.whiteMs).toBe(180000); // unchanged
        expect(clock.turn).toBe('w');
    });

    test('clock floors at 0 even without increment', () => {
        const clock = { whiteMs: 1000, blackMs: 30000, turn: 'w' as const, incrementMs: 0 };
        applyMove(clock, 5000); // spent more than remaining
        expect(clock.whiteMs).toBe(0);
    });

    test('increment is still added after flagging (pre-increment)', () => {
        const clock = { whiteMs: 500, blackMs: 30000, turn: 'w' as const, incrementMs: 3000 };
        applyMove(clock, 5000); // white overspends by 4.5s
        expect(clock.whiteMs).toBe(3000); // floor(0) + 3000
    });
});
