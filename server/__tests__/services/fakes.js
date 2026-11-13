/**
 * In-memory fakes for the ports services receive (no jest.mock needed: SOLID-07).
 */

/** Records `toRoom` / `toAll` calls as `{ room, event, args }`. */
function fakeEmitter() {
    const sent = [];
    return {
        sent,
        toRoom: (room, event, ...args) => sent.push({ room, event, args }),
        toAll: (event, ...args) => sent.push({ room: '*', event, args }),
        named: (event) => sent.filter((e) => e.event === event),
    };
}

/** A ClientPort that records joins and direct emits. */
function fakeClient(id = 'sock-1') {
    const joined = [];
    const emitted = [];
    return {
        id,
        joined,
        emitted,
        join: (room) => joined.push(room),
        emit: (event, ...args) => emitted.push({ event, args }),
    };
}

/** Map-backed game store with the gameStore API. */
function fakeGameStore(games = {}) {
    const state = new Map(Object.entries(games));
    const active = new Set();
    return {
        state,
        active,
        getGame: jest.fn(async (id) => (state.has(id) ? structuredClone(state.get(id)) : null)),
        setGame: jest.fn(async (id, game) => {
            state.set(id, structuredClone(game));
            return game;
        }),
        updateGame: jest.fn(async (id, updates) => {
            const merged = { ...state.get(id), ...updates };
            state.set(id, merged);
            return merged;
        }),
        /** Same contract as the Redis repository: null in for unknown, null out = no write. */
        mutateGame: jest.fn(async (id, mutate) => {
            const next = await mutate(state.has(id) ? structuredClone(state.get(id)) : null);
            if (!next) return null;
            state.set(id, structuredClone(next));
            return next;
        }),
        addActiveGame: jest.fn(async (id) => {
            active.add(id);
        }),
        removeActiveGame: jest.fn(async (id) => {
            active.delete(id);
        }),
        getActiveGameIds: jest.fn(async () => [...active]),
    };
}

/** A resolved Supabase-style result. */
const result = (data = null, error = null) => Promise.resolve({ data, error });

/** Lets fire-and-forget promise chains settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const RATING_FIELDS = ['rating_bullet', 'rating_blitz', 'rating_rapid', 'rating_classical'];

/**
 * In-memory stand-in for the `profiles` / `games` tables and
 * `public.apply_game_result` (supabase/migrations/20261113100000_rating_atomic.sql):
 * same refusals, same compare-and-set, same `rated_at` guard. Each call is
 * applied in one synchronous step, as the row locks make it in Postgres.
 * `profilesRepo.updateById` is the old unconditional write, kept so a service
 * that still read-modify-writes can be shown to lose updates.
 * @param {{ profiles: object[], games: object[] }} seed
 */
function fakeRatingDb({ profiles, games }) {
    const profileRows = new Map(profiles.map((p) => [p.id, { ...p }]));
    const gameRows = new Map(games.map((g) => [g.id, { rated_at: null, is_rated: true, ...g }]));
    const refuse = (message) => ({ data: null, error: { message } });

    /** @returns {{ data: string | null, error: { message: string } | null }} */
    function apply({ gameId, whiteId, blackId, result: outcome, ratingField = null, white = null, black = null }) {
        const game = gameRows.get(gameId);
        if (!game) return refuse('game not found');
        if (game.status !== 'completed') return refuse(`game is ${game.status}, not completed`);
        if (game.white_id !== whiteId || game.black_id !== blackId) return refuse('players do not match');
        if (game.result !== outcome) return refuse('result does not match');
        if (ratingField !== null && !RATING_FIELDS.includes(ratingField)) return refuse('unknown rating field');
        if (ratingField !== null && game.is_rated !== true) return refuse('game is not rated');
        if (game.rated_at) return { data: 'already_applied', error: null };
        const sides = [
            { row: profileRows.get(whiteId), color: 'white', vals: white },
            { row: profileRows.get(blackId), color: 'black', vals: black },
        ];
        if (sides.some((s) => !s.row)) return refuse('profile not found');
        const same = (stored, expected) => (stored ?? null) === (expected ?? null);
        const stale =
            ratingField !== null &&
            sides.some(
                ({ row, vals }) =>
                    !same(row[ratingField], vals.old_rating) ||
                    !same(row.rating_rd, vals.old_rd) ||
                    !same(row.rating_vol, vals.old_vol) ||
                    !same(row.games_played, vals.old_games_played),
            );
        if (stale) return { data: 'stale', error: null };
        for (const { row, color, vals } of sides) {
            row.games_played = (row.games_played ?? 0) + 1;
            row.wins = (row.wins ?? 0) + (outcome === color ? 1 : 0);
            row.losses = (row.losses ?? 0) + (outcome !== color && outcome !== 'draw' ? 1 : 0);
            row.draws = (row.draws ?? 0) + (outcome === 'draw' ? 1 : 0);
            if (ratingField !== null) {
                row[ratingField] = vals.new_rating;
                row.rating_rd = vals.new_rd;
                row.rating_vol = vals.new_vol;
            }
        }
        game.rated_at = new Date().toISOString();
        return { data: 'applied', error: null };
    }

    return {
        profileRows,
        gameRows,
        profilesRepo: {
            findRatingsByIds: jest.fn(async (ids) => ({
                data: ids.filter((id) => profileRows.has(id)).map((id) => ({ ...profileRows.get(id) })),
                error: null,
            })),
            updateById: jest.fn(async (id, fields) => {
                Object.assign(profileRows.get(id), fields);
                return { data: null, error: null };
            }),
        },
        gameResultsRepo: { applyGameResult: jest.fn(async (args) => apply(args)) },
    };
}

module.exports = { fakeEmitter, fakeClient, fakeGameStore, fakeRatingDb, result, flush };
