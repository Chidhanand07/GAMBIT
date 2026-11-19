'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PieceSetProvider } from '@/components/chess/pieceSets';
import { setSoundsEnabled } from '@/lib/sounds';
import type { AccountPreferences } from '@/types/preferences';
import { subscribeToAuthChanges } from './authChanges';
import { boardPrefsOf, type BoardPrefs, type UserSettings } from './model';
import { createAccountSettingsStore, DEFAULT_PREFERENCES, type Preferences, type SettingsStore } from './store';

/** `loading` until the first load answers; `error` when it failed (privacy features stay off). */
export type SettingsStatus = 'loading' | 'ready' | 'error';

interface SettingsContextValue {
    settings: UserSettings;
    account: AccountPreferences;
    status: SettingsStatus;
    /** Stores new play preferences; resolves false when they could not be saved. */
    save: (settings: UserSettings) => Promise<boolean>;
    /** Stores new account preferences; resolves false when they could not be saved. */
    saveAccount: (account: AccountPreferences) => Promise<boolean>;
}

// Without a provider (isolated components, tests) the defaults are the truth: status 'ready'.
const SettingsContext = createContext<SettingsContextValue>({
    settings: DEFAULT_PREFERENCES.play,
    account: DEFAULT_PREFERENCES.account,
    status: 'ready',
    save: async () => true,
    saveAccount: async () => true,
});

const defaultStore = createAccountSettingsStore({ subscribe: subscribeToAuthChanges });

/** Applies the settings that act outside React: move sounds and the piece slide duration. */
function applyGlobally(settings: UserSettings) {
    const prefs = boardPrefsOf(settings);
    setSoundsEnabled(prefs.sound);
    document.documentElement.style.setProperty('--piece-slide-duration', `${prefs.slideMs}ms`);
}

/** Loads on mount and whenever the store reports a change (sign-in, sign-out); the latest load wins. */
function useStoredPreferences(store: SettingsStore) {
    const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
    const [status, setStatus] = useState<SettingsStatus>('loading');
    const generation = useRef(0);

    useEffect(() => {
        const reload = () => {
            const mine = ++generation.current;
            const apply = (loaded: Preferences) => {
                if (mine !== generation.current) return;
                // An identical copy (a repeated SIGNED_IN) keeps the old object: drafts survive.
                setPrefs((prev) => (JSON.stringify(prev) === JSON.stringify(loaded) ? prev : loaded));
                setStatus('ready');
            };
            const fail = () => {
                if (mine === generation.current) setStatus('error');
            };
            let result: ReturnType<SettingsStore['load']>;
            try {
                result = store.load();
            } catch {
                fail();
                return;
            }
            // A synchronous store (tests, localStorage) applies in the same effect pass.
            if (result instanceof Promise) result.then(apply, fail);
            else apply(result);
        };
        reload();
        const unsubscribe = store.subscribe?.(reload);
        return () => {
            generation.current += 1;
            unsubscribe?.();
        };
    }, [store]);

    return { prefs, setPrefs, status };
}

/**
 * The user's preferences, app-wide: play preferences (boards, lobby, game) and account
 * preferences (notifications, privacy). Starts from the defaults (same markup on the server and
 * the first client render), loads the stored copy after mount, and saves through the store.
 */
export function SettingsProvider({ children, store = defaultStore }: { children: ReactNode; store?: SettingsStore }) {
    const { prefs, setPrefs, status } = useStoredPreferences(store);
    const latest = useRef(prefs);
    useEffect(() => {
        latest.current = prefs;
        applyGlobally(prefs.play);
    }, [prefs]);

    const persist = useCallback(
        async (next: Preferences) => {
            try {
                await store.save(next);
                latest.current = next;
                setPrefs(next);
                return true;
            } catch {
                return false;
            }
        },
        [store, setPrefs],
    );
    const save = useCallback((play: UserSettings) => persist({ ...latest.current, play }), [persist]);
    const saveAccount = useCallback(
        (account: AccountPreferences) => persist({ ...latest.current, account }),
        [persist],
    );

    const value = useMemo(
        () => ({ settings: prefs.play, account: prefs.account, status, save, saveAccount }),
        [prefs, status, save, saveAccount],
    );
    // The piece set applies app-wide: every Board / Piece below reads it (ADR F-147).
    return (
        <SettingsContext.Provider value={value}>
            <PieceSetProvider value={prefs.play.pieceSet}>{children}</PieceSetProvider>
        </SettingsContext.Provider>
    );
}

/** The saved preferences, their load status, `save` and `saveAccount`. */
export function useUserSettings(): SettingsContextValue {
    return useContext(SettingsContext);
}

/** Board props from the saved settings: `<Board theme animate showCoordinates …/>`, plus `sound`. */
export function useBoardPrefs(): BoardPrefs {
    const { settings } = useContext(SettingsContext);
    return useMemo(() => boardPrefsOf(settings), [settings]);
}
