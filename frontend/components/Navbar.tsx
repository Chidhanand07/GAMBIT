"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Globe2, Bell, User, BarChart2, Trophy, Settings, LogOut, Swords } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';

const NAV_LINKS = [
    { href: '/lobby', label: 'Play' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/analysis', label: 'Analysis' },
];

export default function Navbar() {
    const { onlineCount } = usePresence();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [challengeBanner, setChallengeBanner] = useState<any>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const socket = useSocket();

    // Use shared profile context — keeps auth state in sync with ProfileProvider
    const { profile, loading: authLoading } = useProfile();
    const user = profile ? { id: profile.id } : null;

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setIsNotifOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Challenge banner via socket — auto-dismiss after 30 s
    useEffect(() => {
        if (!socket || !profile) return;
        let dismissTimer: ReturnType<typeof setTimeout> | null = null;
        const onChallenge = (data: any) => {
            setChallengeBanner(data);
            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(() => setChallengeBanner(null), 30_000);
        };
        const onDeclined = () => { setChallengeBanner(null); if (dismissTimer) clearTimeout(dismissTimer); };
        const onReady = (data: { game_id: string }) => { setChallengeBanner(null); if (dismissTimer) clearTimeout(dismissTimer); router.push(`/game/${data.game_id}`); };
        socket.on('challenge_request', onChallenge);
        socket.on('challenge_declined', onDeclined);
        socket.on('challenge_ready', onReady);
        return () => {
            socket.off('challenge_request', onChallenge);
            socket.off('challenge_declined', onDeclined);
            socket.off('challenge_ready', onReady);
            if (dismissTimer) clearTimeout(dismissTimer);
        };
    }, [socket, profile]);

    const fetchNotifications = async (_userId: string) => {
        setNotifLoading(true);
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) setNotifications(await res.json());
        } catch {}
        finally { setNotifLoading(false); }
    };

    const markAllRead = async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        try { await fetch('/api/notifications/read', { method: 'PUT' }); } catch {}
    };

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setIsDropdownOpen(false);
        router.push('/');
        router.refresh();
    };

    const handleChallengeAccept = () => {
        if (!socket || !challengeBanner || !profile) return;
        socket.emit('challenge_accept', {
            from_user_id: challengeBanner.from_user_id,
            to_user_id: profile.id,
            time_control: challengeBanner.time_control,
            is_rated: challengeBanner.is_rated,
            color: challengeBanner.color === 'white' ? 'black' : 'white',
        });
        setChallengeBanner(null);
    };

    const handleChallengeDecline = () => {
        if (!socket || !challengeBanner || !profile) return;
        socket.emit('challenge_decline', { from_user_id: challengeBanner.from_user_id, by_username: profile.username });
        setChallengeBanner(null);
    };

    return (
        <>
            {/* Challenge notification — top-right toast */}
            {challengeBanner && (
                <div className="fixed top-[60px] right-4 z-[300] w-72 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-4"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-accent)' }}>
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    <span style={{ color: 'var(--accent)' }}>{challengeBanner.from_username}</span> challenges you
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                    {challengeBanner.time_control} min · {challengeBanner.is_rated ? 'Rated' : 'Casual'}
                                </div>
                            </div>
                            <button onClick={handleChallengeDecline}
                                className="text-text-tertiary hover:text-text-secondary transition-colors -mt-0.5 -mr-0.5 p-1">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleChallengeAccept}
                                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                                style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
                                Accept
                            </button>
                            <button onClick={handleChallengeDecline}
                                className="flex-1 py-2 rounded-lg text-sm transition-colors"
                                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}>
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main navbar */}
            <nav className="sticky top-0 z-50 h-[52px] flex items-center px-4 md:px-6 select-none"
                style={{ background: 'rgba(35,31,27,0.92)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid var(--border)' }}>

                <div className="flex items-center gap-8 w-full">

                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2 shrink-0 group"
                        style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }}>
                        <span className="text-accent font-serif transition-transform group-hover:scale-110 select-none pb-0.5" style={{ fontSize: '22px', lineHeight: 1 }}>♞</span>
                        <span className="text-[17px] font-semibold" style={{ letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>Gambit</span>
                    </Link>

                    {/* Center nav */}
                    <div className="hidden md:flex items-center gap-1 flex-1">
                        {NAV_LINKS.map(link => {
                            const active = isActive(link.href);
                            return (
                                <Link key={link.href} href={link.href}
                                    className={`relative px-3 py-1.5 text-sm transition-colors duration-150 rounded-md ${active ? '' : 'hover:bg-hover'}`}
                                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                    {link.label}
                                    {active && (
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                                            style={{ background: 'var(--accent)' }} />
                                    )}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Right cluster */}
                    <div className="flex items-center gap-3 ml-auto">

                        {/* Online pill */}
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-green-400"
                            style={{ background: 'rgba(79,168,90,0.1)', border: '0.5px solid rgba(79,168,90,0.25)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                            {onlineCount} online
                        </div>

                        {authLoading ? (
                            <div className="w-8 h-8 rounded-full skeleton" />
                        ) : user ? (
                            <>
                                {/* Bell */}
                                <div className="relative" ref={notifRef}>
                                    <button
                                        onClick={() => { setIsNotifOpen(v => !v); if (!isNotifOpen && profile?.id) fetchNotifications(profile.id); }}
                                        className="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = ''; }}>
                                        <Bell size={17} strokeWidth={1.5} />
                                        {notifications.some(n => !n.read) && (
                                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full border"
                                                style={{ background: 'var(--accent)', borderColor: 'var(--bg-elevated)' }} />
                                        )}
                                    </button>
                                    {isNotifOpen && (
                                        <div className="absolute top-[40px] right-0 w-72 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                                            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                                            <div className="px-4 py-2.5 border-b flex items-center justify-between"
                                                style={{ borderColor: 'var(--border)' }}>
                                                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Notifications</span>
                                                {notifications.some(n => !n.read) && (
                                                    <button onClick={markAllRead} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Mark all read</button>
                                                )}
                                            </div>
                                            <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                                                {notifLoading ? (
                                                    <div className="p-4 flex justify-center"><div className="w-5 h-5 border-2 border-t-accent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
                                                ) : notifications.length === 0 ? (
                                                    <div className="p-4 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No notifications</div>
                                                ) : notifications.slice(0, 8).map((n: any) => (
                                                    <div key={n.id} className={`px-4 py-3 text-sm transition-colors hover:bg-hover ${!n.read ? '' : 'opacity-60'}`}
                                                        style={{ color: !n.read ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                        {n.payload?.message || n.message || n.type}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Avatar dropdown */}
                                <div className="relative" ref={dropdownRef}>
                                    <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center transition-all"
                                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 2px var(--border-accent)')}
                                        onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                                        {profile?.avatar_url
                                            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                            : <span className="text-accent text-sm font-semibold">{(profile?.username || '?')[0].toUpperCase()}</span>}
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="absolute top-[44px] right-0 w-56 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                                            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                                            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                                                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                                                    {profile?.avatar_url
                                                        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        : <span className="text-accent text-sm font-semibold">{(profile?.username || '?')[0].toUpperCase()}</span>}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{profile?.display_name || profile?.username}</div>
                                                    <div className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{Math.round(profile?.rating_rapid ?? 1200)} Rapid</div>
                                                </div>
                                            </div>
                                            {[
                                                { href: `/profile/${profile?.username}`, label: 'My Profile', Icon: User },
                                                { href: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
                                                { href: '/settings', label: 'Settings', Icon: Settings },
                                            ].map(({ href, label, Icon }) => (
                                                <Link key={href} href={href} onClick={() => setIsDropdownOpen(false)}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-hover"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
                                                    <Icon size={14} strokeWidth={1.5} /> {label}
                                                </Link>
                                            ))}
                                            <div className="h-px mx-3 my-1" style={{ background: 'var(--border)' }} />
                                            <button onClick={handleLogout}
                                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-hover hover:text-red-300 transition-colors w-full text-left">
                                                <LogOut size={14} strokeWidth={1.5} /> Sign Out
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="hidden md:flex items-center gap-2">
                                <Link href="/login"
                                    className="px-3 py-1.5 text-sm rounded-md border border-transparent transition-colors"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLElement).style.background = ''; }}>
                                    Log In
                                </Link>
                                <Link href="/signup"
                                    className="px-4 py-1.5 text-sm font-medium rounded-lg btn-press transition-colors"
                                    style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
                                    Sign Up
                                </Link>
                            </div>
                        )}

                        {/* Mobile hamburger */}
                        <button className="md:hidden w-8 h-8 flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => setIsMenuOpen(v => !v)}>
                            {isMenuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Accent gradient line under navbar */}
            <div className="h-px w-full sticky top-[52px] z-40 pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.25 }} />

            {/* Mobile menu */}
            {isMenuOpen && (
                <div className="md:hidden fixed top-[53px] inset-x-0 z-40 border-b shadow-xl"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                    <div className="px-4 py-3 flex flex-col gap-1">
                        {NAV_LINKS.map(link => (
                            <Link key={link.href} href={link.href} onClick={() => setIsMenuOpen(false)}
                                className="px-3 py-2.5 rounded-lg text-sm transition-colors"
                                style={{
                                    background: isActive(link.href) ? 'var(--accent-dim)' : 'transparent',
                                    color: isActive(link.href) ? 'var(--accent)' : 'var(--text-secondary)',
                                }}>
                                {link.label}
                            </Link>
                        ))}
                        {!user && (
                            <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
                                <Link href="/login" onClick={() => setIsMenuOpen(false)}
                                    className="flex-1 text-center py-2 text-sm rounded-lg border transition-colors"
                                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                                    Log In
                                </Link>
                                <Link href="/signup" onClick={() => setIsMenuOpen(false)}
                                    className="flex-1 text-center py-2 text-sm font-medium rounded-lg"
                                    style={{ background: 'var(--accent)', color: '#0F0D0B' }}>
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
