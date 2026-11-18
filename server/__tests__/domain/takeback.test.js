/**
 * domain/takeback.js — what a takeback undoes, when it may be asked for, and the restored
 * state [TAKEBACK] (ADR F-152).
 */
const {
    pliesToUndo,
    takebackRejection,
    withTakebackRequest,
    hasTakebackFor,
    rolledBack,
    TAKEBACK_COOLDOWN_MS,
} = require('../../src/domain/takeback');
const { START_FEN } = require('../../src/domain/gameState');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const LOG = [
    { move: 'e2e4', fen: AFTER_E4, san: 'e4' },
    { move: 'e7e5', fen: AFTER_E5, san: 'e5' },
    { move: 'g1f3', fen: AFTER_NF3, san: 'Nf3' },
];
const CLOCKS = [
    { whiteMs: 59_000, blackMs: 60_000 },
    { whiteMs: 59_000, blackMs: 57_000 },
    { whiteMs: 55_000, blackMs: 57_000 },
];

/** A game after `plies` of LOG, both players allowing takebacks. */
function game(plies, extra = {}) {
    return {
        fen: plies ? LOG[plies - 1].fen : START_FEN,
        startFen: START_FEN,
        moveLog: LOG.slice(0, plies),
        clockLog: CLOCKS.slice(0, plies),
        timeControl: '1',
        whiteClockMs: 1,
        blackClockMs: 1,
        lastMoveAt: 100,
        activeSide: plies % 2 ? 'b' : 'w',
        takebackPrefs: { white: true, black: true },
        ...extra,
    };
}

describe('pliesToUndo', () => {
    test('one ply when the requester moved last, two when the opponent has replied', () => {
        expect(pliesToUndo(game(3), 'white')).toBe(1); // Black to move: undo Nf3
        expect(pliesToUndo(game(3), 'black')).toBe(2); // Black to move: undo Nf3 and e5
        expect(pliesToUndo(game(2), 'black')).toBe(1);
        expect(pliesToUndo(game(2), 'white')).toBe(2);
    });
});

describe('takebackRejection', () => {
    const AT = 1_000_000;
    test('allowed when the opponent allows it and there is a move of mine to undo', () => {
        expect(takebackRejection(game(3), 'white', AT)).toBeNull();
        expect(takebackRejection(game(3), 'black', AT)).toBeNull();
        expect(takebackRejection(game(1), 'white', AT)).toBeNull();
    });

    test('nothing to undo: no move of mine yet', () => {
        expect(takebackRejection(game(0), 'white', AT)).toBe('takeback_nothing_to_undo');
        expect(takebackRejection(game(1), 'black', AT)).toBe('takeback_nothing_to_undo');
    });

    test('the opponent has not allowed takebacks (absent counts as not allowed)', () => {
        expect(takebackRejection(game(3, { takebackPrefs: { white: true, black: false } }), 'white', AT)).toBe(
            'takebacks_disabled',
        );
        expect(takebackRejection(game(3, { takebackPrefs: undefined }), 'black', AT)).toBe('takebacks_disabled');
        // My own setting does not matter for my request.
        expect(takebackRejection(game(3, { takebackPrefs: { black: true } }), 'white', AT)).toBeNull();
    });

    test('one standing request at a time', () => {
        const pending = { takeback: { by: 'white', plies: 1, ply: 3, at: AT } };
        expect(takebackRejection(game(3, pending), 'black', AT)).toBe('takeback_pending');
        expect(takebackRejection(game(3, pending), 'white', AT)).toBe('takeback_pending');
    });

    test('a cooldown after my last request, whatever the answer was', () => {
        const last = { lastTakebackAt: { white: AT } };
        expect(takebackRejection(game(3, last), 'white', AT + TAKEBACK_COOLDOWN_MS - 1)).toBe('takeback_cooldown');
        expect(takebackRejection(game(3, last), 'white', AT + TAKEBACK_COOLDOWN_MS)).toBeNull();
        expect(takebackRejection(game(3, last), 'black', AT)).toBeNull();
    });
});

test('withTakebackRequest / hasTakebackFor: only the opponent answers, and only for this position', () => {
    const asked = { ...game(3), ...withTakebackRequest(game(3), 'white', 7) };
    expect(asked.takeback).toEqual({ by: 'white', plies: 1, ply: 3, at: 7 });
    expect(asked.lastTakebackAt).toEqual({ white: 7 });
    expect(hasTakebackFor(asked, 'black')).toBe(true);
    expect(hasTakebackFor(asked, 'white')).toBe(false);
    expect(hasTakebackFor({ ...asked, moveLog: LOG.slice(0, 2) }, 'black')).toBe(false);
});

describe('rolledBack', () => {
    test('one ply: position, log, clock snapshot and side to move of the earlier ply; the clock runs from now', () => {
        const asked = { ...game(3), ...withTakebackRequest(game(3), 'white', 7), drawOffer: { by: 'black' } };
        expect(rolledBack(asked, 500)).toMatchObject({
            fen: AFTER_E5,
            moveLog: LOG.slice(0, 2),
            clockLog: CLOCKS.slice(0, 2),
            whiteClockMs: 59_000,
            blackClockMs: 57_000,
            activeSide: 'w',
            lastMoveAt: 500,
            takeback: null,
            drawOffer: null,
        });
    });

    test('two plies', () => {
        const asked = { ...game(3), ...withTakebackRequest(game(3), 'black', 7) };
        expect(rolledBack(asked, 500)).toMatchObject({
            fen: AFTER_E4,
            moveLog: LOG.slice(0, 1),
            whiteClockMs: 59_000,
            blackClockMs: 60_000,
            activeSide: 'b',
        });
    });

    test('back to the start: starting clocks, clock not running, first-move window reopened', () => {
        const asked = { ...game(1), ...withTakebackRequest(game(1), 'white', 7), startedAt: 1 };
        expect(rolledBack(asked, 500)).toMatchObject({
            fen: START_FEN,
            moveLog: [],
            whiteClockMs: 60_000,
            blackClockMs: 60_000,
            activeSide: 'w',
            lastMoveAt: null,
            startedAt: 500,
        });
    });

    test('a log without clock snapshots (a game restored from the database) keeps the clocks as they stand', () => {
        const restored = {
            ...game(3),
            clockLog: undefined,
            whiteClockMs: 40_000,
            blackClockMs: 30_000,
            lastMoveAt: 400,
        };
        const asked = { ...restored, ...withTakebackRequest(restored, 'white', 7) };
        const next = rolledBack(asked, 500);
        // Black was to move since 400: charged 100 ms.
        expect(next).toMatchObject({ whiteClockMs: 40_000, blackClockMs: 29_900, fen: AFTER_E5 });
        expect(next.clockLog).toBeUndefined();
    });
});
