'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSoundsEnabled } from '@/lib/sounds';
import { boardPrefsOf, DEFAULT_SETTINGS, type BoardPrefs, type UserSettings } from './model';
import { createLocalSettingsStore, type SettingsStore } from './store';

interface SettingsContextValue {
    settings: UserSettings;
    save: (settings: UserSettings) => void;
}

const SettingsContext = createContext<SettingsContextValue>({ settings: DEFAULT_SETTINGS, save: () => {} });

const defaultStore = createLocalSettingsStore();

/** Applies the settings that act outside React: move sounds and the piece slide duration. */
function applyGlobally(settings: UserSettings) {
    const prefs = boardPrefsOf(settings);
    setSoundsEnabled(prefs.sound);
    document.documentElement.style.setProperty('--piece-slide-duration', `${prefs.slideMs}ms`);
}

/**
 * The user's play preferences, app-wide. Starts from the defaults (same markup on the server and
 * the first client render), loads the stored settings after mount, and saves through the store.
 */
export function SettingsProvider({ children, store = defaultStore }: { children: ReactNode; store?: SettingsStore }) {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        setSettings(store.load());
    }, [store]);

    useEffect(() => {
        applyGlobally(settings);
    }, [settings]);

    const save = useCallback(
        (next: UserSettings) => {
            store.save(next);
            setSettings(next);
        },
        [store],
    );

    const value = useMemo(() => ({ settings, save }), [settings, save]);
    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** The saved settings and `save`. */
export function useUserSettings(): SettingsContextValue {
    return useContext(SettingsContext);
}

/** Board props from the saved settings: `<Board theme animate showCoordinates …/>`, plus `sound`. */
export function useBoardPrefs(): BoardPrefs {
    const { settings } = useContext(SettingsContext);
    return useMemo(() => boardPrefsOf(settings), [settings]);
}
