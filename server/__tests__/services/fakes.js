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

module.exports = { fakeEmitter, fakeClient, fakeGameStore, result, flush };
