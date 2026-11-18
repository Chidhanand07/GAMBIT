import { useState } from 'react';
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from '../model';
import { useUserSettings } from '../SettingsProvider';

export const SAVED = 'Changes saved.';
export const DEFAULTS_RESTORED = 'Defaults restored.';
export const SAVE_FAILED = 'Could not save your settings. Try again.';

/**
 * Unsaved edits of the play preferences: the live preview reads the draft, "Save changes" stores
 * it app-wide, "Reset to defaults" puts the defaults back into the draft (saved on the next Save).
 * A newly loaded saved copy replaces the draft (state adjusted during render, not in an effect).
 */
export function useSettingsDraft() {
    const { settings, save } = useUserSettings();
    const [base, setBase] = useState(settings);
    const [draft, setDraft] = useState<UserSettings>(settings);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (settings !== base) {
        setBase(settings);
        setDraft(settings);
    }

    /** Sets one setting; values are re-validated so a row can pass its option id straight through. */
    const set = (key: keyof UserSettings, value: unknown) => {
        setDraft((d) => parseSettings({ ...d, [key]: value }));
        setStatus('');
        setError('');
    };
    const commit = async () => {
        setSaving(true);
        setError('');
        const ok = await save(draft);
        setSaving(false);
        setStatus(ok ? SAVED : '');
        setError(ok ? '' : SAVE_FAILED);
    };
    const reset = () => {
        setDraft({ ...DEFAULT_SETTINGS });
        setStatus(DEFAULTS_RESTORED);
        setError('');
    };
    const clearStatus = () => {
        setStatus('');
        setError('');
    };

    return { draft, set, commit, reset, status, error, saving, clearStatus };
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>;
