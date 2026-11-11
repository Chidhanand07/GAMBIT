/**
 * Chainable in-memory fake of the Supabase JS client.
 *
 * Every query (`supabase.from(table)...`) is recorded in `supabase.calls` as
 * `{ table, ops: [[method, ...args], ...] }`. When the query is awaited it
 * resolves to the next result queued for that table with `supabase.queue()`,
 * or to `{ data: null, error: null }` when nothing is queued.
 *
 * Usage in a test file:
 *   jest.mock('../supabase', () => ({
 *       supabase: require('./helpers/mockSupabase').createSupabaseMock(),
 *   }));
 *   const { supabase } = require('../supabase');
 *   supabase.queue('profiles', { data: [...], error: null });
 */

const CHAIN_METHODS = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'not', 'match',
    'like', 'ilike', 'filter', 'order', 'limit', 'range',
];
const TERMINAL_METHODS = ['single', 'maybeSingle'];

const EMPTY = Object.freeze({ data: null, error: null });

function createSupabaseMock() {
    const queues = new Map();
    const calls = [];

    function nextResult(call) {
        const q = queues.get(call.table);
        const entry = q && q.length ? q.shift() : EMPTY;
        const result = typeof entry === 'function' ? entry(call) : entry;
        return Promise.resolve(result);
    }

    function from(table) {
        const call = { table, ops: [] };
        calls.push(call);
        const builder = {};
        for (const m of CHAIN_METHODS) {
            builder[m] = (...args) => { call.ops.push([m, ...args]); return builder; };
        }
        for (const m of TERMINAL_METHODS) {
            builder[m] = (...args) => { call.ops.push([m, ...args]); return nextResult(call); };
        }
        builder.then = (onOk, onErr) => nextResult(call).then(onOk, onErr);
        return builder;
    }

    const supabase = {
        from: jest.fn(from),
        auth: {
            getUser: jest.fn(async () => ({ data: { user: null }, error: { message: 'no user' } })),
        },
        calls,

        /** Queue one or more results (objects or `(call) => result` functions) for a table. */
        queue(table, ...results) {
            if (!queues.has(table)) queues.set(table, []);
            queues.get(table).push(...results);
            return supabase;
        },

        /** All recorded calls for a table. */
        callsFor(table) {
            return calls.filter(c => c.table === table);
        },

        /** Arguments of the first op named `method` in a call, or undefined. */
        op(call, method) {
            const found = call.ops.find(o => o[0] === method);
            return found ? found.slice(1) : undefined;
        },

        /** Make `auth.getUser(token)` succeed for the given token → userId map. */
        setUsers(tokenToUserId) {
            supabase.auth.getUser.mockImplementation(async (token) => {
                const id = tokenToUserId[token];
                return id
                    ? { data: { user: { id } }, error: null }
                    : { data: { user: null }, error: { message: 'invalid token' } };
            });
        },

        reset() {
            queues.clear();
            calls.length = 0;
            supabase.from.mockClear();
            supabase.auth.getUser.mockReset();
            supabase.auth.getUser.mockImplementation(
                async () => ({ data: { user: null }, error: { message: 'no user' } })
            );
        },
    };

    return supabase;
}

module.exports = { createSupabaseMock };
