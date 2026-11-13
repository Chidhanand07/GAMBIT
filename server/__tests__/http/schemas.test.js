/**
 * src/http/schemas.js — HTTP input bounds (NODE-08).
 */
const { schemas } = require('../../src/http/schemas');

describe('POST /api/analysis/engine depth', () => {
    // The engine refuses depths above 20 (ADR F-063); the server must not forward what it will refuse.
    test.each([1, 18, 20])('depth %i is accepted', (depth) => {
        expect(schemas.analysis.safeParse({ fen: 'F', depth }).success).toBe(true);
    });

    test.each([0, 21, 30, 1000])('depth %i is refused at the boundary', (depth) => {
        expect(schemas.analysis.safeParse({ fen: 'F', depth }).success).toBe(false);
    });

    test('depth is optional (the route defaults it)', () => {
        expect(schemas.analysis.safeParse({ fen: 'F' }).success).toBe(true);
    });
});
