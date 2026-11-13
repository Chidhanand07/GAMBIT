/**
 * src/services/reviewService.js with a fake engine port.
 */
const { createReviewService } = require('../../src/services/reviewService');
const { flush } = require('./fakes');
const { log } = require('../../src/observability/log');

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('no SAN moves → no engine call', () => {
    const engineClient = { analyseGame: jest.fn() };
    createReviewService({ engineClient }).triggerGameReview('g', [{ move: 'e2e4' }], '10');
    expect(engineClient.analyseGame).not.toHaveBeenCalled();
});

test('sends the PGN with a string time control (default "10")', () => {
    const engineClient = { analyseGame: jest.fn(async () => ({ ok: true, status: 200 })) };
    createReviewService({ engineClient }).triggerGameReview('g', [{ san: 'e4' }], undefined);
    expect(engineClient.analyseGame).toHaveBeenCalledWith({
        gameId: 'g',
        pgn: '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n1. e4 *',
        timeControl: '10',
    });
});

test('engine errors are warnings, never thrown', async () => {
    const engineClient = { analyseGame: jest.fn(async () => ({ ok: false, status: 503 })) };
    createReviewService({ engineClient }).triggerGameReview('g', [{ san: 'e4' }], 5);
    await flush();
    expect(log.warn).toHaveBeenCalledWith('[game_review] engine returned', 503);

    engineClient.analyseGame.mockRejectedValue(new Error('ECONNREFUSED'));
    createReviewService({ engineClient }).triggerGameReview('g', [{ san: 'e4' }], 5);
    await flush();
    expect(log.warn).toHaveBeenCalledWith('[game_review] trigger failed:', 'ECONNREFUSED');
});
