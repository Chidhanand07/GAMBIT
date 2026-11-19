import { useState } from 'react';
import type { SettingsSection } from '../components/SettingsNav';
import type { SettingsProfile } from '../types';
import { useAuthEmail } from './useAuthEmail';
import { useProfileSettings } from './useProfileSettings';
import { useSettingsDraft } from './useSettingsDraft';

const DEFAULTS_RESTORED = 'Defaults restored.';

/** State of the settings page: active section, the profile form, the preferences draft and the email. */
export function useSettingsPage(profile: SettingsProfile | null, refetch: () => void) {
    const [section, setSectionState] = useState<SettingsSection>('profile');
    const [profileNote, setProfileNote] = useState('');
    const form = useProfileSettings(profile, refetch);
    const draft = useSettingsDraft();
    const email = useAuthEmail();

    const setSection = (next: SettingsSection) => {
        setSectionState(next);
        setProfileNote('');
        draft.clearStatus();
    };
    const saveProfile = () => {
        setProfileNote('');
        void form.handleSave();
    };
    /**
     * "Reset to defaults" (Settings.dc.html): one reset for every section. Unsaved profile edits go
     * back to the saved profile and the play preferences to their defaults; nothing is stored until
     * Save. Every bar then says "Defaults restored.".
     */
    const resetAll = () => {
        form.resetFields();
        draft.reset();
        setProfileNote(DEFAULTS_RESTORED);
    };
    const profileStatus = profileNote || (form.saved ? 'Changes saved.' : '');

    return { section, setSection, form, draft, email, saveProfile, resetAll, profileStatus };
}

export type SettingsPageState = ReturnType<typeof useSettingsPage>;
