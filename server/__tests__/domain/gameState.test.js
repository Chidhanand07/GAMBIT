const {
    START_FEN,
    createInitialGameState,
    activeSideFromFen,
    gameStateFromRow,
} = require('../../src/domain/gameState');

const NOW = 1_700_000_000_000;

// Key order is observable: the state is JSON-serialised into Redis.
const KEY_ORDER = [
    'id',
    'fen',
    'startFen',
    'whiteId',
    'blackId',
    'whiteClockMs',
    'blackClockMs',
    'activeSide',
    'status',
    'result',
    'reason',
    'moveLog',
    'timeControl',
    'incrementMs',
    'isRated',
    'lastMoveAt',
    'disconnectInfo',
];

describe('createInitialGameState', () => {
    test('new game from a time control: exact JSON (keys, order, defaults)', () => {
        const state = createInitialGameState({
            id: 'g1',
            whiteId: 'w',
            blackId: 'b',
            timeControl: '3+2',
            isRated: true,
        });
        expect(JSON.stringify(state)).toBe(
            JSON.stringify({
                id: 'g1',
                fen: START_FEN,
                startFen: START_FEN,
                whiteId: 'w',
                blackId: 'b',
                whiteClockMs: 180000,
                blackClockMs: 180000,
                activeSide: 'w',
                status: 'active',
                result: null,
                reason: null,
                moveLog: [],
                timeControl: '3+2',
                incrementMs: 2000,
                isRated: true,
                lastMoveAt: null,
                disconnectInfo: null,
            }),
        );
        expect(Object.keys(state)).toEqual(KEY_ORDER);
    });

    test('explicit values override every default', () => {
        const state = createInitialGameState({
            id: 'g2',
            whiteId: 'w',
            blackId: 'b',
            timeControl: '10',
            isRated: false,
            fen: 'custom',
            whiteClockMs: 1,
            blackClockMs: 2,
            activeSide: 'b',
            lastMoveAt: 5,
        });
        expect(state).toMatchObject({
            fen: 'custom',
            whiteClockMs: 1,
            blackClockMs: 2,
            activeSide: 'b',
            lastMoveAt: 5,
            isRated: false,
        });
    });

    test('undefined ids and time control are dropped by JSON, as before', () => {
        const state = createInitialGameState({ id: 'g3', isRated: false });
        expect(JSON.parse(JSON.stringify(state))).not.toHaveProperty('whiteId');
        expect(state).toMatchObject({ whiteClockMs: 600000, incrementMs: 0 });
    });
});

describe('activeSideFromFen', () => {
    test.each([
        [START_FEN, 'w'],
        ['8/8/8/8/8/8/8/8 b - - 0 1', 'b'],
        ['nospaces', 'w'],
        ['', 'w'],
        [null, 'w'],
        [undefined, 'w'],
    ])('%p → %p', (fen, side) => expect(activeSideFromFen(fen)).toBe(side));
});

describe('gameStateFromRow', () => {
    const row = {
        white_id: 'w',
        black_id: 'b',
        is_rated: true,
        time_control: '5+3',
        fen: '8/8/8/8/8/8/8/8 b - - 0 1',
        white_clock_ms: 1000,
        black_clock_ms: 2000,
    };

    test('restores clocks, side and rating flag from the row, running the clock', () => {
        const state = gameStateFromRow('g-id', row, NOW);
        expect(Object.keys(state)).toEqual(KEY_ORDER);
        expect(state).toEqual({
            id: 'g-id',
            fen: row.fen,
            // The move log is empty after a restore, so the rules replay from the restored position.
            startFen: row.fen,
            whiteId: 'w',
            blackId: 'b',
            whiteClockMs: 1000,
            blackClockMs: 2000,
            activeSide: 'b',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: '5+3',
            incrementMs: 3000,
            isRated: true,
            lastMoveAt: NOW,
            disconnectInfo: null,
        });
    });

    test('null clocks and fen fall back to the start; clock stays stopped', () => {
        const state = gameStateFromRow(
            'g-id',
            { ...row, fen: null, white_clock_ms: null, black_clock_ms: null, is_rated: null },
            NOW,
        );
        expect(state).toMatchObject({
            fen: START_FEN,
            whiteClockMs: 300000,
            blackClockMs: 300000,
            activeSide: 'w',
            isRated: false,
            lastMoveAt: null,
        });
    });

    test('one clock column set is enough to run the clock', () => {
        const state = gameStateFromRow('g-id', { ...row, white_clock_ms: null }, NOW);
        expect(state).toMatchObject({ whiteClockMs: 300000, blackClockMs: 2000, lastMoveAt: NOW });
    });

    test('missing (undefined) clock columns count as "not null": clock runs', () => {
        const noClocks = { ...row };
        delete noClocks.white_clock_ms;
        delete noClocks.black_clock_ms;
        expect(gameStateFromRow('g-id', noClocks, NOW).lastMoveAt).toBe(NOW);
    });
});

describe('clock columns round-trip [G2]', () => {
    const { gameStateFromRow } = require('../../src/domain/gameState');

    test('a row written at disconnect or after a move restores exactly those clocks', () => {
        // What the server writes: white_clock_ms / black_clock_ms (one canonical pair).
        const row = { white_id: 'w', black_id: 'b', time_control: '10+0', fen: null, white_clock_ms: 55000, black_clock_ms: 432100 };
        expect(gameStateFromRow('g', row, 1000)).toMatchObject({ whiteClockMs: 55000, blackClockMs: 432100 });
    });

    test('the legacy white_time_ms / black_time_ms columns are not read', () => {
        const row = { white_id: 'w', black_id: 'b', time_control: '10+0', fen: null, white_clock_ms: null, black_clock_ms: null, white_time_ms: 1, black_time_ms: 2 };
        expect(gameStateFromRow('g', row, 1000)).toMatchObject({ whiteClockMs: 600000, blackClockMs: 600000, lastMoveAt: null });
    });
});
