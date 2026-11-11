/**
 * src/services/ratingService.js with an in-memory profiles port.
 */
const { createRatingService } = require('../../src/services/ratingService');
const { result } = require('./fakes');

function profile(id, extra = {}) {
    return { id, rating_rapid: 1500, rating_blitz: 1400, games_played: 10, wins: 5, losses: 4, draws: 1, ...extra };
}

function repoWith(profiles) {
    return {
        findRatingsByIds: jest.fn(() => result(profiles)),
        updateById: jest.fn(() => result(null, null)),
    };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('rated win: updates both rows and returns capped changes', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    const changes = await createRatingService({ profilesRepo: repo }).processGameEnd(
        'g',
        'w',
        'b',
        'white',
        '10',
        true,
    );

    expect(repo.findRatingsByIds).toHaveBeenCalledWith(['w', 'b']);
    expect(changes.white.change).toBeGreaterThan(0);
    expect(changes.white.change).toBe(-changes.black.change);
    const [whiteRow, blackRow] = repo.updateById.mock.calls;
    expect(whiteRow[0]).toBe('w');
    expect(whiteRow[1]).toMatchObject({ games_played: 11, wins: 6, rating_rapid: changes.white.newRating });
    expect(Object.keys(whiteRow[1])).toEqual([
        'games_played',
        'wins',
        'losses',
        'draws',
        'rating_rapid',
        'rating_rd',
        'rating_vol',
    ]);
    expect(blackRow[1]).toMatchObject({ losses: 5, rating_rapid: changes.black.newRating });
});

test('unrated game: stats only, returns null', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    expect(
        await createRatingService({ profilesRepo: repo }).processGameEnd('g', 'w', 'b', 'draw', '3', false),
    ).toBeNull();
    expect(repo.updateById.mock.calls[0][1]).toEqual({ games_played: 11, wins: 5, losses: 4, draws: 2 });
});

test('a missing profile → null, no writes', async () => {
    const repo = repoWith([profile('w')]);
    expect(await createRatingService({ profilesRepo: repo }).processGameEnd('g', 'w', 'b', 'white', '10')).toBeNull();
    expect(repo.updateById).not.toHaveBeenCalled();
});

test('update errors are logged; a thrown error yields null', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    repo.updateById.mockReturnValueOnce(result(null, { message: 'rls' }));
    await createRatingService({ profilesRepo: repo }).processGameEnd('g', 'w', 'b', 'white', '10');
    expect(console.error).toHaveBeenCalledWith('[rating] white update error:', 'rls');

    repo.findRatingsByIds.mockImplementation(() => {
        throw new Error('down');
    });
    expect(await createRatingService({ profilesRepo: repo }).processGameEnd('g', 'w', 'b', 'white', '10')).toBeNull();
    expect(console.error).toHaveBeenCalledWith('[rating] processGameEnd error:', 'down');
});

test('_ratingField follows the time control', () => {
    const svc = createRatingService({ profilesRepo: repoWith([]) });
    expect(svc._ratingField('1+0')).toBe('rating_bullet');
    expect(svc._ratingField('90')).toBe('rating_classical');
});
