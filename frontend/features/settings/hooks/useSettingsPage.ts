import { useState } from 'react';
import type { SettingsSection } from '../components/SettingsNav';
import type { SettingsProfile } from '../types';
import { useAuthEmail } from './useAuthEmail';
import { useProfileSettings } from './useProfileSettings';
import { useSettingsDraft } from './useSettingsDraft';

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
    const resetProfile = () => {
        form.resetFields();
        setProfileNote('Changes discarded.');
    };
    const profileStatus = form.saved ? 'Changes saved.' : profileNote;

    return { section, setSection, form, draft, email, saveProfile, resetProfile, profileStatus };
}

export type SettingsPageState = ReturnType<typeof useSettingsPage>;
