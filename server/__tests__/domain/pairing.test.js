const {
    getSearchRadius,
    isProvisional,
    createQueueEntry,
    isRatingCompatible,
    sortByLongestWaiting,
    findOpponent,
} = require('../../src/domain/matchmaking/pairing');

const NOW = 1_700_000_000_000;

function entry(id, overrides = {}) {
    return {
        user_id: id,
        username: id,
        rating: 1500,
        isProvisional: false,
        time_control: '10',
        increment: 0,
        isRated: true,
        joined_at: NOW,
        socketId: `s-${id}`,
        ...overrides,
    };
}

describe('getSearchRadius', () => {
    test.each([
        [0, 50],
        [10, 50],
        [10.001, 100],
        [20, 100],
        [35, 150],
        [60, 250],
        [120, 400],
        [120.5, 9999],
        [NaN, 9999],
    ])('%ps → ±%p', (sec, radius) => expect(getSearchRadius(sec)).toBe(radius));
});

describe('isProvisional', () => {
    test.each([
        [0, true],
        [4, true],
        [5, false],
        [null, true],
        [undefined, true],
    ])('%p games → %p', (games, provisional) => expect(isProvisional(games)).toBe(provisional));
});

describe('createQueueEntry', () => {
    test('builds the entry with exact keys and order', () => {
        const user = { id: 'u1', username: 'alice', rating: 1450, games_played: 12 };
        const e = createQueueEntry({ user, socketId: 's1', timeControl: '3', increment: 2, isRated: false, now: NOW });
        expect(Object.keys(e)).toEqual([
            'user_id',
            'username',
            'rating',
            'isProvisional',
            'time_control',
            'increment',
            'isRated',
            'joined_at',
            'socketId',
        ]);
        expect(e).toEqual({
            user_id: 'u1',
            username: 'alice',
            rating: 1450,
            isProvisional: false,
            time_control: '3',
            increment: 2,
            isRated: false,
            joined_at: NOW,
            socketId: 's1',
        });
    });

    test.each([0, null, undefined])('falsy rating %p → 1200 (`||`, not `??`)', (rating) => {
        const e = createQueueEntry({ user: { id: 'u', username: 'u', rating }, socketId: 's', now: NOW });
        expect(e.rating).toBe(1200);
        expect(e.isProvisional).toBe(true);
    });
});

describe('isRatingCompatible', () => {
    const prov = (rating) => ({ rating, isProvisional: true });
    const est = (rating) => ({ rating, isProvisional: false });

    test('two provisional players always match', () =>
        expect(isRatingCompatible(prov(3000), prov(100), 0, 0)).toBe(true));

    test.each([
        [800, true],
        [1400, true],
        [799, false],
        [1401, false],
    ])('provisional vs established %p → %p (either order)', (rating, ok) => {
        expect(isRatingCompatible(prov(2000), est(rating), 0, 0)).toBe(ok);
        expect(isRatingCompatible(est(rating), prov(2000), 0, 0)).toBe(ok);
    });

    test('established players: difference within either radius', () => {
        expect(isRatingCompatible(est(1500), est(1550), 50, 0)).toBe(true);
        expect(isRatingCompatible(est(1500), est(1550), 0, 50)).toBe(true);
        expect(isRatingCompatible(est(1500), est(1551), 50, 50)).toBe(false);
    });
});

describe('sortByLongestWaiting', () => {
    test('sorts in place by joined_at, stable for ties', () => {
        const list = [entry('c', { joined_at: 3 }), entry('a', { joined_at: 1 }), entry('b', { joined_at: 1 })];
        const sorted = sortByLongestWaiting(list);
        expect(sorted).toBe(list);
        expect(sorted.map((e) => e.user_id)).toEqual(['a', 'b', 'c']);
    });
});

describe('findOpponent', () => {
    const fixedClock = () => NOW;

    test('returns the first compatible candidate', () => {
        const p = entry('p');
        const far = entry('far', { rating: 2000 });
        const near1 = entry('near1', { rating: 1520 });
        const near2 = entry('near2', { rating: 1510 });
        expect(findOpponent(p, [far, near1, near2], fixedClock)).toBe(near1);
    });

    test('ignores other time controls (and does not read the clock for them)', () => {
        const clock = jest.fn(fixedClock);
        const p = entry('p');
        expect(findOpponent(p, [entry('x', { time_control: '3' })], clock)).toBeNull();
        expect(clock).toHaveBeenCalledTimes(1);
    });

    test('pairs on base AND increment: 3+0 never meets 3+2 [G4]', () => {
        const p = entry('p', { time_control: '3+0', increment: 0 });
        const other = entry('x', { time_control: '3+2', increment: 2 });
        expect(findOpponent(p, [other], fixedClock)).toBeNull();
        expect(findOpponent(other, [p], fixedClock)).toBeNull();
    });

    test('the increment is compared even when two entries carry the same time-control text [G4]', () => {
        const p = entry('p', { time_control: '3', increment: 0 });
        const other = entry('x', { time_control: '3', increment: 2 });
        expect(findOpponent(p, [other], fixedClock)).toBeNull();
        const same = entry('y', { time_control: '3', increment: 0 });
        expect(findOpponent(p, [other, same], fixedClock)).toBe(same);
    });

    test('reads the clock once for the player and once per same-time-control candidate', () => {
        const clock = jest.fn(fixedClock);
        findOpponent(entry('p'), [entry('a', { rating: 3000 }), entry('b', { rating: 100 })], clock);
        expect(clock).toHaveBeenCalledTimes(3);
    });

    test('the radius grows with waiting time', () => {
        const p = entry('p', { joined_at: NOW - 30_000 }); // 30 s → ±150
        expect(findOpponent(p, [entry('q', { rating: 1640 })], fixedClock)).not.toBeNull();
        expect(findOpponent(entry('p'), [entry('q', { rating: 1640 })], fixedClock)).toBeNull();
    });

    test('no candidates → null', () => expect(findOpponent(entry('p'), [], fixedClock)).toBeNull());
});
