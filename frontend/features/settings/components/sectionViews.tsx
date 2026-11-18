import type { ReactNode } from 'react';
import { NOTIFICATION_ROWS, PRIVACY_ROWS, type AccountRowDef } from '../accountRows';
import type { SettingsPageState } from '../hooks/useSettingsPage';
import { BOARD_ROWS, GAMEPLAY_ROWS, type SettingRowDef } from '../rows';
import type { SettingsProfile } from '../types';
import { AccountPreview } from './AccountPreview';
import { AccountSection } from './AccountSection';
import { BoardPreview } from './BoardPreview';
import { GameplayPreview } from './GameplayPreview';
import { NotificationsPreview } from './NotificationsPreview';
import { PrivacyPreviewContainer } from './PrivacyPreviewContainer';
import { ProfilePreview } from './ProfilePreview';
import { PublicProfileForm } from './PublicProfileForm';
import { SaveBar, SettingsCard } from './SettingsCard';
import { AccountSettingRow, SettingRow } from './SettingRow';

export interface ViewProps {
    profile: SettingsProfile;
    state: SettingsPageState;
}

export interface SectionView {
    card: ReactNode;
    preview: ReactNode;
}

interface CardCopy {
    title: string;
    subtitle: string;
}

function PreferenceCard({
    title,
    subtitle,
    rows,
    state,
}: CardCopy & { rows: SettingRowDef[]; state: SettingsPageState }) {
    const { draft } = state;
    return (
        <SettingsCard title={title} subtitle={subtitle}>
            <div>
                {rows.map((row) => (
                    <SettingRow key={row.key} row={row} settings={draft.draft} onChange={draft.set} />
                ))}
            </div>
            <SaveBar
                onSave={() => void draft.commit()}
                onReset={state.resetAll}
                saving={draft.saving}
                status={draft.status}
                error={draft.error}
            />
        </SettingsCard>
    );
}

interface AccountPrefsCardProps extends CardCopy {
    rows: AccountRowDef[];
    state: SettingsPageState;
}

/** A card of account preferences (Notifications, Privacy) saved to the server. */
function AccountPrefsCard({ title, subtitle, rows, state }: AccountPrefsCardProps) {
    const { accountDraft } = state;
    return (
        <SettingsCard title={title} subtitle={subtitle}>
            <div>
                {rows.map((row) => (
                    <AccountSettingRow
                        key={row.key}
                        row={row}
                        prefs={accountDraft.draft}
                        onChange={state.setAccountPref}
                    />
                ))}
            </div>
            <SaveBar
                onSave={() => void accountDraft.commit()}
                onReset={state.resetAll}
                saving={accountDraft.saving}
                status={accountDraft.status}
                error={accountDraft.error}
            />
        </SettingsCard>
    );
}

/** The public-profile card and its preview. */
export function profileView({ profile, state }: ViewProps): SectionView {
    const { form } = state;
    return {
        card: (
            <SettingsCard title="Public profile" subtitle="Changes show in the live preview as you make them.">
                <PublicProfileForm profile={profile} form={form} />
                <SaveBar
                    onSave={state.saveProfile}
                    onReset={state.resetAll}
                    saving={form.saving}
                    status={state.profileStatus}
                    error={form.error}
                />
            </SettingsCard>
        ),
        preview: <ProfilePreview username={profile.username} values={form.values} avatarUrl={form.avatarUrl} />,
    };
}

export function boardView({ state }: ViewProps): SectionView {
    const copy = { title: 'Board & pieces', subtitle: 'Changes apply to the preview right away.' };
    return {
        card: <PreferenceCard {...copy} rows={BOARD_ROWS} state={state} />,
        preview: <BoardPreview settings={state.draft.draft} />,
    };
}

export function gameplayView({ state }: ViewProps): SectionView {
    const copy = { title: 'Gameplay', subtitle: 'Defaults and safety nets while you play.' };
    return {
        card: <PreferenceCard {...copy} rows={GAMEPLAY_ROWS} state={state} />,
        preview: <GameplayPreview settings={state.draft.draft} />,
    };
}

export function notificationsView({ state }: ViewProps): SectionView {
    const copy = { title: 'Notifications', subtitle: 'Choose what Gambit tells you about.' };
    return {
        card: <AccountPrefsCard {...copy} rows={NOTIFICATION_ROWS} state={state} />,
        preview: (
            <NotificationsPreview
                prefs={state.accountDraft.draft.notifications}
                timeControl={state.draft.draft.defaultTimeControl}
                permission={state.browserPermission}
            />
        ),
    };
}

export function privacyView({ profile, state }: ViewProps): SectionView {
    const copy = { title: 'Privacy', subtitle: 'Control who can see and reach you.' };
    return {
        card: <AccountPrefsCard {...copy} rows={PRIVACY_ROWS} state={state} />,
        preview: <PrivacyPreviewContainer profile={profile} prefs={state.accountDraft.draft.privacy} />,
    };
}

export function accountView({ profile, state }: ViewProps): SectionView {
    return {
        card: (
            <SettingsCard title="Account" subtitle="Sign-in details and ratings.">
                <AccountSection profile={profile} state={state} />
            </SettingsCard>
        ),
        preview: (
            <AccountPreview email={state.email} signInEmails={state.accountDraft.draft.security.emailOnNewSignIn} />
        ),
    };
}
