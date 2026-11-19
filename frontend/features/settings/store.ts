// Where play preferences live. There is no server-side settings storage yet (no column or table
// in supabase/migrations), so the app uses the browser's localStorage behind this port; a server
// implementation can replace it without touching the provider or the page.
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from './model';

export interface SettingsStore {
    load(): UserSettings;
    save(settings: UserSettings): void;
}

export const SETTINGS_STORAGE_KEY = 'gambit-settings';

/** localStorage-backed store; unreadable or blocked storage reads as the defaults and saves are best-effort. */
export function createLocalSettingsStore(
    storage: () => Storage | undefined = () => globalThis.localStorage,
): SettingsStore {
    return {
        load() {
            try {
                const raw = storage()?.getItem(SETTINGS_STORAGE_KEY);
                return raw ? parseSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
            } catch {
                return { ...DEFAULT_SETTINGS };
            }
        },
        save(settings) {
            try {
                storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
            } catch {
                /* private mode or quota: the settings still apply for this visit */
            }
        },
    };
}
