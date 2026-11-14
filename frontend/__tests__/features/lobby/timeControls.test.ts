import {
    BASE_TIME_CONTROLS,
    PRIVATE_TIME_CONTROL_IDS,
    customTimeControl,
    playOnlineTimeControl,
    privateTimeControl,
    selectionMinutes,
} from '@/features/lobby/timeControls';

describe('selectionMinutes (used by the reconnect re-queue)', () => {
    test.each([
        ['bullet', { mins: 1, inc: 0 }],
        ['blitz', { mins: 3, inc: 0 }],
        ['rapid', { mins: 10, inc: 0 }],
        ['classical', { mins: 30, inc: 0 }],
        ['daily', { mins: 1440, inc: 0 }],
        ['unknown', { mins: 10, inc: 0 }],
    ])('%s → %j', (id, expected) => {
        expect(selectionMinutes(id, 12, 5)).toEqual(expected);
    });

    test('custom uses the sliders, including the increment', () => {
        expect(selectionMinutes('custom', 12, 5)).toEqual({ mins: 12, inc: 5 });
    });
});

describe('playOnlineTimeControl (Play Online button)', () => {
    test('presets send the canonical "<min>+<inc>" of the shared definition [TIME-CONTROL]', () => {
        expect(playOnlineTimeControl('blitz', 12, 5)).toBe('3+0');
        expect(playOnlineTimeControl('daily', 12, 5)).toBe('1440+0');
        expect(playOnlineTimeControl('nope', 12, 5)).toBe('10+0');
    });

    test('custom sends "<min>+<inc>"', () => {
        expect(playOnlineTimeControl('custom', 12, 5)).toBe('12+5');
        expect(selectionMinutes('custom', 12, 5).mins).toBe(12);
    });
});

describe('privateTimeControl', () => {
    // F9: the option id ("rapid", "daily") used to be sent, and the server played 10 minutes.
    test.each([
        ['bullet', '1+0'],
        ['blitz', '3+0'],
        ['rapid', '10+0'],
        ['classical', '30+0'],
        ['daily', '1440+0'],
    ])('%s sends the real time control %s [F9]', (id, expected) => {
        expect(privateTimeControl(id, 5, 0)).toBe(expected);
    });

    test('custom sends the sliders', () => {
        expect(privateTimeControl('custom', 5, 2)).toBe('5+2');
    });
});

test('customTimeControl formats "<min>+<inc>"', () => {
    expect(customTimeControl(7, 2)).toBe('7+2');
});

test('option lists keep their order', () => {
    expect(BASE_TIME_CONTROLS.map((t) => t.id)).toEqual(['bullet', 'blitz', 'rapid', 'classical', 'custom', 'daily']);
    expect(PRIVATE_TIME_CONTROL_IDS).toEqual(['bullet', 'blitz', 'rapid', 'classical', 'custom', 'daily']);
});
