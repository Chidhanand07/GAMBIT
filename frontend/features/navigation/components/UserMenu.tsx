import type { RefObject } from 'react';
import Link from 'next/link';
import { LogOut, Settings, Trophy, User } from 'lucide-react';
import { hoverStyles, textHover } from '../hover';
import type { NavProfile } from '../types';

const DEFAULT_RAPID_RATING = 1200;

const avatarHover = hoverStyles({ boxShadow: '0 0 0 2px var(--border-accent)' }, { boxShadow: '' });

function AvatarContent({ profile }: { profile: NavProfile | null }) {
    return profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
    ) : (
        <span className="text-accent text-sm font-semibold">{(profile?.username || '?')[0].toUpperCase()}</span>
    );
}

function DropdownHeader({ profile }: { profile: NavProfile | null }) {
    return (
        <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
            >
                <AvatarContent profile={profile} />
            </div>
            <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {profile?.display_name || profile?.username}
                </div>
                <div className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {Math.round(profile?.rating_rapid ?? DEFAULT_RAPID_RATING)} Rapid
                </div>
            </div>
        </div>
    );
}

interface UserMenuProps {
    menuRef: RefObject<HTMLDivElement | null>;
    profile: NavProfile | null;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    onLogout: () => void;
}

/** Avatar button with the profile / leaderboard / settings / sign-out dropdown. */
export function UserMenu({ menuRef, profile, isOpen, onToggle, onClose, onLogout }: UserMenuProps) {
    const items = [
        { href: `/profile/${profile?.username}`, label: 'My Profile', Icon: User },
        { href: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
        { href: '/settings', label: 'Settings', Icon: Settings },
    ];
    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={onToggle}
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center transition-all"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                {...avatarHover}
            >
                <AvatarContent profile={profile} />
            </button>

            {isOpen && (
                <div
                    className="absolute top-[44px] right-0 w-56 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}
                >
                    <DropdownHeader profile={profile} />
                    {items.map(({ href, label, Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={onClose}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-hover"
                            style={{ color: 'var(--text-secondary)' }}
                            {...textHover}
                        >
                            <Icon size={14} strokeWidth={1.5} /> {label}
                        </Link>
                    ))}
                    <div className="h-px mx-3 my-1" style={{ background: 'var(--border)' }} />
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-hover hover:text-red-300 transition-colors w-full text-left"
                    >
                        <LogOut size={14} strokeWidth={1.5} /> Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}
