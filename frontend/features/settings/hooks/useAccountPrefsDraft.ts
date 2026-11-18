import { useState } from 'react';
import { DEFAULT_ACCOUNT_PREFERENCES, parseAccountPreferences, withPreference } from '@/lib/preferences';
import type { AccountPreferences } from '@/types/preferences';
import { useUserSettings } from '../SettingsProvider';
import { DEFAULTS_RESTORED, SAVE_FAILED, SAVED } from './useSettingsDraft';

export type PreferenceSection = keyof AccountPreferences;

/**
 * Unsaved edits of the account preferences ("Notifications", "Privacy", the Account switches),
 * like useSettingsDraft: the preview reads the draft, "Save changes" stores it on the server,
 * "Reset to defaults" restores the section's defaults into the draft.
 */
export function useAccountPrefsDraft() {
    const { account, saveAccount } = useUserSettings();
    const [base, setBase] = useState(account);
    const [draft, setDraft] = useState<AccountPreferences>(account);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (account !== base) {
        setBase(account);
        setDraft(account);
    }

    const set = (section: PreferenceSection, key: string, value: unknown) => {
        setDraft((d) => withPreference(d, section, key, value));
        setStatus('');
        setError('');
    };
    const commit = async (next: AccountPreferences = draft) => {
        setSaving(true);
        setError('');
        const ok = await saveAccount(next);
        setSaving(false);
        setStatus(ok ? SAVED : '');
        setError(ok ? '' : SAVE_FAILED);
        return ok;
    };
    const reset = (section: PreferenceSection) => {
        setDraft((d) => ({ ...d, [section]: { ...DEFAULT_ACCOUNT_PREFERENCES[section] } }));
        setStatus(DEFAULTS_RESTORED);
        setError('');
    };
    /** Every section back to its defaults (the page's one "Reset to defaults"). */
    const resetAll = () => {
        setDraft(parseAccountPreferences({}));
        setStatus(DEFAULTS_RESTORED);
        setError('');
    };
    const clearStatus = () => {
        setStatus('');
        setError('');
    };

    return { draft, set, commit, reset, resetAll, status, error, saving, clearStatus };
}

export type AccountPrefsDraft = ReturnType<typeof useAccountPrefsDraft>;
