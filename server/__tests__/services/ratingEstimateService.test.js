/**
 * src/services/ratingEstimateService.js: the resign dialog's "about N rating points" [F-133].
 */
const { createRatingEstimateService } = require('../../src/services/ratingEstimateService');
const { createRatingService } = require('../../src/services/ratingService');
const { fakeGameStore, result } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

function setup(game, profiles) {
    const repo = { findRatingsByIds: jest.fn(() => result(profiles)), applyGameResult: jest.fn() };
    const ratingService = createRatingService({ profilesRepo: repo, gameResultsRepo: repo });
    const svc = createRatingEstimateService({ gameStore: fakeGameStore(game ? { g: game } : {}), ratingService });
    return { svc, repo, ratingService };
}

const profiles = [
    { id: 'white-user', rating_rapid: 1500, rating_rd: 60, rating_vol: 0.06 },
    { id: 'black-user', rating_rapid: 1500, rating_rd: 60, rating_vol: 0.06 },
];

test('a player of a rated live game: the points a loss would cost, from real Glicko-2, nothing written', async () => {
    const { svc, repo, ratingService } = setup(makeGame({ id: 'g', timeControl: '10' }), profiles);
    const ack = await svc.lossIfResigned({ game_id: 'g' }, 'white-user');
    const loss = await ratingService.estimate({ whiteId: 'white-user', blackId: 'black-user', timeControl: '10', result: 'black' });
    expect(ack).toEqual({ ok: true, rated: true, points: -loss.white.change });
    expect(ack.points).toBeGreaterThan(0);
    expect(repo.applyGameResult).not.toHaveBeenCalled();
});

test('Black resigning loses its own points', async () => {
    const lower = [profiles[0], { ...profiles[1], rating_rapid: 1300 }];
    const { svc } = setup(makeGame({ id: 'g', timeControl: '10' }), lower);
    const black = await svc.lossIfResigned({ game_id: 'g' }, 'black-user');
    const white = await svc.lossIfResigned({ game_id: 'g' }, 'white-user');
    // The lower-rated side loses fewer points for losing than the favourite does.
    expect(black.points).toBeLessThan(white.points);
});

test('an unrated game: no figure', async () => {
    const { svc, repo } = setup(makeGame({ id: 'g', isRated: false }), profiles);
    expect(await svc.lossIfResigned({ game_id: 'g' }, 'white-user')).toEqual({ ok: true, rated: false });
    expect(repo.findRatingsByIds).not.toHaveBeenCalled();
});

test.each([
    ['a spectator', makeGame({ id: 'g' }), 'stranger', 'not_a_player'],
    ['a finished game', makeGame({ id: 'g', status: 'completed' }), 'white-user', 'game_not_active'],
    ['an unknown game', null, 'white-user', 'game_not_found'],
])('refused for %s (participants of a live game only)', async (_label, game, userId, error) => {
    const { svc, repo } = setup(game, profiles);
    expect(await svc.lossIfResigned({ game_id: 'g' }, userId)).toEqual({ ok: false, error });
    expect(repo.findRatingsByIds).not.toHaveBeenCalled();
});

test('missing profiles: an error, never a made-up figure', async () => {
    const { svc } = setup(makeGame({ id: 'g' }), [profiles[0]]);
    expect(await svc.lossIfResigned({ game_id: 'g' }, 'white-user')).toEqual({ ok: false, error: 'estimate_unavailable' });
});
