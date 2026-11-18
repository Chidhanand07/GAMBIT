import { useState } from 'react';
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from '../model';
import { useUserSettings } from '../SettingsProvider';

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

    if (settings !== base) {
        setBase(settings);
        setDraft(settings);
    }

    /** Sets one setting; values are re-validated so a row can pass its option id straight through. */
    const set = (key: keyof UserSettings, value: unknown) => {
        setDraft((d) => parseSettings({ ...d, [key]: value }));
        setStatus('');
    };
    const commit = () => {
        save(draft);
        setStatus('Changes saved.');
    };
    const reset = () => {
        setDraft({ ...DEFAULT_SETTINGS });
        setStatus('Defaults restored.');
    };
    const clearStatus = () => setStatus('');

    return { draft, set, commit, reset, status, clearStatus };
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>;
