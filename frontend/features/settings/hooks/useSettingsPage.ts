import { useState } from 'react';
import type { SettingsSection } from '../components/SettingsNav';
import type { SettingsProfile } from '../types';
import { useAccountPrefsDraft } from './useAccountPrefsDraft';
import { useAccountCard } from './useAccountCard';
import { useBrowserNotifications } from './useBrowserNotifications';
import { useProfileSettings } from './useProfileSettings';
import { DEFAULTS_RESTORED, useSettingsDraft } from './useSettingsDraft';

/**
 * State of the settings page: active section, the profile form, the play-preferences draft,
 * the account-preferences draft (Notifications, Privacy, Account) and the email.
 */
export function useSettingsPage(profile: SettingsProfile | null, refetch: () => void) {
    const [section, setSectionState] = useState<SettingsSection>('profile');
    const [profileNote, setProfileNote] = useState('');
    const form = useProfileSettings(profile, refetch);
    const draft = useSettingsDraft();
    const accountDraft = useAccountPrefsDraft();
    const account = useAccountCard(accountDraft, profile?.username ?? '');
    const browser = useBrowserNotifications();
    // Back from an e-mail confirmation link: open the Account card, where the result is shown.
    const [shownLink, setShownLink] = useState(account.emailLink);
    if (account.emailLink !== shownLink) {
        setShownLink(account.emailLink);
        if (account.emailLink) setSectionState('account');
    }

    const setSection = (next: SettingsSection) => {
        setSectionState(next);
        setProfileNote('');
        draft.clearStatus();
        accountDraft.clearStatus();
    };
    const saveProfile = () => {
        setProfileNote('');
        void form.handleSave();
    };
    /**
     * "Reset to defaults" (Settings.dc.html): one reset for every section. Unsaved profile edits go
     * back to the saved profile, the play and account preferences to their defaults; nothing is
     * stored until Save. Every bar then says "Defaults restored.".
     */
    const resetAll = () => {
        form.resetFields();
        draft.reset();
        accountDraft.resetAll();
        account.reset();
        setProfileNote(DEFAULTS_RESTORED);
    };
    /** Account rows: turning "Browser notifications" on asks the browser for permission first. */
    const setAccountPref = (sectionKey: Parameters<typeof accountDraft.set>[0], key: string, value: unknown) => {
        accountDraft.set(sectionKey, key, value);
        if (sectionKey === 'notifications' && key === 'browser' && value === true) void browser.request();
    };
    const profileStatus = profileNote || (form.saved ? 'Changes saved.' : '');

    return {
        section,
        setSection,
        form,
        draft,
        accountDraft,
        setAccountPref,
        browserPermission: browser.permission,
        account,
        email: account.email,
        saveProfile,
        resetAll,
        profileStatus,
    };
}

export type SettingsPageState = ReturnType<typeof useSettingsPage>;
