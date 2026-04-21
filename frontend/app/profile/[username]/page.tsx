"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Settings, MapPin, Zap, Flame, Timer, BookOpen,
    UserPlus, Swords, Users, Clock, Camera, Check, Loader2, X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'loading'
type Tab = 'overview' | 'games' | 'stats' | 'friends'

interface GameRow {
    id: string
    time_control: string
    status: string
    result: string | null
    winner_id: string | null
    white_accuracy: number | null
    black_accuracy: number | null
    created_at: string
    ended_at: string | null
    white_id: string
    black_id: string
    white: { username: string; display_name: string | null; rating_rapid: number | null; rating_blitz: number | null; rating_bullet: number | null; rating_classical: number | null } | null
    black: { username: string; display_name: string | null; rating_rapid: number | null; rating_blitz: number | null; rating_bullet: number | null; rating_classical: number | null } | null
}

const RATING_ICONS: Record<string, React.ReactNode> = {
    bullet: <Zap size={14} strokeWidth={1.5} />,
    blitz: <Flame size={14} strokeWidth={1.5} />,
    rapid: <Timer size={14} strokeWidth={1.5} />,
    classical: <BookOpen size={14} strokeWidth={1.5} />,
}

function classifyTimeControl(tc: string): string {
    if (!tc) return 'rapid'
    const mins = parseInt(tc)
    if (isNaN(mins)) return 'rapid'
    if (mins <= 2) return 'bullet'
    if (mins <= 5) return 'blitz'
    if (mins <= 15) return 'rapid'
    return 'classical'
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function accColor(acc: number | null): string {
    if (acc == null) return 'text-text-tertiary'
    if (acc >= 85) return 'text-indicator-green'
    if (acc >= 70) return 'text-yellow-400'
    return 'text-red-400'
}

function RecentGamesList({ username, profileId }: { username: string; profileId: string }) {
    const [games, setGames] = useState<GameRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/profile/${encodeURIComponent(username)}/games?limit=5&offset=0`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : { games: [] })
            .then(d => setGames(d.games ?? []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [username])

    if (loading) return (
        <div className="py-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    )
    if (!games.length) return (
        <div className="py-8 text-center text-text-tertiary text-sm">No completed games yet.</div>
    )

    return (
        <div className="divide-y divide-border/50">
            {games.map(game => {
                const isWhite = game.white_id === profileId
                const opp = isWhite ? game.black : game.white
                const isWin = game.winner_id === profileId
                const isDraw = game.result === 'draw'
                const result = isDraw ? 'Draw' : isWin ? 'Win' : 'Loss'
                const resultClr = isDraw ? 'text-text-secondary' : isWin ? 'text-indicator-green' : 'text-red-400'
                return (
                    <div key={game.id} className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-medium w-8 ${resultClr}`}>{result}</span>
                            {opp?.username ? (
                                <Link href={`/profile/${opp.username}`} className="text-text-secondary text-sm hover:text-accent transition-colors">
                                    vs {opp.display_name || opp.username}
                                </Link>
                            ) : (
                                <span className="text-text-secondary text-sm">vs Unknown</span>
                            )}
                            <span className="text-text-tertiary text-xs">{game.time_control}</span>
                        </div>
                        <span className="text-text-tertiary text-xs">{formatDate(game.created_at)}</span>
                    </div>
                )
            })}
        </div>
    )
}

export default function ProfilePage({ params }: { params: { username: string } }) {
    const [profile, setProfile] = useState<any>(null)
    const [meProfile, setMeProfile] = useState<any>(null)
    const [isOwnProfile, setIsOwnProfile] = useState(false)
    const [isOnline, setIsOnline] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>('overview')

    // Edit modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [bio, setBio] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [country, setCountry] = useState('')
    const [saveLoading, setSaveLoading] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)

    // Games tab
    const [games, setGames] = useState<GameRow[]>([])
    const [gamesLoading, setGamesLoading] = useState(false)
    const [gamesOffset, setGamesOffset] = useState(0)
    const [hasMoreGames, setHasMoreGames] = useState(true)

    // Friends
    const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading')
    const [friends, setFriends] = useState<any[]>([])
    const [friendsLoading, setFriendsLoading] = useState(false)
    const [pendingRequests, setPendingRequests] = useState<any[]>([])
    const [pendingLoading, setPendingLoading] = useState(false)
    const [friendSearch, setFriendSearch] = useState('')

    // Stats
    const [statsData, setStatsData] = useState<any>(null)

    // Handle #games hash navigation (e.g. from "My Games" navbar link)
    useEffect(() => {
        const hash = window.location.hash.replace('#', '') as Tab
        if (['overview', 'games', 'stats', 'friends'].includes(hash)) {
            setActiveTab(hash)
        }
    }, [])

    useEffect(() => {
        const loadProfile = async () => {
            const [profileRes, meRes] = await Promise.all([
                fetch(`/api/profile/${encodeURIComponent(params.username)}`, { cache: 'no-store' }),
                fetch('/api/profile/me', { cache: 'no-store' }),
            ])
            if (!profileRes.ok) return
            const data = await profileRes.json()
            const me = meRes.ok ? await meRes.json() : null
            setProfile(data)
            setMeProfile(me)
            setIsOwnProfile(me?.id === data.id)
            setBio(data.bio || '')
            setDisplayName(data.display_name || data.username)
            setCountry(data.country || '')
        }
        loadProfile()
    }, [params.username])

    // Fetch friend status for non-own profiles
    useEffect(() => {
        if (!profile || !meProfile || isOwnProfile) { setFriendStatus('none'); return }
        fetch(`/api/friends/status/${encodeURIComponent(params.username)}`)
            .then(r => r.ok ? r.json() : { status: 'none' })
            .then(d => setFriendStatus(d.status ?? 'none'))
            .catch(() => setFriendStatus('none'))
    }, [profile?.id, meProfile?.id])

    // Load games when games tab is activated
    useEffect(() => {
        if (activeTab === 'games' && games.length === 0 && profile) {
            loadGames(0)
        }
    }, [activeTab, profile?.id])

    // Load stats when stats tab activated
    useEffect(() => {
        if (activeTab === 'stats' && !statsData && profile) {
            fetch(`/api/profile/${encodeURIComponent(params.username)}/stats`, { cache: 'no-store' })
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) setStatsData(d) })
        }
    }, [activeTab, profile?.id])

    // Load friends when friends tab is activated
    useEffect(() => {
        if (activeTab !== 'friends' || !profile) return
        const loadFriends = async () => {
            setFriendsLoading(true)
            try {
                // Pass userId so public profiles can also show friends
                const res = await fetch(`/api/friends?userId=${profile.id}`)
                setFriends(res.ok ? await res.json() : [])
            } catch { setFriends([]) }
            finally { setFriendsLoading(false) }

            if (isOwnProfile) {
                setPendingLoading(true)
                try {
                    const res = await fetch('/api/friends/pending')
                    setPendingRequests(res.ok ? await res.json() : [])
                } catch { setPendingRequests([]) }
                finally { setPendingLoading(false) }
            }
        }
        loadFriends()
    }, [activeTab, profile?.id, isOwnProfile])

    const handleFriendRequestAction = async (friendshipId: string, action: 'accept' | 'decline') => {
        await fetch(`/api/friends/${friendshipId}?action=${action}`, { method: 'PUT' })
        setPendingRequests(prev => prev.filter(r => r.id !== friendshipId))
        if (action === 'accept') {
            const req = pendingRequests.find(r => r.id === friendshipId)
            if (req?.requester) setFriends(prev => [...prev, { ...req.requester, friendship_id: friendshipId }])
        }
    }

    const loadGames = async (offset: number) => {
        if (!profile) return
        setGamesLoading(true)
        try {
            const res = await fetch(`/api/profile/${params.username}/games?limit=15&offset=${offset}`, { cache: 'no-store' })
            if (!res.ok) return
            const data = await res.json()
            const newGames: GameRow[] = data.games ?? []
            setGames(prev => offset === 0 ? newGames : [...prev, ...newGames])
            setGamesOffset(offset + newGames.length)
            setHasMoreGames(newGames.length === 15)
        } catch { /* silently fail */ }
        finally { setGamesLoading(false) }
    }

    // Online presence detection
    useEffect(() => {
        if (!profile?.id) return
        let mounted = true
        const supabase = createClient()
        const channel = supabase.channel(`presence-watch-${profile.id}-${Date.now()}`, {
            config: { presence: { key: profile.id } }
        })
        channel.on('presence', { event: 'sync' }, () => {
            if (!mounted) return
            const state = channel.presenceState()
            setIsOnline(Object.keys(state).includes(profile.id))
        })
        channel.subscribe()
        return () => { mounted = false; supabase.removeChannel(channel) }
    }, [profile?.id])

    const handleSaveProfile = async () => {
        if (!meProfile) return
        setSaveLoading(true)
        try {
            const res = await fetch('/api/profile/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim(), country: country.trim() })
            })
            if (res.ok) {
                const updated = await res.json()
                setProfile((p: any) => ({ ...p, ...updated }))
                setSaveSuccess(true)
                setTimeout(() => { setSaveSuccess(false); setIsEditModalOpen(false) }, 1000)
            }
        } finally {
            setSaveLoading(false)
        }
    }

    const handleAddFriend = async () => {
        if (!meProfile) return
        setFriendStatus('pending_sent')
        try {
            const res = await fetch('/api/friends/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addressee_username: params.username })
            })
            if (!res.ok) setFriendStatus('none')
        } catch { setFriendStatus('none') }
    }

    if (!profile) return (
        <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
        </div>
    )

    const gamesPlayed = profile.games_played ?? 0
    const wins = profile.wins ?? 0
    const losses = profile.losses ?? 0
    const draws = profile.draws ?? 0
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0


    const TABS: { id: Tab; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'games', label: `Games${gamesPlayed > 0 ? ` (${gamesPlayed})` : ''}` },
        { id: 'stats', label: 'Stats' },
        { id: 'friends', label: 'Friends' },
    ]

    return (
        <div className="max-w-[1100px] mx-auto px-0 md:px-0">

            {/* ── HEADER ── */}
            <div
                style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-page) 100%)' }}
                className="px-4 md:px-6 pt-8 pb-6 border-b border-border"
            >
                {/* Banner */}
                <div className="h-28 w-full relative overflow-hidden rounded-t-xl"
                    style={{ background: 'linear-gradient(135deg, #1A1714 0%, #2A1D10 50%, #1A1714 100%)' }}>
                    <svg className="absolute inset-0 w-full h-full opacity-5" style={{ color:'var(--accent)' }}>
                        <defs>
                            <pattern id="chess-bg" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                                <rect x="0" y="0" width="16" height="16" fill="currentColor" />
                                <rect x="16" y="16" width="16" height="16" fill="currentColor" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#chess-bg)" />
                    </svg>
                </div>
                <div className="flex flex-col md:flex-row gap-5 items-start">

                    {/* Avatar */}
                    <div className="relative shrink-0">
                        <div className="w-[88px] h-[88px] rounded-full bg-surface border-2 border-border-strong flex items-center justify-center overflow-hidden">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-accent text-3xl font-medium select-none">
                                    {(profile.display_name || profile.username || '?')[0].toUpperCase()}
                                </span>
                            )}
                        </div>
                        {isOnline && (
                            <div className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-indicator-green border-2 border-page shadow-[0_0_6px_rgba(79,168,90,0.8)]" title="Online now" />
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-medium text-text-primary">
                                {profile.display_name || profile.username}
                            </h1>
                            {isOnline && (
                                <span className="text-xs text-indicator-green bg-indicator-green/10 px-2 py-0.5 rounded-full">Online</span>
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

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap md:flex-nowrap md:self-start mt-2 md:mt-0 shrink-0">
                        {isOwnProfile ? (
                            <Link href="/settings"
                                className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-hover border border-border rounded-lg text-sm transition-colors">
                                <Settings size={15} strokeWidth={1.5} /> Edit Profile
                            </Link>
                        ) : (
                            <>
                                {friendStatus !== 'loading' && (
                                    friendStatus === 'friends' ? (
                                        <button disabled className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm text-indicator-green cursor-default">
                                            <Users size={15} strokeWidth={1.5} /> Friends
                                        </button>
                                    ) : friendStatus === 'pending_sent' ? (
                                        <button disabled className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-tertiary cursor-default">
                                            <Clock size={15} strokeWidth={1.5} /> Request Sent
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleAddFriend}
                                            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-hover border border-border rounded-lg text-sm transition-colors"
                                        >
                                            <UserPlus size={15} strokeWidth={1.5} /> Add Friend
                                        </button>
                                    )
                                )}
                                <Link href={`/challenge/${params.username}`}
                                    className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-surface rounded-lg text-sm transition-colors font-medium">
                                    <Swords size={15} strokeWidth={1.5} /> Challenge
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── TABS ── */}
            <div className="flex px-4 md:px-6 py-3 bg-page sticky top-[56px] z-10 border-b border-border">
                <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className="px-4 py-1.5 rounded-lg text-sm transition-colors"
                            style={{
                                background: activeTab === tab.id ? 'var(--bg-active)' : 'transparent',
                                border: activeTab === tab.id ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
                                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: activeTab === tab.id ? 500 : 400,
                            }}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-4 md:px-6 pt-6 pb-12 space-y-6">

                {/* ── OVERVIEW TAB ── */}
                {activeTab === 'overview' && (
                    <>
                        {/* Rating cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { id: 'bullet', label: 'Bullet', rating: profile.rating_bullet, peak: profile.peak_bullet },
                                { id: 'blitz', label: 'Blitz', rating: profile.rating_blitz, peak: profile.peak_blitz },
                                { id: 'rapid', label: 'Rapid', rating: profile.rating_rapid, peak: profile.peak_rapid },
                                { id: 'classical', label: 'Classical', rating: profile.rating_classical, peak: profile.peak_classical },
                            ].map(tc => (
                                <div key={tc.id} className="rounded-xl p-4" style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
                                    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                                        <span className="text-accent">{RATING_ICONS[tc.id]}</span>
                                        {tc.label}
                                    </div>
                                    <div className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                        {tc.rating ? Math.round(tc.rating) : '—'}
                                    </div>
                                    <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Peak {tc.rating ? Math.round(tc.rating) : '—'}</div>
                                </div>
                            ))}
                        </div>

                        {/* W/L/D record */}
                        <div className="bg-surface border border-border rounded-xl p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium">Record</h3>
                                <span className="text-text-tertiary text-sm">{gamesPlayed} games</span>
                            </div>
                            <div className="flex items-end gap-6 mb-4">
                                <div className="text-center">
                                    <div className="text-xl font-medium text-indicator-green tabular-nums">{wins}</div>
                                    <div className="text-xs text-text-tertiary mt-1">Wins</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl font-medium text-red-400 tabular-nums">{losses}</div>
                                    <div className="text-xs text-text-tertiary mt-1">Losses</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl font-medium text-text-secondary tabular-nums">{draws}</div>
                                    <div className="text-xs text-text-tertiary mt-1">Draws</div>
                                </div>
                                {gamesPlayed > 0 && (
                                    <div className="text-center ml-auto">
                                        <div className="text-xl font-medium text-text-primary tabular-nums">{winRate}%</div>
                                        <div className="text-xs text-text-tertiary mt-1">Win rate</div>
                                    </div>
                                )}
                            </div>
                            {gamesPlayed > 0 && (
                                <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
                                    {wins > 0 && <div style={{ flex: wins }} className="bg-indicator-green" />}
                                    {losses > 0 && <div style={{ flex: losses }} className="bg-red-500" />}
                                    {draws > 0 && <div style={{ flex: draws }} className="bg-[var(--text-tertiary)]" />}
                                </div>
                            )}
                        </div>

                        {/* Recent games preview */}
                        <div className="bg-surface border border-border rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                                <h3 className="text-sm font-medium text-text-primary">Recent Games</h3>
                                <button onClick={() => setActiveTab('games')} className="text-accent text-xs hover:underline">View all</button>
                            </div>
                            <RecentGamesList username={params.username} profileId={profile.id} />
                        </div>
                    </>
                )}

                {/* ── GAMES TAB ── */}
                {activeTab === 'games' && (
                    <div className="bg-surface border border-border rounded-xl overflow-hidden">
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_80px_80px_100px_80px] gap-0 border-b border-border bg-elevated px-4 py-2.5 text-xs uppercase tracking-wider text-text-tertiary font-medium hidden md:grid">
                            <span>Players</span>
                            <span className="text-center">Result</span>
                            <span className="text-center">Accuracy</span>
                            <span className="text-center">Date</span>
                            <span></span>
                        </div>
                        <div className="divide-y divide-border/50">
                            {games.map((game, i) => {
                                const isWhite = game.white_id === profile.id
                                const myColor = isWhite ? 'white' : 'black'
                                const oppColor = isWhite ? 'black' : 'white'
                                const opponent = game[oppColor as 'white' | 'black']
                                const me = game[myColor as 'white' | 'black']
                                const myAcc = isWhite ? game.white_accuracy : game.black_accuracy
                                const oppAcc = isWhite ? game.black_accuracy : game.white_accuracy
                                const isWin = game.winner_id === profile.id
                                const isDraw = game.result === 'draw'
                                const tc = classifyTimeControl(game.time_control)

                                const tcIcon = { bullet: '⚡', blitz: '🔥', rapid: '⏱', classical: '📖' }[tc] ?? '⏱'

                                return (
                                    <div key={game.id} className={`flex items-center gap-0 px-4 py-3 hover:bg-hover transition-colors ${i % 2 === 1 ? 'bg-elevated/20' : ''}`}>
                                        {/* TC icon */}
                                        <div className="shrink-0 w-10 text-center mr-1">
                                            <span className="text-lg" title={tc}>{tcIcon}</span>
                                            <div className="text-[10px] text-text-tertiary">{game.time_control ?? '—'}</div>
                                        </div>

                                        {/* Players */}
                                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`inline-block w-2.5 h-2.5 rounded-sm border shrink-0 ${myColor === 'white' ? 'bg-white border-gray-400' : 'bg-[#222] border-white/30'}`} />
                                                <span className="text-text-primary text-sm font-medium truncate">
                                                    {profile.display_name || profile.username}
                                                </span>
                                                <span className="text-text-tertiary text-xs tabular-nums shrink-0">
                                                    ({Math.round((isWhite ? game.white?.rating_rapid : game.black?.rating_rapid) ?? 1200)})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`inline-block w-2.5 h-2.5 rounded-sm border shrink-0 ${oppColor === 'white' ? 'bg-white border-gray-400' : 'bg-[#222] border-white/30'}`} />
                                                {opponent?.username ? (
                                                    <Link href={`/profile/${opponent.username}`} className="text-text-secondary text-sm hover:text-accent transition-colors truncate">
                                                        {opponent.display_name || opponent.username}
                                                    </Link>
                                                ) : <span className="text-text-secondary text-sm">Unknown</span>}
                                                <span className="text-text-tertiary text-xs tabular-nums shrink-0">
                                                    ({Math.round((isWhite ? game.black?.rating_rapid : game.white?.rating_rapid) ?? 1200)})
                                                </span>
                                            </div>
                                        </div>

                                        {/* Result scores */}
                                        {(() => {
                                            const resultText = isDraw ? '½-½' : isWin ? '1-0' : '0-1'
                                            return (
                                                <div className="shrink-0 flex items-center gap-1.5 ml-2">
                                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                                        style={{ background: isWin ? 'rgba(79,168,90,0.2)' : isDraw ? 'rgba(94,83,76,0.2)' : 'rgba(192,57,43,0.2)', color: isWin ? 'var(--green)' : isDraw ? 'var(--text-secondary)' : 'var(--red)' }}>
                                                        {isDraw ? 'D' : isWin ? 'W' : 'L'}
                                                    </div>
                                                    <span className="text-xs hidden sm:inline" style={{ color: isWin ? 'var(--green)' : isDraw ? 'var(--text-secondary)' : 'var(--red)' }}>
                                                        {resultText}
                                                    </span>
                                                </div>
                                            )
                                        })()}

                                        {/* Accuracy */}
                                        <div className="shrink-0 hidden md:flex flex-col items-center gap-0.5 w-16 ml-3">
                                            <span className={`text-xs font-medium tabular-nums ${accColor(myAcc)}`}>
                                                {myAcc != null ? `${myAcc}%` : '—'}
                                            </span>
                                            <span className={`text-xs tabular-nums ${accColor(oppAcc)}`}>
                                                {oppAcc != null ? `${oppAcc}%` : '—'}
                                            </span>
                                        </div>

                                        {/* Date */}
                                        <div className="shrink-0 hidden sm:block text-text-tertiary text-xs w-20 text-right ml-2">
                                            {formatDate(game.created_at)}
                                        </div>

                                        {/* Review button */}
                                        <div className="shrink-0 ml-3">
                                            <Link href={`/game/${game.id}`}
                                                className="px-3 py-1.5 bg-elevated hover:bg-hover border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
                                                Review
                                            </Link>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        {games.length === 0 && !gamesLoading && (
                            <div className="py-16 text-center text-text-tertiary">No completed games yet.</div>
                        )}
                        {gamesLoading && (
                            <div className="py-8 flex justify-center">
                                <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
                            </div>
                        )}
                        {hasMoreGames && !gamesLoading && games.length > 0 && (
                            <div className="px-5 py-4 border-t border-border">
                                <button
                                    onClick={() => loadGames(gamesOffset)}
                                    className="w-full py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
                                >
                                    Load more games
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STATS TAB ── */}
                {activeTab === 'stats' && (
                    <div className="space-y-6">
                        {!statsData ? (
                            <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
                        ) : (
                            <>
                                {/* Total games big card */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-surface border border-border rounded-xl p-5 text-center">
                                        <div className="text-4xl font-bold text-text-primary tabular-nums">{statsData.total ?? 0}</div>
                                        <div className="text-text-tertiary text-sm mt-1">Total Games</div>
                                    </div>
                                    <div className="bg-surface border border-border rounded-xl p-5 text-center">
                                        <div className="text-4xl font-bold text-indicator-green tabular-nums">{statsData.wins ?? 0}</div>
                                        <div className="text-text-tertiary text-sm mt-1">Wins</div>
                                    </div>
                                    <div className="bg-surface border border-border rounded-xl p-5 text-center">
                                        <div className="text-4xl font-bold text-red-400 tabular-nums">{statsData.losses ?? 0}</div>
                                        <div className="text-text-tertiary text-sm mt-1">Losses</div>
                                    </div>
                                    <div className="bg-surface border border-border rounded-xl p-5 text-center">
                                        <div className="text-4xl font-bold text-text-secondary tabular-nums">{statsData.draws ?? 0}</div>
                                        <div className="text-text-tertiary text-sm mt-1">Draws</div>
                                    </div>
                                </div>

                                {/* Per-category stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {([
                                        { key: 'bullet', label: 'Bullet', icon: RATING_ICONS.bullet, rating: statsData.ratings?.bullet },
                                        { key: 'blitz', label: 'Blitz', icon: RATING_ICONS.blitz, rating: statsData.ratings?.blitz },
                                        { key: 'rapid', label: 'Rapid', icon: RATING_ICONS.rapid, rating: statsData.ratings?.rapid },
                                        { key: 'classical', label: 'Classical', icon: RATING_ICONS.classical, rating: statsData.ratings?.classical },
                                    ] as const).map(cat => {
                                        const s = statsData.byCategory?.[cat.key] ?? { played: 0, wins: 0, losses: 0, draws: 0 }
                                        return (
                                            <div key={cat.key} className="bg-surface border border-border rounded-xl p-4">
                                                <div className="flex items-center gap-1.5 text-text-secondary text-xs uppercase tracking-wider mb-3">
                                                    <span className="text-accent">{cat.icon}</span>{cat.label}
                                                </div>
                                                <div className="text-3xl font-bold text-text-primary tabular-nums mb-3">{Math.round(cat.rating ?? 1200)}</div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-text-tertiary">Played</span>
                                                        <span className="text-text-primary tabular-nums font-medium">{s.played}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-indicator-green">Wins</span>
                                                        <span className="text-indicator-green tabular-nums font-medium">{s.wins}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-red-400">Losses</span>
                                                        <span className="text-red-400 tabular-nums font-medium">{s.losses}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-text-tertiary">Draws</span>
                                                        <span className="text-text-secondary tabular-nums">{s.draws}</span>
                                                    </div>
                                                </div>
                                                {s.played > 0 && (
                                                    <div className="flex h-1.5 rounded-full overflow-hidden gap-px mt-3">
                                                        {s.wins > 0 && <div style={{ flex: s.wins }} className="bg-indicator-green" />}
                                                        {s.losses > 0 && <div style={{ flex: s.losses }} className="bg-red-500" />}
                                                        {s.draws > 0 && <div style={{ flex: s.draws }} className="bg-border" />}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── FRIENDS TAB ── */}
                {activeTab === 'friends' && (
                    <div className="space-y-4">
                        {/* Pending requests — only shown on own profile */}
                        {isOwnProfile && (
                            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                                <div className="px-5 py-3 border-b border-border bg-elevated">
                                    <h3 className="text-sm font-medium text-text-primary">
                                        Pending Requests
                                        {pendingRequests.length > 0 && (
                                            <span className="ml-2 text-xs bg-accent text-surface px-1.5 py-0.5 rounded-full">{pendingRequests.length}</span>
                                        )}
                                    </h3>
                                </div>
                                {pendingLoading ? (
                                    <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
                                ) : pendingRequests.length === 0 ? (
                                    <p className="text-text-tertiary text-sm text-center py-6">No pending requests.</p>
                                ) : (
                                    <div className="divide-y divide-border/50">
                                        {pendingRequests.map(req => (
                                            <div key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-elevated border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
                                                        {req.requester?.avatar_url
                                                            ? <img src={req.requester.avatar_url} alt="" className="w-full h-full object-cover" />
                                                            : <span className="text-accent text-sm font-medium">{(req.requester?.username ?? '?')[0].toUpperCase()}</span>
                                                        }
                                                    </div>
                                                    <div>
                                                        <Link href={`/profile/${req.requester?.username}`} className="text-text-primary text-sm font-medium hover:text-accent transition-colors">
                                                            {req.requester?.display_name || req.requester?.username}
                                                        </Link>
                                                        <div className="text-text-tertiary text-xs">{Math.round(req.requester?.rating_rapid ?? 1200)} Rapid</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleFriendRequestAction(req.id, 'accept')}
                                                        className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface text-xs rounded-lg font-medium transition-colors">
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => handleFriendRequestAction(req.id, 'decline')}
                                                        className="px-3 py-1.5 bg-surface hover:bg-hover border border-border text-text-secondary text-xs rounded-lg transition-colors">
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Friends list */}
                        <div className="bg-surface border border-border rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-elevated gap-3">
                                <h3 className="text-sm font-medium text-text-primary shrink-0">
                                    {isOwnProfile ? 'My Friends' : `${profile.display_name || profile.username}'s Friends`}
                                    {friends.length > 0 && <span className="ml-2 text-xs text-text-tertiary">({friends.length})</span>}
                                </h3>
                                {friends.length > 0 && (
                                    <input
                                        type="text"
                                        placeholder="Search friends…"
                                        value={friendSearch}
                                        onChange={e => setFriendSearch(e.target.value)}
                                        className="flex-1 max-w-[200px] h-8 bg-page border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                                    />
                                )}
                            </div>
                            {friendsLoading ? (
                                <div className="py-10 flex justify-center"><div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
                            ) : friends.length === 0 ? (
                                <p className="text-text-tertiary text-sm text-center py-10">No friends yet.</p>
                            ) : (
                                <div className="divide-y divide-border/50">
                                    {friends
                                        .filter(f => !friendSearch || (f.username ?? '').toLowerCase().includes(friendSearch.toLowerCase()) || (f.display_name ?? '').toLowerCase().includes(friendSearch.toLowerCase()))
                                        .map(f => (
                                        <div key={f.friendship_id ?? f.username} className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-elevated border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
                                                    {f.avatar_url
                                                        ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        : <span className="text-accent font-medium">{(f.username ?? '?')[0].toUpperCase()}</span>
                                                    }
                                                </div>
                                                <div>
                                                    <Link href={`/profile/${f.username}`} className="text-text-primary text-sm font-medium hover:text-accent transition-colors block">
                                                        {f.display_name || f.username}
                                                    </Link>
                                                    <div className="text-text-tertiary text-xs">{Math.round(f.rating_rapid ?? 1200)} Rapid</div>
                                                </div>
                                            </div>
                                            {isOwnProfile && (
                                                <Link href={`/challenge/${f.username}`}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface text-xs font-medium rounded-lg transition-colors">
                                                    <Swords size={12} strokeWidth={1.5} /> Challenge
                                                </Link>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Profile Modal — Chess.com-style */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !saveLoading && setIsEditModalOpen(false)} />
                    <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                            <div>
                                <h2 className="text-base font-medium text-text-primary">Public Profile</h2>
                                <p className="text-xs text-text-tertiary mt-0.5">Visible to all players on Gambit</p>
                            </div>
                            <button onClick={() => !saveLoading && setIsEditModalOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-elevated text-text-tertiary hover:text-text-primary transition-colors">
                                <X size={18} strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 px-6 py-5">
                            {/* Avatar + username row */}
                            <div className="flex items-center gap-4 mb-6 pb-5 border-b border-border">
                                <div className="relative group shrink-0">
                                    <div className="w-[72px] h-[72px] rounded-full bg-elevated border-2 border-border-strong flex items-center justify-center overflow-hidden">
                                        {profile.avatar_url ? (
                                            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-accent text-2xl font-medium select-none">
                                                {(profile.display_name || profile.username || '?')[0].toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                        <Camera size={16} className="text-white" strokeWidth={1.5} />
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-text-primary font-medium truncate">{profile.username}</div>
                                    <div className="text-text-tertiary text-xs mt-0.5">@{profile.username}</div>
                                    <div className="flex gap-3 mt-1.5 text-xs text-text-tertiary">
                                        <span className="flex items-center gap-1"><Zap size={11} strokeWidth={1.5} className="text-accent" /> {Math.round(profile.rating_bullet ?? 1200)}</span>
                                        <span className="flex items-center gap-1"><Flame size={11} strokeWidth={1.5} className="text-accent" /> {Math.round(profile.rating_blitz ?? 1200)}</span>
                                        <span className="flex items-center gap-1"><Timer size={11} strokeWidth={1.5} className="text-accent" /> {Math.round(profile.rating_rapid ?? 1200)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Form fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-text-secondary text-sm font-medium mb-1.5">Display Name</label>
                                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={30}
                                        className="w-full h-[42px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors" />
                                    <p className="text-text-tertiary text-xs mt-1">{displayName.length}/30 characters</p>
                                </div>

                                <div>
                                    <label className="block text-text-secondary text-sm font-medium mb-1.5">Bio</label>
                                    <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
                                        placeholder="Tell other players about yourself..."
                                        className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors resize-none" />
                                    <p className="text-text-tertiary text-xs mt-1">{bio.length}/160 characters</p>
                                </div>

                                <div>
                                    <label className="block text-text-secondary text-sm font-medium mb-1.5">Country / Location</label>
                                    <input type="text" value={country} onChange={e => setCountry(e.target.value)} maxLength={50}
                                        placeholder="e.g. India, New York, London..."
                                        className="w-full h-[42px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors" />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0 bg-elevated rounded-b-2xl">
                            <button onClick={() => !saveLoading && setIsEditModalOpen(false)}
                                className="px-5 py-2.5 bg-surface hover:bg-hover border border-border rounded-lg text-sm text-text-secondary transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveProfile} disabled={saveLoading || saveSuccess}
                                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 min-w-[120px] justify-center
                                    ${saveSuccess
                                        ? 'bg-indicator-green text-surface'
                                        : 'bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface'
                                    }`}>
                                {saveSuccess ? <><Check size={16} strokeWidth={2} /> Saved!</>
                                    : saveLoading ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                                    : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
