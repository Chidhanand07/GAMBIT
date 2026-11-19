// Where preferences live (ADR F-140). The provider and the page only know the SettingsStore port.
// Signed in, everything is stored on the server (public.user_preferences via /api/settings); the
// play preferences a browser kept in localStorage before that are uploaded once and then cleared.
// Signed out, the play preferences stay in localStorage as before.
import { fetchSettings, patchSettings } from '@/lib/api/settings';
import { DEFAULT_ACCOUNT_PREFERENCES, parseAccountPreferences } from '@/lib/preferences';
import type { AccountPreferences, PreferencesPayload } from '@/types/preferences';
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from './model';

export interface Preferences {
    play: UserSettings;
    account: AccountPreferences;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
    play: DEFAULT_SETTINGS,
    account: DEFAULT_ACCOUNT_PREFERENCES,
});

/**
 * Port: load the current preferences (synchronously or not), save new ones (rejects when they
 * could not be stored).
 */
export interface SettingsStore {
    load(): Preferences | Promise<Preferences>;
    save(next: Preferences): Promise<void>;
    /** Calls `onChange` when the stored copy may have changed (sign-in, sign-out); returns an unsubscribe. */
    subscribe?(onChange: () => void): () => void;
}

export const SETTINGS_STORAGE_KEY = 'gambit-settings';

/** The browser's copy of the play preferences (signed out, and before the one-time upload). */
export interface LocalSettingsStore {
    load(): UserSettings;
    save(settings: UserSettings): void;
    clear(): void;
}

/** localStorage-backed store; unreadable or blocked storage reads as the defaults and writes are best-effort. */
export function createLocalSettingsStore(
    storage: () => Storage | undefined = () => globalThis.localStorage,
): LocalSettingsStore {
    const write = (fn: (s: Storage | undefined) => void) => {
        try {
            fn(storage());
        } catch {
            /* private mode or quota: the settings still apply for this visit */
        }
    };
    return {
        load() {
            try {
                const raw = storage()?.getItem(SETTINGS_STORAGE_KEY);
                return raw ? parseSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
            } catch {
                return { ...DEFAULT_SETTINGS };
            }
        },
        save: (settings) => write((s) => s?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))),
        clear: () => write((s) => s?.removeItem(SETTINGS_STORAGE_KEY)),
    };
}

const HTTP_UNAUTHORIZED = 401;

export interface SettingsApi {
    get: () => Promise<Response>;
    patch: (body: object) => Promise<Response>;
}

export interface AccountStoreOptions {
    api?: SettingsApi;
    local?: LocalSettingsStore;
    subscribe?: SettingsStore['subscribe'];
    /**
     * Whether this browser holds a session. Without one the server is not asked (a guest would get
     * a 401, which browsers log on every public page; F-111, F-168). Default: always ask.
     */
    hasSession?: () => Promise<boolean>;
}

const fromPayload = (body: PreferencesPayload): Preferences => ({
    play: parseSettings(body.play),
    account: parseAccountPreferences(body),
});

/**
 * First load of a signed-in user with no server row: upload this browser's play preferences,
 * then clear them so they are never uploaded again. A failed upload keeps them for next time.
 */
async function migrateLocal(api: SettingsApi, local: LocalSettingsStore): Promise<Preferences> {
    const play = local.load();
    const res = await api.patch({ play });
    if (!res.ok) return { play, account: { ...DEFAULT_ACCOUNT_PREFERENCES } };
    local.clear();
    return fromPayload((await res.json()) as PreferencesPayload);
}

/** The store the app uses: the server when signed in, localStorage when not. */
export function createAccountSettingsStore({
    api = { get: fetchSettings, patch: patchSettings },
    local = createLocalSettingsStore(),
    subscribe,
    hasSession = async () => true,
}: AccountStoreOptions = {}): SettingsStore {
    let signedIn = false;
    return {
        subscribe,
        async load() {
            if (!(await hasSession().catch(() => false))) {
                signedIn = false;
                return { play: local.load(), account: { ...DEFAULT_ACCOUNT_PREFERENCES } };
            }
            const res = await api.get();
            signedIn = res.status !== HTTP_UNAUTHORIZED;
            if (!signedIn) return { play: local.load(), account: { ...DEFAULT_ACCOUNT_PREFERENCES } };
            if (!res.ok) throw new Error(`settings request failed: ${res.status}`);
            const body = (await res.json()) as PreferencesPayload;
            return body.stored ? fromPayload(body) : migrateLocal(api, local);
        },
        async save(next) {
            if (!signedIn) {
                local.save(next.play);
                return;
            }
            const res = await api.patch(next);
            if (!res.ok) throw new Error(`settings save failed: ${res.status}`);
        },
    };
}
