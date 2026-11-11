const {
    resultLabel,
    parseOutcome,
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

describe('parseOutcome', () => {
    test.each([
        ['White wins', 'white'],
        ['WHITE', 'white'],
        ['Black wins', 'black'],
        ['black resigned', 'black'],
        ['white and black', 'white'], // "white" is checked first
        ['Draw', 'draw'],
        ['stalemate', 'draw'],
        ['', 'draw'],
        [null, 'draw'],
        [undefined, 'draw'],
    ])('%p → %p', (text, outcome) => expect(parseOutcome(text)).toBe(outcome));

    test('non-string input throws, like the original inline code', () => {
        expect(() => parseOutcome(/** @type {any} */ (1))).toThrow(TypeError);
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
