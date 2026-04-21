"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap, Flame, Timer, BookOpen, Settings, Calendar, MonitorOff, Globe2, Link2, Copy, Shuffle, X, Check, Loader2, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import dynamic from 'next/dynamic';
const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });

const BASE_TIME_CONTROLS = [
    { id: 'bullet', label: 'Bullet', time: '1 min', mins: 1, inc: 0, icon: <Zap size={28} strokeWidth={1.5} /> },
    { id: 'blitz', label: 'Blitz', time: '3 min', mins: 3, inc: 0, icon: <Flame size={28} strokeWidth={1.5} /> },
    { id: 'rapid', label: 'Rapid', time: '10 min', mins: 10, inc: 0, icon: <Timer size={28} strokeWidth={1.5} /> },
    { id: 'classical', label: 'Classical', time: '30 min', mins: 30, inc: 0, icon: <BookOpen size={28} strokeWidth={1.5} /> },
    { id: 'custom', label: 'Custom', time: 'Configure', mins: 5, inc: 0, icon: <Settings size={28} strokeWidth={1.5} /> },
    { id: 'daily', label: 'Daily', time: '1 day/move', mins: 1440, inc: 0, icon: <Calendar size={28} strokeWidth={1.5} /> },
];
const TIME_CONTROL_META: Record<string, { subtitle: string; badge?: string }> = {
    bullet:    { subtitle: 'Fastest games · Pure instinct' },
    blitz:     { subtitle: 'Standard competitive play', badge: 'Popular' },
    rapid:     { subtitle: 'Longer games · Deep strategy' },
    classical: { subtitle: 'Maximum depth & preparation' },
    custom:    { subtitle: 'Set your own time control' },
    daily:     { subtitle: 'Days per move · Correspondence' },
};

export default function LobbyPage() {
    const router = useRouter()
    const socket = useSocket()

    const { onlineCount } = usePresence();
    const [selectedTc, setSelectedTc] = useState('blitz');
    const [activeGame, setActiveGame] = useState<{ id: string; time_control: string } | null>(null);
    const [searching, setSearching] = useState(false);
    const [searchTime, setSearchTime] = useState(0);

    // Use shared profile context — avoids duplicate /api/profile/me calls
    const { profile: myProfile } = useProfile()

    // Private Modal State
    const [isPrivateModalOpen, setIsPrivateModalOpen] = useState(false);
    const [inviteState, setInviteState] = useState<'config' | 'generating' | 'share'>('config');
    const [privateTc, setPrivateTc] = useState('rapid');
    const [privateColor, setPrivateColor] = useState('random');
    const [privateRated, setPrivateRated] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [inviteGameId, setInviteGameId] = useState<string | null>(null)
    const [justCopied, setJustCopied] = useState(false);

    // Custom time modal
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [customMin, setCustomMin] = useState(5);
    const [customInc, setCustomInc] = useState(0);

    // Active game warning
    const [showActiveWarning, setShowActiveWarning] = useState(false);

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';

    const getTcMinutes = useCallback(() => {
        if (selectedTc === 'custom') return { mins: customMin, inc: customInc }
        const tc = BASE_TIME_CONTROLS.find(t => t.id === selectedTc)
        return { mins: tc?.mins ?? 10, inc: tc?.inc ?? 0 }
    }, [selectedTc, customMin, customInc])

    // Check for active game on mount — redirect if found
    useEffect(() => {
        fetch('/api/games/active')
            .then(r => r.ok ? r.json() : null)
            .then(game => {
                if (game?.id) setActiveGame(game)
            })
            .catch(() => {})
    }, [])

    // Search timer
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (searching) {
            interval = setInterval(() => setSearchTime(t => t + 1), 1000);
        } else {
            setSearchTime(0);
        }
        return () => clearInterval(interval);
    }, [searching]);

    // Socket: listen for match_found and game_start
    useEffect(() => {
        if (!socket) return

        const onMatchFound = (data: { id?: string; game_id?: string; white_id: string; black_id: string }) => {
            setSearching(false)
            router.push(`/game/${data.id ?? data.game_id}`)
        }

        const onGameStart = (data: { id: string }) => {
            setIsPrivateModalOpen(false)
            router.push(`/game/${data.id}`)
        }

        const onConnect = () => {
            if (!myProfile) return
            socket.emit('authenticate', myProfile.id)
            if (searching) {
                const { mins, inc } = getTcMinutes()
                socket.emit('join_queue', {
                    user: {
                        id: myProfile.id,
                        rating: myProfile.rating_rapid ?? 1200,
                        games_played: myProfile.games_played ?? 0,
                    },
                    time_control: mins,
                    increment: inc,
                })
            }
        }

        socket.on('match_found', onMatchFound)
        socket.on('game_start', onGameStart)
        socket.on('connect', onConnect)

        return () => {
            socket.off('match_found', onMatchFound)
            socket.off('game_start', onGameStart)
            socket.off('connect', onConnect)
        }
    }, [socket, router, myProfile, searching, getTcMinutes])

    // Join private game room when invite is generated
    useEffect(() => {
        if (!socket || !inviteGameId) return
        socket.emit('join_game', inviteGameId)
    }, [socket, inviteGameId])

    // onlineCount comes from shared PresenceProvider — no local subscription needed

    const handlePlayOnline = () => {
        if (!socket) return
        const { mins, inc } = getTcMinutes()

        if (!myProfile) {
            router.push('/login?redirect=/lobby')
            return
        }

        if (activeGame) {
            setShowActiveWarning(true)
            return
        }

        // M2/L6: authenticate first, then join queue only after server confirms identity
        socket.emit('authenticate', myProfile.id)
        socket.once('authenticated', () => {
            socket.emit('join_queue', {
                user: { id: myProfile.id },
                time_control: mins,
                increment: inc,
                is_rated: true,
            })
        })
        // Fallback: if server doesn't emit 'authenticated', join after short delay
        setTimeout(() => {
            if (!socket.hasListeners || socket.listeners('authenticated').length === 0) return
            socket.off('authenticated')
            socket.emit('join_queue', {
                user: { id: myProfile.id },
                time_control: mins,
                increment: inc,
                is_rated: true,
            })
        }, 1500)
        setSearching(true)
    }

    const handleCancelSearch = () => {
        if (socket && myProfile) socket.emit('leave_queue', myProfile.id)
        setSearching(false)
    }

    const handleCreatePrivate = async () => {
        setInviteState('generating');
        try {
            const timeValue = privateTc === 'custom' ? `${customMin}+${customInc}` : privateTc
            const res = await fetch('/api/games/private/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timeControl: timeValue,
                    color: privateColor,
                    isRated: privateRated
                })
            });
            const data = await res.json();
            if (data.token) {
                setInviteLink(`${window.location.origin}/join/${data.token}`)
                setInviteGameId(data.game_id ?? null)
                setInviteState('share');
            } else {
                console.error('Private game error:', data.error)
                setInviteState('config');
            }
        } catch {
            setInviteState('config');
        }
    };

    const copyInvite = () => {
        navigator.clipboard.writeText(inviteLink);
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);
    };

    const searchRadius = searchTime <= 10 ? 50 : searchTime <= 20 ? 100 : searchTime <= 35 ? 150 : searchTime <= 60 ? 250 : 400;

  const tcForDisplay = BASE_TIME_CONTROLS.find(t => t.id === selectedTc);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 page-enter">
      <KnightBackground mode="lobby" />

      {/* Active game banner */}
      {activeGame && (
        <div className="mb-4 px-5 py-3 rounded-xl flex items-center justify-between"
          style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)' }}>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>You have an active game in progress</span>
          <Link href={`/game/${activeGame.id}`}
            className="px-4 py-1.5 rounded-lg text-sm font-medium btn-press"
            style={{ background:'var(--accent)', color:'#0F0D0B' }}>
            Resume →
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Play section ── */}
        <div className="flex-1 min-w-0">

          {/* Welcome bar */}
          <div className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between"
            style={{ background:'var(--accent-glow)', border:'0.5px solid var(--border-accent)' }}>
            <div>
              <div className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                {myProfile ? `Welcome back, ${myProfile.display_name || myProfile.username}` : 'Welcome to Gambit'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {onlineCount} player{onlineCount !== 1 ? 's' : ''} online
              </div>
            </div>
            {myProfile && (
              <div className="text-right hidden sm:block">
                <div className="font-semibold tabular-nums text-lg text-accent">{Math.round(myProfile.rating_blitz ?? 1200)}</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Blitz rating</div>
              </div>
            )}
          </div>

          {/* Time control grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            {BASE_TIME_CONTROLS.map(tc => {
              const meta = TIME_CONTROL_META[tc.id] ?? { subtitle: '' };
              const isSelected = selectedTc === tc.id;
              const timeLabel = tc.id === 'custom' && selectedTc === 'custom' ? `${customMin}+${customInc}` : tc.time;
              return (
                <div key={tc.id}
                  onClick={() => tc.id === 'custom' ? setIsCustomModalOpen(true) : setSelectedTc(tc.id)}
                  className="relative rounded-xl p-4 cursor-pointer transition-all duration-150 select-none"
                  style={{
                    background: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    border: isSelected ? '1.5px solid var(--accent)' : '0.5px solid var(--border)',
                  }}
                  onMouseEnter={e => { if (!isSelected) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor='var(--border-accent)'; el.style.transform='translateY(-2px)'; el.style.boxShadow='0 4px 16px var(--accent-glow)'; } }}
                  onMouseLeave={e => { if (!isSelected) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor='var(--border)'; el.style.transform=''; el.style.boxShadow=''; } }}>

                  <div className="flex items-center justify-between mb-3">
                    <span className={isSelected ? 'text-accent' : 'text-text-secondary'}>{tc.icon}</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{timeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tc.label}</div>
                    {meta.badge && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded text-accent"
                        style={{ background:'var(--accent-dim)', border:'0.5px solid var(--border-accent)' }}>
                        {meta.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>{meta.subtitle}</div>
                </div>
              );
            })}
          </div>

          {/* Offline bar */}
          <div className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between cursor-pointer transition-colors hover:bg-hover"
            style={{ border:'1px dashed var(--border-strong)' }}
            onClick={() => router.push('/offline')}>
            <div className="flex items-center gap-3">
              <MonitorOff size={16} className="text-text-secondary" strokeWidth={1.5} />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Play Offline</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No account needed</div>
              </div>
            </div>
            <span className="text-sm text-accent">Open board →</span>
          </div>

          {/* Action buttons */}
          {searching ? (
            <div className="rounded-xl p-5 text-center"
              style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-accent)' }}>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-t-accent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Finding opponent…</span>
              </div>
              <div className="text-sm mb-4 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {Math.floor(searchTime/60).toString().padStart(2,'0')}:{(searchTime%60).toString().padStart(2,'0')}
              </div>
              <button onClick={() => { socket?.emit('leave_queue', myProfile?.id); setSearching(false); }}
                className="px-6 py-2 rounded-lg border text-sm transition-colors hover:bg-hover"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                Cancel search
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto' }}>
              <button
                onClick={async () => {
                  if (!myProfile || !socket) { router.push('/login'); return; }
                  if (activeGame) { setShowActiveWarning(true); return; }
                  const { mins, inc } = getTcMinutes();
                  socket.emit('join_queue', {
                    user: myProfile,
                    time_control: selectedTc === 'custom' ? `${customMin}+${customInc}` : String(tcForDisplay?.mins ?? 10),
                    increment: inc
                  });
                  setSearching(true);
                }}
                className="h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm btn-press transition-all"
                style={{ background:'var(--accent)', color:'#0F0D0B', gridColumn: 'span 2' }}
                onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
                onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Play Online
              </button>
              <button
                onClick={() => router.push('/offline')}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm btn-press transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-accent)';(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-strong)';(e.currentTarget as HTMLElement).style.background='var(--bg-elevated)'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                Computer
              </button>
              <button
                onClick={() => setIsPrivateModalOpen(true)}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm btn-press transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-accent)';(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-strong)';(e.currentTarget as HTMLElement).style.background='var(--bg-elevated)'}}>
                <Users size={15} strokeWidth={1.5} />
                Friend
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Live games sidebar ── */}
        <div className="lg:w-72 shrink-0">
          <div className="rounded-xl overflow-hidden" style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs uppercase tracking-[0.1em] font-medium" style={{ color: 'var(--text-tertiary)' }}>Live Games</span>
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="p-3">
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <span className="opacity-20 font-serif select-none" style={{ color: 'var(--text-tertiary)', fontSize: '50px', lineHeight: 1 }}>♘</span>
                <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>No live games</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Start one and it&apos;ll appear here</div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: 'Online', value: String(onlineCount) },
              { label: 'Your rating', value: String(Math.round(myProfile?.rating_rapid ?? 1200)) },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                <div className="font-semibold text-lg tabular-nums text-accent">{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active game warning modal ── */}
      {showActiveWarning && activeGame && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowActiveWarning(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)' }}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M9 18 4.5 15V9l7.5-4.5L19.5 9v6L12 19.5"/>
                  <path d="M12 12v4M12 8h.01"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Game already in progress
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                You have an active match running. Please finish or resign it before starting a new game.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => router.push(`/game/${activeGame.id}`)}
                  className="w-full py-3 rounded-xl font-semibold text-sm btn-press transition-all"
                  style={{ background: 'var(--accent)', color: '#0F0D0B' }}>
                  Return to my game →
                </button>
                <button
                  onClick={() => setShowActiveWarning(false)}
                  className="w-full py-2.5 rounded-xl text-sm transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}>
                  Stay here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Private game modal ── */}
      {isPrivateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setIsPrivateModalOpen(false); setInviteState('config'); }} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-strong)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background:'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <h2 className="font-medium" style={{ color: 'var(--text-primary)' }}>Play a Friend</h2>
              <button onClick={() => { setIsPrivateModalOpen(false); setInviteState('config'); }}
                className="transition-colors" style={{ color: 'var(--text-tertiary)' }}><X size={18} strokeWidth={1.5} /></button>
            </div>

            {inviteState === 'config' && (
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Time Control</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['bullet','blitz','rapid','classical','custom','daily'].map(tc => (
                      <button key={tc} onClick={() => setPrivateTc(tc)}
                        className="py-2 rounded-lg text-sm capitalize transition-colors"
                        style={{
                          background: privateTc===tc ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                          border: privateTc===tc ? '1px solid var(--accent)' : '0.5px solid var(--border)',
                          color: privateTc===tc ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>
                        {tc}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Your Color</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['white','White'],['black','Black'],['random','Random']].map(([v,l]) => (
                      <button key={v} onClick={() => setPrivateColor(v)}
                        className="py-2 rounded-lg text-sm transition-colors"
                        style={{
                          background: privateColor===v ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                          border: privateColor===v ? '1px solid var(--accent)' : '0.5px solid var(--border)',
                          color: privateColor===v ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>Rated game</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Affects Glicko-2 rating</div>
                  </div>
                  <button onClick={() => setPrivateRated((v: boolean) => !v)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: privateRated ? 'var(--accent)' : 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow"
                      style={{ left: privateRated ? 'calc(100% - 18px)' : '2px' }} />
                  </button>
                </div>
                <button
                  onClick={handleCreatePrivate}
                  className="w-full py-3 rounded-xl font-semibold text-sm btn-press transition-all"
                  style={{ background:'var(--accent)', color:'#0F0D0B' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
                  Generate Invite Link
                </button>
              </div>
            )}

            {inviteState === 'generating' && (
              <div className="p-12 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-t-accent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Creating game…</span>
              </div>
            )}

            {inviteState === 'share' && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Share this link</div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Valid for 48 hours</div>
                </div>
                <div className="rounded-xl p-3 flex items-center gap-2 justify-between"
                  style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                  <span className="text-xs truncate flex-1 font-mono" style={{ color: 'var(--text-secondary)' }}>{inviteLink}</span>
                  <button onClick={async () => { await navigator.clipboard.writeText(inviteLink); setJustCopied(true); setTimeout(()=>setJustCopied(false),2000); }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                      background: justCopied ? 'rgba(79,168,90,0.15)' : 'var(--bg-active)',
                      border:'0.5px solid var(--border)',
                      color: justCopied ? 'var(--green)' : 'var(--text-secondary)',
                    }}>
                    {justCopied ? <>✓ Copied</> : <>Copy</>}
                  </button>
                </div>
                {inviteLink && <div className="flex justify-center"><QRCodeSVG value={inviteLink} size={160} bgColor="#231F1B" fgColor="#F2EDE6" level="M" /></div>}
                <button onClick={() => { if (inviteGameId) router.push(`/game/${inviteGameId}`); }}
                  className="w-full py-3 rounded-xl font-medium text-sm btn-press transition-colors"
                  style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}>
                  Open Game Room
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom time modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCustomModalOpen(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6"
            style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-strong)' }}>
            <h2 className="text-base font-medium mb-6" style={{ color: 'var(--text-primary)' }}>Custom Time Control</h2>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Minutes per side</label>
                  <span className="text-sm font-medium tabular-nums text-accent">{customMin} min</span>
                </div>
                <input type="range" min={1} max={60} step={1} value={customMin} onChange={e=>setCustomMin(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}><span>1</span><span>60</span></div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Increment (seconds)</label>
                  <span className="text-sm font-medium tabular-nums text-accent">{customInc}s</span>
                </div>
                <input type="range" min={0} max={30} step={1} value={customInc} onChange={e=>setCustomInc(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}><span>0</span><span>30</span></div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Preview</div>
                <div className="text-xl font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{customMin}+{customInc}</div>
              </div>
              <button onClick={() => { setSelectedTc('custom'); setIsCustomModalOpen(false); }}
                className="w-full py-3 rounded-xl font-semibold text-sm btn-press"
                style={{ background:'var(--accent)', color:'#0F0D0B' }}>
                Play with this time control
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
