'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import { useChallengeBanner } from '../hooks/useChallengeBanner';
import { useNavbarMenus } from '../hooks/useNavbarMenus';
import { useNotifications } from '../hooks/useNotifications';
import { ChallengeToast } from './ChallengeToast';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { DesktopNavLinks, GuestLinks, MobileMenu } from './NavLinks';

function Logo() {
    return (
        <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
            style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }}
        >
            <span
                className="text-accent font-serif transition-transform group-hover:scale-110 select-none pb-0.5"
                style={{ fontSize: '22px', lineHeight: 1 }}
            >
                ♞
            </span>
            <span
                className="text-[17px] font-semibold"
                style={{ letterSpacing: '-0.3px', color: 'var(--text-primary)' }}
            >
                Gambit
            </span>
        </Link>
    );
}

function OnlinePill({ count }: { count: number }) {
    return (
        <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-green-400"
            style={{ background: 'rgba(79,168,90,0.1)', border: '0.5px solid rgba(79,168,90,0.25)' }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            {count} online
        </div>
    );
}

export default function Navbar() {
    const { onlineCount } = usePresence();
    const router = useRouter();
    const pathname = usePathname();
    const menus = useNavbarMenus();
    // Use shared profile context — keeps auth state in sync with ProfileProvider
    const { profile, loading: authLoading } = useProfile();
    const notifs = useNotifications(profile?.id);
    const user = profile ? { id: profile.id } : null;
    const challenge = useChallengeBanner(profile);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        menus.setIsDropdownOpen(false);
        router.push('/');
        router.refresh();
    };

    const toggleNotifications = () => {
        menus.setIsNotifOpen((v) => !v);
        if (!menus.isNotifOpen && profile?.id) void notifs.load();
    };

    const signedInControls = (
        <>
            <NotificationBell
                panelRef={menus.notifRef}
                isOpen={menus.isNotifOpen}
                onToggle={toggleNotifications}
                notifications={notifs.notifications}
                loading={notifs.loading}
                error={notifs.error}
                hasUnread={notifs.hasUnread}
                onMarkAllRead={() => void notifs.markAllRead()}
            />
            <UserMenu
                menuRef={menus.dropdownRef}
                profile={profile}
                isOpen={menus.isDropdownOpen}
                onToggle={() => menus.setIsDropdownOpen(!menus.isDropdownOpen)}
                onClose={() => menus.setIsDropdownOpen(false)}
                onLogout={() => void handleLogout()}
            />
        </>
    );

    return (
        <>
            {challenge.challengeBanner && (
                <ChallengeToast
                    challenge={challenge.challengeBanner}
                    onAccept={challenge.accept}
                    onDecline={challenge.decline}
                />
            )}

            {/* Main navbar */}
            <nav
                className="sticky top-0 z-50 h-[52px] flex items-center px-4 md:px-6 select-none"
                style={{
                    background: 'rgba(35,31,27,0.92)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '0.5px solid var(--border)',
                }}
            >
                <div className="flex items-center gap-8 w-full">
                    <Logo />
                    <DesktopNavLinks pathname={pathname} />

                    {/* Right cluster */}
                    <div className="flex items-center gap-3 ml-auto">
                        <OnlinePill count={onlineCount} />

                        {authLoading ? (
                            <div className="w-8 h-8 rounded-full skeleton" />
                        ) : user ? (
                            signedInControls
                        ) : (
                            <GuestLinks />
                        )}

                        {/* Mobile hamburger */}
                        <button
                            className="md:hidden w-8 h-8 flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => menus.setIsMenuOpen((v) => !v)}
                        >
                            {menus.isMenuOpen ? (
                                <X size={20} strokeWidth={1.5} />
                            ) : (
                                <Menu size={20} strokeWidth={1.5} />
                            )}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Accent gradient line under navbar */}
            <div
                className="h-px w-full sticky top-[52px] z-40 pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.25 }}
            />

            {menus.isMenuOpen && (
                <MobileMenu pathname={pathname} signedIn={!!user} onClose={() => menus.setIsMenuOpen(false)} />
            )}
        </>
    );
}
