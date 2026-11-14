import { playerOutcome } from '@/lib/chess/gameOutcome';

const ME = 'me';
const base = { white_id: ME, black_id: 'them' };

describe('playerOutcome (F12)', () => {
    test.each([
        ['winner is me', { result: 'white', winner_id: ME }, 'win'],
        ['winner is the opponent', { result: 'black', winner_id: 'them' }, 'loss'],
        ['draw', { result: 'draw', winner_id: null }, 'draw'],
        ['aborted status', { status: 'aborted', result: null, winner_id: null }, 'aborted'],
        ['legacy aborted result', { status: 'completed', result: 'aborted', winner_id: null }, 'aborted'],
        ['no result and no winner is a draw, not a loss', { result: null, winner_id: null }, 'draw'],
        ['result colour without winner_id: my colour', { result: 'white', winner_id: null }, 'win'],
        ['result colour without winner_id: their colour', { result: 'black', winner_id: null }, 'loss'],
    ])('%s', (_name, row, expected) => {
        expect(playerOutcome({ ...base, ...row }, ME)).toBe(expected);
    });
});
