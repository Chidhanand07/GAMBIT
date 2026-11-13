/**
 * src/domain/moveAuthorization.js — who may move, and when [S1] (NODE-11).
 */
const { moveRejection, REJECTION } = require('../../src/domain/moveAuthorization');
const { makeGame } = require('../helpers/fixtures');

const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test('the player to move is allowed', () => {
    expect(moveRejection(makeGame(), 'white-user')).toBeNull();
    expect(moveRejection(makeGame({ fen: BLACK_TO_MOVE }), 'black-user')).toBeNull();
});

test.each([
    ['no such game', null, 'white-user', REJECTION.GAME_NOT_FOUND],
    ['a finished game', makeGame({ status: 'completed' }), 'white-user', REJECTION.GAME_NOT_ACTIVE],
    ['a spectator', makeGame(), 'stranger', REJECTION.NOT_A_PLAYER],
    ['no user', makeGame(), undefined, REJECTION.NOT_A_PLAYER],
    ['the player whose turn it is not', makeGame(), 'black-user', REJECTION.NOT_YOUR_TURN],
    ['white moving on black’s turn', makeGame({ fen: BLACK_TO_MOVE }), 'white-user', REJECTION.NOT_YOUR_TURN],
])('%s is rejected', (_name, game, userId, reason) => {
    expect(moveRejection(game, userId)).toBe(reason);
});

test('the side to move comes from the position, not from the stored clock side', () => {
    // activeSide says black, but the FEN says white is to move: the FEN wins.
    const game = makeGame({ activeSide: 'b' });
    expect(moveRejection(game, 'white-user')).toBeNull();
    expect(moveRejection(game, 'black-user')).toBe(REJECTION.NOT_YOUR_TURN);
});

test('an empty seat never matches (a waiting game has a null player)', () => {
    expect(moveRejection(makeGame({ blackId: null, fen: BLACK_TO_MOVE }), null)).toBe(REJECTION.NOT_A_PLAYER);
});

test('the reasons are the strings sent to clients', () => {
    expect(REJECTION).toEqual({
        GAME_NOT_FOUND: 'game_not_found',
        GAME_NOT_ACTIVE: 'game_not_active',
        NOT_A_PLAYER: 'not_a_player',
        NOT_YOUR_TURN: 'not_your_turn',
        ILLEGAL_MOVE: 'illegal_move',
    });
});
