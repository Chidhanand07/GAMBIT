import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { profileHref } from '@/features/profile/links';
import type { SettingsPageState } from '../hooks/useSettingsPage';
import { BOARD_ROWS, GAMEPLAY_ROWS, type SettingRowDef } from '../rows';
import type { SettingsProfile } from '../types';
import { AccountPreview } from './AccountPreview';
import { AccountSection } from './AccountSection';
import { BoardPreview } from './BoardPreview';
import { GameplayPreview } from './GameplayPreview';
import { ProfilePreview } from './ProfilePreview';
import { PublicProfileForm } from './PublicProfileForm';
import { SaveBar, SettingsCard } from './SettingsCard';
import { SettingsNav } from './SettingsNav';
import { SettingRow } from './SettingRow';

const CHEVRON_LEFT = 'M15 18l-6-6 6-6';

interface Props {
    profile: SettingsProfile;
    state: SettingsPageState;
}

function PreferenceCard({
    title,
    subtitle,
    rows,
    state,
}: {
    title: string;
    subtitle: string;
    rows: SettingRowDef[];
    state: SettingsPageState;
}) {
    const { draft } = state;
    return (
        <SettingsCard title={title} subtitle={subtitle}>
            <div>
                {rows.map((row) => (
                    <SettingRow key={row.key} row={row} settings={draft.draft} onChange={draft.set} />
                ))}
            </div>
            <SaveBar onSave={draft.commit} onReset={state.resetAll} status={draft.status} />
        </SettingsCard>
    );
}

/** The public-profile card and its preview. */
function profileViews({ profile, state }: Props): { card: ReactNode; preview: ReactNode } {
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
        preview: (
            <ProfilePreview
                username={profile.username}
                displayName={form.displayName}
                bio={form.bio}
                country={form.country}
                avatarUrl={form.avatarUrl}
            />
        ),
    };
}

/** The active section's card and its live preview. */
function sectionViews({ profile, state }: Props): { card: ReactNode; preview: ReactNode } {
    const { draft } = state;
    switch (state.section) {
        case 'board':
            return {
                card: (
                    <PreferenceCard
                        title="Board & pieces"
                        subtitle="Changes apply to the preview right away."
                        rows={BOARD_ROWS}
                        state={state}
                    />
                ),
                preview: <BoardPreview settings={draft.draft} />,
            };
        case 'gameplay':
            return {
                card: (
                    <PreferenceCard
                        title="Gameplay"
                        subtitle="Defaults and safety nets while you play."
                        rows={GAMEPLAY_ROWS}
                        state={state}
                    />
                ),
                preview: <GameplayPreview settings={draft.draft} />,
            };
        case 'account':
            return {
                card: (
                    <SettingsCard title="Account" subtitle="Sign-in details and ratings.">
                        <AccountSection profile={profile} email={state.email} />
                    </SettingsCard>
                ),
                preview: <AccountPreview email={state.email} />,
            };
        default:
            return profileViews({ profile, state });
    }
}

/** Settings.dc.html: back link and title, section nav, the section card and its live preview. */
export function SettingsScreen(props: Props) {
    const { card, preview } = sectionViews(props);
    return (
        <div className="mx-auto box-border flex max-w-[1240px] flex-col gap-6 px-8 pb-[72px] pt-9">
            <div className="flex items-center gap-3">
                <Link
                    href={profileHref(props.profile.username)}
                    aria-label="Back to profile"
                    className="flex h-11 w-11 items-center justify-center rounded-full border-1 border-line bg-surface text-ink"
                >
                    <Icon path={CHEVRON_LEFT} size={20} strokeWidth={2} />
                </Link>
                <h1 className="m-0 font-display text-[44px] font-bold leading-[1.05] tracking-[-0.03em]">Settings</h1>
            </div>
            <div className="flex flex-wrap items-start gap-7">
                <SettingsNav value={props.state.section} onChange={props.state.setSection} />
                <div className="min-w-0 flex-[3_1_460px]">{card}</div>
                <aside aria-label="Live preview" className="sticky top-6 min-w-0 max-w-[400px] flex-[1_1_320px]">
                    {preview}
                </aside>
            </div>
        </div>
    );
}
