/**
 * RATING-ATOMIC (NODE-18, TEST-06): a finished game is applied to the profiles
 * once, and two games of the same player that finish at the same time both
 * count. Runs the real rating service against fakeRatingDb, which mirrors
 * public.apply_game_result (compare-and-set + games.rated_at).
 *
 * TEST-06 asks for concurrency tests against two server instances sharing one
 * Redis and a real database; that harness does not exist yet (later item).
 */
const { createRatingService } = require('../../src/services/ratingService');
const { fakeRatingDb } = require('./fakes');

const player = (id, rating) => ({
    id,
    rating_rapid: rating,
    rating_blitz: 1200,
    rating_rd: 100,
    rating_vol: 0.06,
    games_played: 10,
    wins: 5,
    losses: 4,
    draws: 1,
});

const seed = () => ({
    profiles: [player('p', 1500), player('a', 1450), player('b', 1600)],
    games: [
        { id: 'g1', status: 'completed', white_id: 'p', black_id: 'a', result: 'white' },
        { id: 'g2', status: 'completed', white_id: 'b', black_id: 'p', result: 'black' },
    ],
});

function serviceOn(db) {
    return createRatingService({ profilesRepo: db.profilesRepo, gameResultsRepo: db.gameResultsRepo });
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('two games of the same player finishing concurrently both count (no lost update)', async () => {
    const db = fakeRatingDb(seed());
    const svc = serviceOn(db);

    const [c1, c2] = await Promise.all([
        svc.processGameEnd('g1', 'p', 'a', 'white', '10', true),
        svc.processGameEnd('g2', 'b', 'p', 'black', '10', true),
    ]);

    // The same two games applied one after the other: the only correct end state.
    const ref = fakeRatingDb(seed());
    const refSvc = serviceOn(ref);
    await refSvc.processGameEnd('g1', 'p', 'a', 'white', '10', true);
    await refSvc.processGameEnd('g2', 'b', 'p', 'black', '10', true);

    const p = db.profileRows.get('p');
    expect(p).toMatchObject({ games_played: 12, wins: 7, losses: 4, draws: 1 });
    expect(p).toEqual(ref.profileRows.get('p'));
    expect(db.profileRows.get('a')).toEqual(ref.profileRows.get('a'));
    expect(db.profileRows.get('b')).toEqual(ref.profileRows.get('b'));
    // Both games report a change, and the second one starts where the first ended.
    expect(c1.white.newRating).toBe(c2.black.oldRating);
    expect(c2.black.newRating).toBe(p.rating_rapid);
    expect(db.gameRows.get('g1').rated_at).not.toBeNull();
    expect(db.gameRows.get('g2').rated_at).not.toBeNull();
});

test('rating one game twice applies it once; the second call returns null (no second broadcast)', async () => {
    const db = fakeRatingDb(seed());
    const svc = serviceOn(db);

    const first = await svc.processGameEnd('g1', 'p', 'a', 'white', '10', true);
    const after = { ...db.profileRows.get('p') };
    const second = await svc.processGameEnd('g1', 'p', 'a', 'white', '10', true);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(db.profileRows.get('p')).toEqual(after);
    expect(after.games_played).toBe(11);
});

test('rating one game twice at the same time applies it once', async () => {
    const db = fakeRatingDb(seed());
    const svc = serviceOn(db);

    const results = await Promise.all([
        svc.processGameEnd('g1', 'p', 'a', 'white', '10', true),
        svc.processGameEnd('g1', 'p', 'a', 'white', '10', true),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.profileRows.get('p')).toMatchObject({ games_played: 11, wins: 6 });
    expect(db.profileRows.get('a')).toMatchObject({ games_played: 11, losses: 5 });
});

test('unrated game: stats only, through the function, without reading the profiles', async () => {
    const db = fakeRatingDb({
        ...seed(),
        games: [{ id: 'g3', status: 'completed', is_rated: false, white_id: 'p', black_id: 'a', result: 'draw' }],
    });
    const res = await serviceOn(db).processGameEnd('g3', 'p', 'a', 'draw', '10', false);

    expect(res).toBeNull();
    expect(db.profilesRepo.findRatingsByIds).not.toHaveBeenCalled();
    expect(db.gameResultsRepo.applyGameResult).toHaveBeenCalledWith({
        gameId: 'g3',
        whiteId: 'p',
        blackId: 'a',
        result: 'draw',
        ratingField: null,
        white: null,
        black: null,
    });
    expect(db.profileRows.get('p')).toMatchObject({ games_played: 11, draws: 2, rating_rapid: 1500, rating_rd: 100 });
    expect(db.gameRows.get('g3').rated_at).not.toBeNull();
});

test('a refused call (e.g. aborted game) writes nothing, is logged and yields null', async () => {
    const db = fakeRatingDb({
        ...seed(),
        games: [{ id: 'g4', status: 'aborted', white_id: 'p', black_id: 'a', result: null }],
    });
    const res = await serviceOn(db).processGameEnd('g4', 'p', 'a', 'white', '10', true);

    expect(res).toBeNull();
    expect(db.profileRows.get('p')).toEqual(player('p', 1500));
    expect(console.error).toHaveBeenCalledWith('[rating] game g4: not applied:', 'game is aborted, not completed');
});

test('stale inputs are recomputed a bounded number of times, then the game is left unrated', async () => {
    const db = fakeRatingDb(seed());
    // A reader that always sees an outdated snapshot: every attempt is stale.
    db.profilesRepo.findRatingsByIds.mockImplementation(async () => ({
        data: [
            { ...player('p', 1500), games_played: 9 },
            { ...player('a', 1450), games_played: 9 },
        ],
        error: null,
    }));
    const res = await serviceOn(db).processGameEnd('g1', 'p', 'a', 'white', '10', true);

    expect(res).toBeNull();
    expect(db.gameResultsRepo.applyGameResult).toHaveBeenCalledTimes(5);
    expect(db.profileRows.get('p')).toEqual(player('p', 1500));
    expect(db.gameRows.get('g1').rated_at).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
        '[rating] game g1: profiles kept changing, not rated after 5 attempts',
    );
});
