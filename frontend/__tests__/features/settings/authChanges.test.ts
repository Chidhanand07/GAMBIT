// F-168: the settings provider sits in the root layout; its auth watcher loads supabase-js on first
// use (the landing keeps it off the first paint, F-111) and can be unsubscribed before it loads.
const onAuthStateChange = jest.fn()
const unsubscribe = jest.fn()
let resolveClient: ((c: unknown) => void) | null = null
jest.mock('@/lib/supabase/lazyClient', () => ({
    loadBrowserClient: () => new Promise((resolve) => { resolveClient = resolve }),
}))
jest.mock('@/lib/supabase/client', () => { throw new Error('the eager client must not be imported') })

import { subscribeToAuthChanges } from '@/features/settings/authChanges'

const client = {
    auth: {
        onAuthStateChange: (cb: (e: string) => void) => {
            onAuthStateChange(cb)
            return { data: { subscription: { unsubscribe } } }
        },
    },
}
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => jest.clearAllMocks())

test('subscribes once the lazy client arrives, and reloads on sign-in / sign-out / update only', async () => {
    const onChange = jest.fn()
    const stop = subscribeToAuthChanges(onChange)
    expect(onAuthStateChange).not.toHaveBeenCalled()
    resolveClient!(client)
    await flush()
    const cb = onAuthStateChange.mock.calls[0][0]
    cb('SIGNED_IN'); cb('TOKEN_REFRESHED'); cb('SIGNED_OUT'); cb('USER_UPDATED')
    expect(onChange).toHaveBeenCalledTimes(3)
    stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
})

test('stopped before the client loads: never subscribes', async () => {
    const stop = subscribeToAuthChanges(jest.fn())
    stop()
    resolveClient!(client)
    await flush()
    expect(onAuthStateChange).not.toHaveBeenCalled()
})
