// SETTINGS-PREFS (ADR F-140): "Show when I am online" decides whether this user is announced in
// the shared presence set; until the settings are known (or when they failed) nobody is announced.
import { act, render } from '@testing-library/react'

let subscribeCb: ((status: string) => Promise<void>) | null = null
const channel: any = {
    on: jest.fn(() => channel),
    subscribe: jest.fn((cb: any) => { subscribeCb = cb; return channel }),
    track: jest.fn(async () => {}),
    untrack: jest.fn(async () => {}),
    presenceState: () => ({}),
}
const supabase = { channel: jest.fn(() => channel), removeChannel: jest.fn() }
jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))
jest.mock('next/navigation', () => ({ usePathname: () => '/lobby' }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'alice' } }) }))

import PresenceProvider from '@/components/PresenceProvider'
import { DEFAULT_ACCOUNT_PREFERENCES, withPreference } from '@/lib/preferences'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import type { SettingsStore } from '@/features/settings/store'
import { settingsStore } from '../../helpers/settingsStore'

const hidden = withPreference(DEFAULT_ACCOUNT_PREFERENCES, 'privacy', 'showOnline', false)

function renderWith(store: SettingsStore) {
    return render(<SettingsProvider store={store}><PresenceProvider><div /></PresenceProvider></SettingsProvider>)
}

// Stacking on the landing (F-111, was: subscribe right after render): the Supabase client loads
// lazily, so the channel exists only after the import resolves.
async function subscribed() {
    for (let i = 0; i < 6; i++) await act(async () => {})
    await act(async () => { await subscribeCb!('SUBSCRIBED') })
}

beforeEach(() => {
    jest.clearAllMocks()
    subscribeCb = null
})

describe('presence and "Show when I am online"', () => {
    test('off: the channel is joined (to see others) but this user is never tracked', async () => {
        renderWith(settingsStore(DEFAULT_SETTINGS, hidden))
        await subscribed()
        expect(supabase.channel).toHaveBeenCalled()
        expect(channel.track).not.toHaveBeenCalled()
    })

    // Stacking (was: payload { user_id, username }): the payload carries the tab's idle status (F-131).
    test('on (default): tracked when subscribed', async () => {
        renderWith(settingsStore())
        await subscribed()
        expect(channel.track).toHaveBeenCalledWith({ user_id: 'u1', username: 'alice', status: 'online' })
    })

    test('turning it off while online untracks without re-subscribing; on again tracks', async () => {
        const store = settingsStore()
        let ctxSave: ((a: typeof hidden) => Promise<boolean>) | null = null
        const { useUserSettings } = jest.requireActual('@/features/settings/SettingsProvider')
        function Grab() {
            ctxSave = useUserSettings().saveAccount
            return null
        }
        render(<SettingsProvider store={store}><PresenceProvider><Grab /></PresenceProvider></SettingsProvider>)
        await subscribed()
        expect(channel.track).toHaveBeenCalledTimes(1)
        await act(async () => { await ctxSave!(hidden) })
        expect(channel.untrack).toHaveBeenCalledTimes(1)
        await act(async () => { await ctxSave!(DEFAULT_ACCOUNT_PREFERENCES) })
        expect(channel.track).toHaveBeenCalledTimes(2)
        expect(supabase.channel).toHaveBeenCalledTimes(1)
    })

    test('fail closed: settings still loading, or failed to load → not tracked', async () => {
        const pending: SettingsStore = { load: () => new Promise(() => {}), save: async () => {} }
        const { unmount } = renderWith(pending)
        await subscribed()
        expect(channel.track).not.toHaveBeenCalled()
        unmount()
        const failing: SettingsStore = { load: () => Promise.reject(new Error('500')), save: async () => {} }
        renderWith(failing)
        await subscribed()
        expect(channel.track).not.toHaveBeenCalled()
    })
})
