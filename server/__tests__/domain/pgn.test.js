const { buildPgnFromMoveLog } = require('../../src/domain/pgn');

const HEADERS = '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n';

describe('buildPgnFromMoveLog', () => {
    test.each([[null], [undefined], [[]], [[{ move: 'e2e4' }, null, { san: '' }]]])('no SAN moves (%p) → null', (log) =>
        expect(buildPgnFromMoveLog(log)).toBeNull(),
    );

    test('numbers full moves and ends with "*"', () => {
        const log = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
        expect(buildPgnFromMoveLog(log)).toBe(`${HEADERS}1. e4 e5 2. Nf3 *`);
    });

    test('skips entries without a SAN before numbering', () => {
        const log = [{ san: 'd4' }, null, { move: 'x' }, { san: 'd5' }, { san: 'c4' }, { san: 'e6' }];
        expect(buildPgnFromMoveLog(log)).toBe(`${HEADERS}1. d4 d5 2. c4 e6 *`);
    });
});
