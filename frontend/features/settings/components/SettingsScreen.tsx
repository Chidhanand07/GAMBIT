import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { profileHref } from '@/features/profile/links';
import type { SettingsSection } from './SettingsNav';
import { SettingsNav } from './SettingsNav';
import {
    accountView,
    boardView,
    gameplayView,
    notificationsView,
    privacyView,
    profileView,
    type SectionView,
    type ViewProps,
} from './sectionViews';

const CHEVRON_LEFT = 'M15 18l-6-6 6-6';

const VIEWS: Record<SettingsSection, (props: ViewProps) => SectionView> = {
    profile: profileView,
    board: boardView,
    gameplay: gameplayView,
    notifications: notificationsView,
    privacy: privacyView,
    account: accountView,
};

/** Settings.dc.html: back link and title, section nav, the section card and its live preview. */
export function SettingsScreen(props: ViewProps) {
    const { card, preview } = VIEWS[props.state.section](props);
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
