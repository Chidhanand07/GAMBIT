import { experienceLabel, playingStyleLabel } from '@/lib/profile/fields';
import type { ProfileFieldValues } from '../hooks/useProfileSettings';
import { PreviewCard, PreviewChip } from './PreviewCard';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfilePreviewProps {
    username: string;
    values: ProfileFieldValues;
    avatarUrl: string | null;
}

/** The preview's chips (Settings.dc.html): "Country, City", favourite opening, style, experience. */
export function previewChips(v: ProfileFieldValues): string[] {
    const place = [v.country.trim(), v.city.trim()].filter(Boolean).join(', ');
    const chips = [place, v.favoriteOpening.trim(), playingStyleLabel(v.playingStyle), experienceLabel(v.experience)];
    return chips.filter((c): c is string => Boolean(c));
}

/** How the unsaved public-profile fields will look to other players. */
export function ProfilePreview({ username, values, avatarUrl }: ProfilePreviewProps) {
    const name = values.displayName.trim() || username;
    const chips = previewChips(values);
    return (
        <PreviewCard>
            <div className="flex items-center gap-[14px]">
                <ProfileAvatar name={name} src={avatarUrl} size={56} />
                <div className="flex min-w-0 flex-col">
                    <span className="font-display text-[22px] font-bold [overflow-wrap:anywhere]">{name}</span>
                    <span className="text-[13px] text-ink-muted">
                        @{username}
                        {values.pronouns ? ` · ${values.pronouns}` : ''}
                    </span>
                </div>
            </div>
            <span className="text-[15px] leading-[1.5] [overflow-wrap:anywhere]">
                {values.bio.trim() || 'No bio yet.'}
            </span>
            {chips.length > 0 && (
                <div className="flex flex-wrap gap-[6px]">
                    {chips.map((chip) => (
                        <PreviewChip key={chip}>{chip}</PreviewChip>
                    ))}
                </div>
            )}
        </PreviewCard>
    );
}
