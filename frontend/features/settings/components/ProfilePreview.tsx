import { PreviewCard, PreviewChip } from './PreviewCard';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfilePreviewProps {
    username: string;
    displayName: string;
    bio: string;
    country: string;
    avatarUrl: string | null;
}

/** How the unsaved public-profile fields will look to other players. */
export function ProfilePreview({ username, displayName, bio, country, avatarUrl }: ProfilePreviewProps) {
    const name = displayName.trim() || username;
    return (
        <PreviewCard>
            <div className="flex items-center gap-[14px]">
                <ProfileAvatar name={name} src={avatarUrl} size={56} />
                <div className="flex min-w-0 flex-col">
                    <span className="font-display text-[22px] font-bold [overflow-wrap:anywhere]">{name}</span>
                    <span className="text-[13px] text-ink-muted">@{username}</span>
                </div>
            </div>
            <span className="text-[15px] leading-[1.5] [overflow-wrap:anywhere]">{bio.trim() || 'No bio yet.'}</span>
            {country.trim() && (
                <div className="flex flex-wrap gap-[6px]">
                    <PreviewChip>{country.trim()}</PreviewChip>
                </div>
            )}
        </PreviewCard>
    );
}
