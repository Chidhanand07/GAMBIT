import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Profile } from '@/types/profile';
import { avatarInitial } from '../format';
import { AvatarImg } from './AvatarImg';

export type HeaderProfile = Pick<
    Profile,
    'username' | 'display_name' | 'avatar_url' | 'bio' | 'country' | 'created_at'
>;

function Banner() {
    return (
        <div
            className="h-28 w-full relative overflow-hidden rounded-t-xl"
            style={{ background: 'linear-gradient(135deg, #1A1714 0%, #2A1D10 50%, #1A1714 100%)' }}
        >
            <svg className="absolute inset-0 w-full h-full opacity-5" style={{ color: 'var(--accent)' }}>
                <defs>
                    <pattern id="chess-bg" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                        <rect x="0" y="0" width="16" height="16" fill="currentColor" />
                        <rect x="16" y="16" width="16" height="16" fill="currentColor" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#chess-bg)" />
            </svg>
        </div>
    );
}

function Avatar({ profile, isOnline }: { profile: HeaderProfile; isOnline: boolean }) {
    return (
        <div className="relative shrink-0">
            <div className="w-[88px] h-[88px] rounded-full bg-surface border-2 border-border-strong flex items-center justify-center overflow-hidden">
                {profile.avatar_url ? (
                    <AvatarImg src={profile.avatar_url} />
                ) : (
                    <span className="text-accent text-3xl font-medium select-none">
                        {avatarInitial(profile.display_name, profile.username)}
                    </span>
                )}
            </div>
            {isOnline && (
                <div
                    className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-indicator-green border-2 border-page shadow-[0_0_6px_rgba(79,168,90,0.8)]"
                    title="Online now"
                />
            )}
        </div>
    );
}

interface InfoProps {
    profile: HeaderProfile;
    isOnline: boolean;
    gamesPlayed: number;
}

function Info({ profile, isOnline, gamesPlayed }: InfoProps) {
    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-medium text-text-primary">{profile.display_name || profile.username}</h1>
                {isOnline && (
                    <span className="text-xs text-indicator-green bg-indicator-green/10 px-2 py-0.5 rounded-full">
                        Online
                    </span>
                )}
            </div>
            <div className="text-text-tertiary text-sm mt-0.5">@{profile.username}</div>

            {profile.bio && (
                <p className="text-text-secondary text-sm mt-2 max-w-xl leading-relaxed italic">{profile.bio}</p>
            )}

            <div className="flex gap-4 mt-3 text-xs text-text-tertiary flex-wrap items-center">
                {profile.country && (
                    <span className="flex items-center gap-1">
                        <MapPin size={12} strokeWidth={1.5} /> {profile.country}
                    </span>
                )}
                <span>Joined {new Date(profile.created_at).getFullYear()}</span>
                <span>{gamesPlayed} games</span>
            </div>
        </div>
    );
}

interface ProfileHeaderProps extends InfoProps {
    /** Header buttons (see ProfileActions). */
    actions: ReactNode;
}

/** Banner, avatar with online dot, name/handle/bio/meta and the action buttons. */
export function ProfileHeader({ profile, isOnline, gamesPlayed, actions }: ProfileHeaderProps) {
    return (
        <div
            className="px-4 md:px-6 pt-8 pb-6 border-b border-border"
            style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-page) 100%)' }}
        >
            <Banner />
            <div className="flex flex-col md:flex-row gap-5 items-start">
                <Avatar profile={profile} isOnline={isOnline} />
                <Info profile={profile} isOnline={isOnline} gamesPlayed={gamesPlayed} />
                {actions}
            </div>
        </div>
    );
}
