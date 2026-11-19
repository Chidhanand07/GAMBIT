/**
 * A synchronous in-memory SettingsStore for tests: `load()` returns `{ play, account }` at once
 * (so a provider applies it in the first effect pass), `save()` records what was stored.
 */
import { DEFAULT_ACCOUNT_PREFERENCES } from '@/lib/preferences'
import { DEFAULT_SETTINGS, type UserSettings } from '@/features/settings/model'
import type { Preferences, SettingsStore } from '@/features/settings/store'
import type { AccountPreferences } from '@/types/preferences'

export type MemorySettingsStore = SettingsStore & { saved: Preferences[]; current: () => Preferences }

export function settingsStore(
    play: UserSettings = DEFAULT_SETTINGS,
    account: AccountPreferences = DEFAULT_ACCOUNT_PREFERENCES,
): MemorySettingsStore {
    let current: Preferences = { play, account }
    const saved: Preferences[] = []
    return {
        saved,
        current: () => current,
        load: () => current,
        save: jest.fn(async (next: Preferences) => {
            current = next
            saved.push(next)
        }),
    }
}
