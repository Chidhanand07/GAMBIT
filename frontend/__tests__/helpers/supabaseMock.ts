/**
 * Chainable in-memory fake of the Supabase client for API route tests.
 *
 * Every `from(table)` query is recorded in `calls` as { table, ops }. Awaiting
 * a query resolves to the next result queued for that table with `queue()`,
 * or `{ data: null, error: null }` when nothing is queued.
 */

export type Op = [string, ...any[]]
export type Call = { table: string; ops: Op[] }
export type Result = { data: any; error: any; count?: number }
type Entry = Result | ((call: Call) => Result)

const CHAIN = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'not', 'match',
    'like', 'ilike', 'filter', 'order', 'limit', 'range',
]
const TERMINAL = ['single', 'maybeSingle']

export function createSupabaseMock() {
    const queues = new Map<string, Entry[]>()
    const calls: Call[] = []

    const next = (call: Call): Promise<Result> => {
        const q = queues.get(call.table)
        const entry = q && q.length ? q.shift()! : { data: null, error: null }
        return Promise.resolve(typeof entry === 'function' ? entry(call) : entry)
    }

    const from = jest.fn((table: string) => {
        const call: Call = { table, ops: [] }
        calls.push(call)
        const b: any = {}
        for (const m of CHAIN) b[m] = (...a: any[]) => { call.ops.push([m, ...a]); return b }
        for (const m of TERMINAL) b[m] = (...a: any[]) => { call.ops.push([m, ...a]); return next(call) }
        b.then = (ok: any, err: any) => next(call).then(ok, err)
        return b
    })

    const client = {
        from,
        calls,
        auth: {
            getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
            /** Verified JWT claims (NX-10). Default: nothing verifies. */
            getClaims: jest.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
            getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
            signInWithPassword: jest.fn(async () => ({ data: { session: null }, error: null })),
            admin: {
                createUser: jest.fn(async () => ({ data: { user: null }, error: null })),
                deleteUser: jest.fn(async () => ({ data: null, error: null })),
                getUserById: jest.fn(async () => ({ data: { user: null }, error: null })),
            },
        },
        queue(table: string, ...entries: Entry[]) {
            if (!queues.has(table)) queues.set(table, [])
            queues.get(table)!.push(...entries)
            return client
        },
        callsFor(table: string) {
            return calls.filter(c => c.table === table)
        },
        op(call: Call | undefined, method: string): any[] | undefined {
            const found = call?.ops.find(o => o[0] === method)
            return found ? found.slice(1) : undefined
        },
        /** A genuine session: the claims verify, and Supabase Auth also confirms the user. */
        signIn(userId: string) {
            client.auth.getClaims.mockResolvedValue({ data: { claims: { sub: userId } }, error: null })
            client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } as any }, error: null })
            client.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } as any, error: null })
        },
        reset() {
            queues.clear()
            calls.length = 0
            from.mockClear()
            client.auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null })
            client.auth.getClaims.mockReset().mockResolvedValue({ data: null, error: null })
            client.auth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null })
            client.auth.signInWithPassword.mockReset().mockResolvedValue({ data: { session: null }, error: null })
            client.auth.admin.createUser.mockReset().mockResolvedValue({ data: { user: null }, error: null })
            client.auth.admin.deleteUser.mockReset().mockResolvedValue({ data: null, error: null })
            client.auth.admin.getUserById.mockReset().mockResolvedValue({ data: { user: null }, error: null })
        },
    }
    return client
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
