/**
 * src/services/ratingService.js with an in-memory profiles port.
 */
const { createRatingService } = require('../../src/services/ratingService');
const { result } = require('./fakes');
const { log } = require('../../src/observability/log');

function profile(id, extra = {}) {
    return { id, rating_rapid: 1500, rating_blitz: 1400, games_played: 10, wins: 5, losses: 4, draws: 1, ...extra };
}

function repoWith(profiles) {
    return {
        findRatingsByIds: jest.fn(() => result(profiles)),
        // RATING-ATOMIC: the only write is the database function.
        applyGameResult: jest.fn(() => result('applied', null)),
    };
}

const serviceOn = (repo) => createRatingService({ profilesRepo: repo, gameResultsRepo: repo });

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('rated win: one apply_game_result call with the read and the new values; returns capped changes', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    const changes = await serviceOn(repo).processGameEnd('g', 'w', 'b', 'white', '10', true);

    expect(repo.findRatingsByIds).toHaveBeenCalledWith(['w', 'b']);
    expect(changes.white.change).toBeGreaterThan(0);
    expect(changes.white.change).toBe(-changes.black.change);
    expect(repo.applyGameResult).toHaveBeenCalledTimes(1);
    const [args] = repo.applyGameResult.mock.calls[0];
    expect(args).toMatchObject({ gameId: 'g', whiteId: 'w', blackId: 'b', result: 'white', ratingField: 'rating_rapid' });
    // Stats are incremented by the function itself; the server sends what it read (for the
    // compare-and-set) and the new rating, RD and volatility.
    expect(Object.keys(args.white)).toEqual([
        'old_rating',
        'old_rd',
        'old_vol',
        'old_games_played',
        'new_rating',
        'new_rd',
        'new_vol',
    ]);
    expect(args.white).toMatchObject({ old_rating: 1500, old_rd: null, old_vol: null, old_games_played: 10 });
    expect(args.white.new_rating).toBe(changes.white.newRating);
    expect(args.black.new_rating).toBe(changes.black.newRating);
});

test('unrated game: stats only (no rating field), returns null', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    expect(await serviceOn(repo).processGameEnd('g', 'w', 'b', 'draw', '3', false)).toBeNull();
    expect(repo.applyGameResult).toHaveBeenCalledWith({
        gameId: 'g',
        whiteId: 'w',
        blackId: 'b',
        result: 'draw',
        ratingField: null,
        white: null,
        black: null,
    });
});

test('a missing profile → null, no writes', async () => {
    const repo = repoWith([profile('w')]);
    expect(await serviceOn(repo).processGameEnd('g', 'w', 'b', 'white', '10')).toBeNull();
    expect(repo.applyGameResult).not.toHaveBeenCalled();
});

test('a refused apply is logged and yields null; a thrown error yields null', async () => {
    const repo = repoWith([profile('w'), profile('b')]);
    repo.applyGameResult.mockReturnValueOnce(result(null, { message: 'rls' }));
    expect(await serviceOn(repo).processGameEnd('g', 'w', 'b', 'white', '10')).toBeNull();
    expect(log.error).toHaveBeenCalledWith('[rating] game g: not applied:', 'rls');

    repo.findRatingsByIds.mockImplementation(() => {
        throw new Error('down');
    });
    expect(await serviceOn(repo).processGameEnd('g', 'w', 'b', 'white', '10')).toBeNull();
    expect(log.error).toHaveBeenCalledWith('[rating] processGameEnd error:', 'down');
});

test('_ratingField follows the time control', () => {
    const svc = serviceOn(repoWith([]));
    expect(svc._ratingField('1+0')).toBe('rating_bullet');
    expect(svc._ratingField('90')).toBe('rating_classical');
});

test('rating function errors raise an alert in the error tracker (SEC-12) [OBSERVABILITY]', async () => {
    const { setErrorReporter } = require('../../src/observability/errorReporter');
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    try {
        const repo = repoWith([profile('w'), profile('b')]);
        repo.applyGameResult.mockReturnValueOnce(result(null, { message: 'rls' }));
        await serviceOn(repo).processGameEnd('g', 'w', 'b', 'white', '10');
        repo.findRatingsByIds.mockImplementation(() => {
            throw new Error('down');
        });
        await serviceOn(repo).processGameEnd('g2', 'w', 'b', 'white', '10');
        expect(report.mock.calls).toEqual([
            [{ message: 'rls' }, { where: 'rating', gameId: 'g' }],
            [new Error('down'), { where: 'rating', gameId: 'g2' }],
        ]);
    } finally {
        setErrorReporter(undefined);
    }
});
