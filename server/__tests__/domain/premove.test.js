/**
 * domain/premove.js — queueing a move for the opponent's turn and playing it right after
 * their move [PREMOVE] (ADR F-153).
 */
const { premoveRejection, withPremove, premoveView, resolvePremove } = require('../../src/domain/premove');
const { START_FEN } = require('../../src/domain/gameState');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const game = (fen, extra = {}) => ({
    fen,
    startFen: fen,
    moveLog: [],
    whiteId: 'w',
    blackId: 'b',
    whiteClockMs: 60_000,
    blackClockMs: 60_000,
    incrementMs: 2000,
    lastMoveAt: 1000,
    ...extra,
});

describe('premoveRejection', () => {
    test('only on the opponent’s turn, only from a square holding one of my pieces', () => {
        expect(premoveRejection(game(START_FEN), 'black', { from: 'e7' })).toBeNull();
        expect(premoveRejection(game(START_FEN), 'white', { from: 'e2' })).toBe('premove_your_turn');
        expect(premoveRejection(game(START_FEN), 'black', { from: 'e2' })).toBe('illegal_premove');
        expect(premoveRejection(game(START_FEN), 'black', { from: 'e5' })).toBe('illegal_premove');
    });
});

test('withPremove stores the owner, squares and an optional promotion', () => {
    expect(withPremove('black', { from: 'e7', to: 'e5' })).toEqual({ premove: { by: 'black', from: 'e7', to: 'e5' } });
    expect(withPremove('white', { from: 'a7', to: 'a8', promotion: 'n' }).premove.promotion).toBe('n');
});

test('premoveView: only the owner sees it', () => {
    const g = game(START_FEN, { premove: { by: 'black', from: 'e7', to: 'e5' } });
    expect(premoveView(g, 'b')).toEqual({ premove: { from: 'e7', to: 'e5' } });
    expect(premoveView(g, 'w')).toEqual({});
    expect(premoveView(g, undefined)).toEqual({});
    expect(premoveView(game(START_FEN), 'b')).toEqual({});
});

describe('resolvePremove (state right after White’s 1. e4, Black’s premove queued)', () => {
    const afterE4 = (premove) =>
        game(AFTER_E4, {
            startFen: START_FEN,
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
            lastMoveAt: 5000,
            premove,
        });

    test('legal: played at the same instant — zero time charged, the increment added', () => {
        const r = resolvePremove(afterE4({ by: 'black', from: 'e7', to: 'e5' }), 5000, false);
        expect(r.applied.played.san).toBe('e5');
        expect(r.discarded).toBeNull();
        expect(r.first.premove).toBeNull();
        expect(r.final).toMatchObject({ blackClockMs: 62_000, whiteClockMs: 60_000, lastMoveAt: 5000, premove: null });
        expect(r.final.moveLog.map((m) => m.san)).toEqual(['e4', 'e5']);
    });

    test('illegal after the opponent’s move: dropped and reported', () => {
        const r = resolvePremove(afterE4({ by: 'black', from: 'e7', to: 'e4' }), 5000, false);
        expect(r.applied).toBeNull();
        expect(r.discarded).toEqual({ by: 'black', from: 'e7', to: 'e4' });
        expect(r.final).toBe(r.first);
        expect(r.final.premove).toBeNull();
    });

    test('the opponent’s move ended the game: the premove lapses silently', () => {
        const r = resolvePremove(afterE4({ by: 'black', from: 'e7', to: 'e5' }), 5000, true);
        expect(r.applied).toBeNull();
        expect(r.discarded).toBeNull();
        expect(r.final.premove).toBeNull();
    });

    test('no premove: the state is untouched', () => {
        const state = afterE4(undefined);
        expect(resolvePremove(state, 5000, false)).toEqual({
            first: state,
            final: state,
            applied: null,
            discarded: null,
        });
    });
});
