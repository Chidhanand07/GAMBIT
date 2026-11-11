/**
 * src/domain/chessRules.js — the server's own move legality [S1][S10]
 * (NODE-11, NODE-16, TEST-03). Pure: no engine, no network, no client FEN.
 */
const { playMove, positionOf, START_FEN } = require('../../src/domain/chessRules');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

/** Minimal slice of the Redis game state the rules read. */
const state = (over = {}) => ({ fen: START_FEN, startFen: START_FEN, moveLog: [], ...over });

/** Play a list of "e2e4"-style moves from the start and return the resulting state. */
function after(...ucis) {
    let game = state();
    for (const uci of ucis) {
        const played = playMove(game, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        if (!played.legal) throw new Error(`setup move ${uci} is illegal`);
        game = {
            ...game,
            fen: played.fen,
            moveLog: [...game.moveLog, { move: played.uci, fen: played.fen, san: played.san }],
        };
    }
    return game;
}

describe('legal moves', () => {
    test('a pawn push returns server-computed uci, san and fen', () => {
        expect(playMove(state(), { from: 'e2', to: 'e4' })).toMatchObject({
            legal: true,
            uci: 'e2e4',
            san: 'e4',
            fen: AFTER_E4,
            captured: false,
        });
    });

    test('a capture is flagged', () => {
        const game = after('e2e4', 'd7d5');
        expect(playMove(game, { from: 'e4', to: 'd5' })).toMatchObject({
            legal: true,
            uci: 'e4d5',
            san: 'exd5',
            captured: true,
        });
    });

    test('castling: the king move is accepted and reported as O-O with the castle flag', () => {
        const game = after('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5');
        const played = playMove(game, { from: 'e1', to: 'g1' });
        expect(played).toMatchObject({ legal: true, uci: 'e1g1', san: 'O-O' });
        expect(played.flags).toContain('k');
    });

    test('en passant is legal only on the move right after the double push', () => {
        const game = after('e2e4', 'a7a6', 'e4e5', 'd7d5');
        expect(playMove(game, { from: 'e5', to: 'd6' })).toMatchObject({ legal: true, san: 'exd6', captured: true });
        const late = after('e2e4', 'a7a6', 'e4e5', 'd7d5', 'h2h3', 'h7h6');
        expect(playMove(late, { from: 'e5', to: 'd6' })).toEqual({ legal: false });
    });

    test('promotion: the chosen piece ends up in uci and san', () => {
        const game = state({ fen: '8/P6k/8/8/8/8/7K/8 w - - 0 1', startFen: '8/P6k/8/8/8/8/7K/8 w - - 0 1' });
        expect(playMove(game, { from: 'a7', to: 'a8', promotion: 'n' })).toMatchObject({
            legal: true,
            uci: 'a7a8n',
            san: 'a8=N',
        });
        expect(playMove(game, { from: 'a7', to: 'a8', promotion: 'q' })).toMatchObject({ uci: 'a7a8q', san: 'a8=Q' });
    });

    test('a promotion without a piece is illegal (the server does not guess)', () => {
        const game = state({ fen: '8/P6k/8/8/8/8/7K/8 w - - 0 1', startFen: undefined });
        expect(playMove(game, { from: 'a7', to: 'a8' })).toEqual({ legal: false });
    });

    test('the frontend always sends promotion "q"; it is ignored on a non-promoting move', () => {
        expect(playMove(state(), { from: 'g1', to: 'f3', promotion: 'q' })).toMatchObject({
            legal: true,
            uci: 'g1f3',
            san: 'Nf3',
        });
    });
});

describe('illegal moves', () => {
    test.each([
        ['a piece that cannot move that way', { from: 'e2', to: 'e5' }],
        ['moving the opponent’s piece', { from: 'e7', to: 'e5' }],
        ['an empty square', { from: 'e4', to: 'e5' }],
        ['a blocked piece', { from: 'f1', to: 'c4' }],
        ['a null move', { from: 'e2', to: 'e2' }],
        ['missing squares', {}],
        ['a non-square', { from: 'z9', to: 'e4' }],
    ])('%s → { legal: false }', (_name, move) => {
        expect(playMove(state(), move)).toEqual({ legal: false });
    });

    test('a move that leaves the king in check is illegal', () => {
        // White king e1, pinned knight e2, black rook e8.
        const game = state({ fen: '4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1', startFen: undefined });
        expect(playMove(game, { from: 'e2', to: 'c3' })).toEqual({ legal: false });
    });

    test('castling through check is illegal', () => {
        const game = state({ fen: '5r1k/8/8/8/8/8/8/4K2R w K - 0 1', startFen: undefined });
        expect(playMove(game, { from: 'e1', to: 'g1' })).toEqual({ legal: false });
    });

    test('the input state is never mutated', () => {
        const game = state();
        const snapshot = JSON.stringify(game);
        playMove(game, { from: 'e2', to: 'e4' });
        playMove(game, { from: 'e2', to: 'e5' });
        expect(JSON.stringify(game)).toBe(snapshot);
    });
});

describe('positionOf: which position the server trusts', () => {
    test('replays the UCI history from startFen (so repetition is knowable)', () => {
        const game = after('g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
        const chess = positionOf(game);
        expect(chess.fen()).toBe(game.fen);
        expect(chess.isThreefoldRepetition()).toBe(true);
    });

    test('no startFen (game stored before this fix) → the stored FEN alone', () => {
        const chess = positionOf({ fen: AFTER_E4, moveLog: [{ fen: AFTER_E4, san: 'e4' }] });
        expect(chess.fen()).toBe(AFTER_E4);
        expect(chess.turn()).toBe('b');
    });

    test('a move log without UCI moves (legacy entries) → the stored FEN alone', () => {
        const chess = positionOf(state({ fen: AFTER_E4, moveLog: [{ fen: AFTER_E4, san: 'e4' }] }));
        expect(chess.fen()).toBe(AFTER_E4);
    });

    test('a history that does not reproduce the stored FEN is ignored: the FEN is the authority', () => {
        const chess = positionOf(state({ fen: AFTER_E4, moveLog: [{ move: 'd2d4', fen: 'x', san: 'd4' }] }));
        expect(chess.fen()).toBe(AFTER_E4);
    });

    test('a corrupt history entry falls back to the stored FEN instead of throwing', () => {
        const chess = positionOf(state({ fen: AFTER_E4, moveLog: [{ move: 'zzzz', fen: 'x', san: '?' }] }));
        expect(chess.fen()).toBe(AFTER_E4);
    });

    test('a game restored from the database starts its history at the restored FEN', () => {
        const restored = { fen: AFTER_E4, startFen: AFTER_E4, moveLog: [] };
        expect(playMove(restored, { from: 'e7', to: 'e5' })).toMatchObject({ legal: true, san: 'e5' });
    });

    test('an unusable stored FEN throws (the caller fails closed)', () => {
        expect(() => positionOf({ fen: 'not a fen', moveLog: [] })).toThrow();
    });

    test('a missing FEN means the start position', () => {
        expect(positionOf({ moveLog: [] }).fen()).toBe(START_FEN);
    });
});
