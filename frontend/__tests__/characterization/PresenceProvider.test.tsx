/**
 * Characterization tests (fe-misc, PR 16 track) for components/PresenceProvider.tsx.
 */
import { act, render, screen } from '@testing-library/react'

// ── Supabase client double: realtime presence channel ──
let subscribeCb: ((status: string) => Promise<void>) | null = null
const channelOps: any[] = []
let presence: Record<string, unknown> = {}
const presenceHandlers: Record<string, () => void> = {}
const channel: any = {
    on: jest.fn((type: string, filter: { event: string }, cb: () => void) => {
        channelOps.push(['on', type, filter.event])
        presenceHandlers[filter.event] = cb
        return channel
    }),
    subscribe: jest.fn((cb: any) => { channelOps.push(['subscribe']); subscribeCb = cb; return channel }),
    track: jest.fn(async (p: any) => { channelOps.push(['track', p]) }),
    untrack: jest.fn(async () => { channelOps.push(['untrack']) }),
    presenceState: () => presence,
}
const supabase = {
    channel: jest.fn((name: string, opts: any) => { channelOps.push(['channel', name, opts]); return channel }),
    removeChannel: jest.fn((c: any) => { channelOps.push(['removeChannel', c === channel]) }),
}
jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))

let pathname = '/lobby'
jest.mock('next/navigation', () => ({ usePathname: () => pathname }))

let profile: any = null
let loading = false
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, loading }) }))

import PresenceProvider, { usePresence } from '@/components/PresenceProvider'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

beforeEach(() => {
    jest.clearAllMocks()
    subscribeCb = null
    channelOps.length = 0
    presence = {}
    loading = false
})

describe('PresenceProvider', () => {
    function Count() {
        return <div data-testid="count">{usePresence().onlineCount}</div>
    }

    // was: 'signed out: no channel, count defaults to 1' — [F-104] a guest listens to the channel
    // without joining it, so the count the mockups show is the real one (0 when nobody is online).
    test('signed out: listens to the channel without tracking; the count is the real number', async () => {
        profile = null
        render(<PresenceProvider><Count /></PresenceProvider>)
        expect(screen.getByTestId('count')).toHaveTextContent('0')
        await flush() // the Supabase client loads lazily (F-111)
        await act(async () => { await subscribeCb!('SUBSCRIBED') })
        expect(channelOps).toEqual([
            ['channel', 'gambit-online-users', undefined],
            ['on', 'presence', 'sync'],
            ['on', 'presence', 'join'],
            ['on', 'presence', 'leave'],
            ['subscribe'],
        ])
        expect(channel.track).not.toHaveBeenCalled()
        presence = { a: [], b: [] }
        act(() => presenceHandlers.sync())
        expect(screen.getByTestId('count')).toHaveTextContent('2')
    })

    test('[F-104] waits for the session before subscribing; a guest leaves without untrack', async () => {
        profile = null
        loading = true
        const { rerender, unmount } = render(<PresenceProvider><Count /></PresenceProvider>)
        expect(supabase.channel).not.toHaveBeenCalled()
        await flush()
        expect(supabase.channel).not.toHaveBeenCalled()
        loading = false
        rerender(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        expect(supabase.channel).toHaveBeenCalledTimes(1)
        unmount()
        await flush()
        expect(channel.untrack).not.toHaveBeenCalled()
        expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    })

    test('joins the presence channel, tracks on SUBSCRIBED and counts keys (min 1)', async () => {
        profile = { id: 'u1', username: '' }
        render(<PresenceProvider><Count /></PresenceProvider>)
        await flush() // the Supabase client loads lazily (F-111)
        await act(async () => { await subscribeCb!('CHANNEL_ERROR') })
        await act(async () => { await subscribeCb!('SUBSCRIBED') })
        expect(channelOps).toEqual([
            ['channel', 'gambit-online-users', { config: { presence: { key: 'u1' } } }],
            ['on', 'presence', 'sync'],
            ['on', 'presence', 'join'],
            ['on', 'presence', 'leave'],
            ['subscribe'],
            ['track', { user_id: 'u1', username: 'unknown' }],
        ])
        presence = { a: [], b: [], c: [] }
        act(() => presenceHandlers.join())
        expect(screen.getByTestId('count')).toHaveTextContent('3')
        presence = {}
        act(() => presenceHandlers.sync())
        expect(screen.getByTestId('count')).toHaveTextContent('1')
    })

    test('re-subscribes only when the profile id changes; cleanup untracks then removes', async () => {
        profile = { id: 'u1', username: 'alice' }
        const { rerender, unmount } = render(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        profile = { id: 'u1', username: 'renamed' }
        rerender(<PresenceProvider><Count /></PresenceProvider>)
        expect(supabase.channel).toHaveBeenCalledTimes(1)
        profile = { id: 'u2', username: 'bob' }
        rerender(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        expect(supabase.channel).toHaveBeenCalledTimes(2)
        expect(channelOps.filter(o => o[0] === 'untrack' || o[0] === 'removeChannel')).toEqual([['untrack'], ['removeChannel', true]])
        unmount()
        await flush()
        expect(supabase.removeChannel).toHaveBeenCalledTimes(2)
    })

    test('updates after unmount are ignored', async () => {
        profile = { id: 'u1', username: 'alice' }
        const { unmount } = render(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        unmount()
        await act(async () => { await subscribeCb!('SUBSCRIBED') })
        expect(channel.track).not.toHaveBeenCalled()
        presence = { a: [], b: [] }
        expect(() => presenceHandlers.sync()).not.toThrow()
    })

    test('[F-111] unmounted before the lazily loaded client arrives: no channel is ever opened', async () => {
        profile = { id: 'u1', username: 'alice' }
        const { unmount } = render(<PresenceProvider><Count /></PresenceProvider>)
        unmount()
        await flush()
        expect(supabase.channel).not.toHaveBeenCalled()
    })

    test('[F-111] on the landing a guest opens no realtime socket; a signed-in viewer still joins', async () => {
        pathname = '/'
        profile = null
        loading = false
        const view = render(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        expect(supabase.channel).not.toHaveBeenCalled()
        profile = { id: 'u1', username: 'alice' }
        view.rerender(<PresenceProvider><Count /></PresenceProvider>)
        await flush()
        expect(supabase.channel).toHaveBeenCalledTimes(1)
        expect(supabase.channel.mock.calls[0][1]).toEqual({ config: { presence: { key: 'u1' } } })
        pathname = '/lobby'
    })
})
