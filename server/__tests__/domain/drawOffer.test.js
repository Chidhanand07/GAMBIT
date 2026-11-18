/**
 * domain/drawOffer.js — when a side may offer a draw [DRAW-OFFER] (ADR F-151).
 */
const {
    canOfferDraw,
    drawOfferRejection,
    hasOfferFor,
    withDrawOffer,
    OWN_MOVES_BETWEEN_OFFERS,
} = require('../../src/domain/drawOffer');

/** A game with `plies` moves played (the entries' content does not matter here). */
const game = (plies, extra = {}) => ({ moveLog: Array.from({ length: plies }, () => ({})), ...extra });

describe('canOfferDraw', () => {
    test('not before both sides have moved', () => {
        expect(drawOfferRejection(game(0), 'white')).toBe('draw_offer_too_soon');
        expect(drawOfferRejection(game(1), 'black')).toBe('draw_offer_too_soon');
        expect(drawOfferRejection({}, 'white')).toBe('draw_offer_too_soon');
        expect(canOfferDraw(game(2), 'white')).toBe(true);
        expect(canOfferDraw(game(2), 'black')).toBe(true);
    });

    test('one standing offer at a time, whoever made it', () => {
        const g = game(6, { drawOffer: { by: 'white', at: 1, ply: 6 } });
        expect(drawOfferRejection(g, 'white')).toBe('draw_offer_pending');
        expect(drawOfferRejection(g, 'black')).toBe('draw_offer_pending');
    });

    test('again only after two moves of your own since your last offer', () => {
        expect(OWN_MOVES_BETWEEN_OFFERS).toBe(2);
        // White offered at ply 2 (White to move): White's own moves are plies 2, 4, 6…
        const last = { lastDrawOfferPly: { white: 2 } };
        expect(drawOfferRejection(game(2, last), 'white')).toBe('draw_offer_too_soon');
        expect(drawOfferRejection(game(3, last), 'white')).toBe('draw_offer_too_soon'); // 1 own move
        expect(drawOfferRejection(game(4, last), 'white')).toBe('draw_offer_too_soon'); // still 1
        expect(canOfferDraw(game(5, last), 'white')).toBe(true); // plies 2 and 4: 2 own moves
        // The opponent's cadence is its own.
        expect(canOfferDraw(game(2, last), 'black')).toBe(true);
    });

    test('Black counts its own (odd) plies', () => {
        const last = { lastDrawOfferPly: { black: 3 } };
        expect(drawOfferRejection(game(5, last), 'black')).toBe('draw_offer_too_soon'); // ply 3 only
        expect(canOfferDraw(game(6, last), 'black')).toBe(true); // plies 3 and 5
    });
});

test('withDrawOffer stores the offer and the ply it was made at, keeping the other side', () => {
    expect(withDrawOffer(game(7, { lastDrawOfferPly: { white: 2 } }), 'black', 99)).toEqual({
        drawOffer: { by: 'black', at: 99, ply: 7 },
        lastDrawOfferPly: { white: 2, black: 7 },
    });
});

test('hasOfferFor: only the opponent of the offering side may answer', () => {
    const g = game(4, { drawOffer: { by: 'white', at: 1, ply: 4 } });
    expect(hasOfferFor(g, 'black')).toBe(true);
    expect(hasOfferFor(g, 'white')).toBe(false);
    expect(hasOfferFor(game(4), 'black')).toBe(false);
});
