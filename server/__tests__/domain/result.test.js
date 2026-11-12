const {
    resultLabel,
    outcomeOfRow,
    opponentColor,
    sideToColor,
    colorOfPlayer,
    playerIdOf,
    winnerIdFor,
} = require('../../src/domain/result');

const players = { whiteId: 'w-id', blackId: 'b-id' };

describe('resultLabel', () => {
    test.each([
        ['white', 'White wins'],
        ['black', 'Black wins'],
        ['draw', 'Draw'],
        [null, 'Draw'],
        [undefined, 'Draw'],
        ['White', 'Draw'], // exact match only
    ])('%p → %p', (outcome, label) => expect(resultLabel(outcome)).toBe(label));
});

describe('outcomeOfRow: outcome of a finished games row [S3]', () => {
    const seats = { white_id: 'w-id', black_id: 'b-id' };

    test.each([
        ['white', 'white'],
        ['black', 'black'],
        ['draw', 'draw'],
    ])('result %p is used as written', (result, outcome) => {
        // The winner column is ignored when `result` is a known outcome.
        expect(outcomeOfRow({ ...seats, result, winner_id: null })).toBe(outcome);
    });

    test.each([
        ['w-id', 'white'],
        ['b-id', 'black'],
        [null, 'draw'],
        ['someone-else', 'draw'],
    ])('rows written before the fix (result null): winner_id %p → %p', (winner_id, outcome) => {
        expect(outcomeOfRow({ ...seats, result: null, winner_id })).toBe(outcome);
    });

    test('an unknown result string falls back to the winner column', () => {
        expect(outcomeOfRow({ ...seats, result: 'white_wins', winner_id: 'b-id' })).toBe('black');
    });

    test('a missing seat never matches a missing winner', () => {
        expect(outcomeOfRow({ white_id: null, black_id: null, result: null, winner_id: null })).toBe('draw');
    });
});

describe('opponentColor', () => {
    test.each([
        ['white', 'black'],
        ['black', 'white'],
        [undefined, 'white'],
    ])('%p → %p', (color, other) => expect(opponentColor(color)).toBe(other));
});

describe('sideToColor', () => {
    test.each([
        ['w', 'white'],
        ['b', 'black'],
        ['x', 'black'],
    ])('%p → %p', (side, color) => expect(sideToColor(side)).toBe(color));
});

describe('colorOfPlayer', () => {
    test('white player', () => expect(colorOfPlayer('w-id', 'w-id')).toBe('white'));
    test('anyone else is black', () => expect(colorOfPlayer('stranger', 'w-id')).toBe('black'));
});

describe('playerIdOf', () => {
    test('white', () => expect(playerIdOf('white', players)).toBe('w-id'));
    test('black', () => expect(playerIdOf('black', players)).toBe('b-id'));
    test('anything else maps to black', () => expect(playerIdOf('draw', players)).toBe('b-id'));
});

describe('winnerIdFor', () => {
    test.each([
        ['white', 'w-id'],
        ['black', 'b-id'],
        ['draw', null],
        ['other', null],
    ])('%p → %p', (outcome, id) => expect(winnerIdFor(outcome, players)).toBe(id));
});

describe('aborted games [FIRST-MOVE]', () => {
    const { resultLabel, outcomeOfRow, winnerIdFor } = require('../../src/domain/result');

    test("label 'Aborted'; nobody wins", () => {
        expect(resultLabel('aborted')).toBe('Aborted');
        expect(winnerIdFor('aborted', { whiteId: 'w', blackId: 'b' })).toBeNull();
    });

    test('a row with status aborted is an aborted game, not a draw', () => {
        expect(outcomeOfRow({ status: 'aborted', result: null, winner_id: null, white_id: 'w', black_id: 'b' })).toBe('aborted');
    });
});
