import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import type { Profile } from '@/types/profile';

interface ProfileHeroProps {
    profile: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio' | 'country' | 'created_at'>;
    isOnline: boolean;
    gamesPlayed: number;
    /** Edit profile, or Add friend + Challenge. */
    actions: ReactNode;
}

/** The gradient hero card of Profile.dc.html: avatar, name, presence, handle, join date, bio and chips. */
export function ProfileHero({ profile, isOnline, gamesPlayed, actions }: ProfileHeroProps) {
    const name = profile.display_name || profile.username;
    const joined = new Date(profile.created_at).getFullYear();
    return (
        <section className="box-border flex flex-wrap items-center gap-6 rounded-20 border-1 border-line p-7 [background:var(--profile-hero-background-image)]">
            <Avatar name={name} src={profile.avatar_url} size="xl" ring />
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-[6px]">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="m-0 font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">{name}</h1>
                    {isOnline && (
                        <Pill dot title="Online now">
                            Online
                        </Pill>
                    )}
                </div>
                <span className="text-[16px] text-ink-muted">@{profile.username}</span>
                <span className="text-[14px] text-ink-muted">
                    Joined {joined} · {gamesPlayed} games
                </span>
                {profile.bio && <span className="mt-[6px] max-w-[560px] text-[16px]">{profile.bio}</span>}
                {profile.country && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Pill tone="neutral">{profile.country}</Pill>
                    </div>
                )}
            </div>
            {actions}
        </section>
    );
}
