"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Zap, Flame, Timer, BookOpen, Swords, Check, Loader2, Settings } from 'lucide-react';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';

const TIME_CONTROLS = [
    { id: '1', label: '1 min', category: 'Bullet', icon: <Zap size={16} strokeWidth={1.5} /> },
    { id: '2', label: '2 min', category: 'Bullet', icon: <Zap size={16} strokeWidth={1.5} /> },
    { id: '3', label: '3 min', category: 'Blitz', icon: <Flame size={16} strokeWidth={1.5} /> },
    { id: '5', label: '5 min', category: 'Blitz', icon: <Flame size={16} strokeWidth={1.5} /> },
    { id: '10', label: '10 min', category: 'Rapid', icon: <Timer size={16} strokeWidth={1.5} /> },
    { id: '15', label: '15 min', category: 'Rapid', icon: <Timer size={16} strokeWidth={1.5} /> },
    { id: '30', label: '30 min', category: 'Classical', icon: <BookOpen size={16} strokeWidth={1.5} /> },
];

export default function ChallengePage({ params }: { params: { username: string } }) {
    const router = useRouter();
    const socket = useSocket();
    const { profile: myProfile } = useProfile();

    const [opponentProfile, setOpponentProfile] = useState<any>(null);
    const [timeControl, setTimeControl] = useState('10');
    const [isRated, setIsRated] = useState(true);
    const [color, setColor] = useState<'white' | 'black' | 'random'>('random');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [declined, setDeclined] = useState(false);

    useEffect(() => {
        fetch(`/api/profile/${encodeURIComponent(params.username)}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setOpponentProfile(d) })
    }, [params.username]);

    useEffect(() => {
        if (!socket) return;
        const onReady = (data: { game_id: string }) => router.push(`/game/${data.game_id}`);
        const onDeclined = (data: { by: string }) => { setSending(false); setSent(false); setDeclined(true); }
        socket.on('challenge_ready', onReady);
        socket.on('challenge_declined', onDeclined);
        return () => { socket.off('challenge_ready', onReady); socket.off('challenge_declined', onDeclined); }
    }, [socket, router]);

    const handleSend = () => {
        if (!myProfile) { router.push(`/login?redirect=/challenge/${params.username}`); return; }
        if (!socket || !opponentProfile) return;
        setSending(true);
        socket.emit('challenge_request', {
            from_user_id: myProfile.id,
            to_user_id: opponentProfile.id,
            from_username: myProfile.display_name || myProfile.username,
            time_control: timeControl,
            is_rated: isRated,
            color,
        });
        setSent(true);
        setSending(false);
    };

    if (!opponentProfile) return (
        <div className="flex justify-center p-20">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="max-w-lg mx-auto px-4 py-10">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors">
                    <ChevronLeft size={20} strokeWidth={1.5} />
                </button>
                <h1 className="text-xl font-medium text-text-primary">Challenge a Player</h1>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* Opponent */}
                <div className="px-5 py-4 border-b border-border bg-elevated">
                    <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Opponent</p>
                    <Link href={`/profile/${opponentProfile.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-page border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
                            {opponentProfile.avatar_url
                                ? <img src={opponentProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                                : <span className="text-accent font-medium">{(opponentProfile.display_name || opponentProfile.username)[0].toUpperCase()}</span>
                            }
                        </div>
                        <div>
                            <div className="text-text-primary font-medium">{opponentProfile.display_name || opponentProfile.username}</div>
                            <div className="text-text-tertiary text-xs">@{opponentProfile.username} · {Math.round(opponentProfile.rating_rapid ?? 1200)} Rapid</div>
                        </div>
                    </Link>
                </div>

                <div className="p-5 space-y-6">
                    {/* Time Control */}
                    <div>
                        <p className="text-sm font-medium text-text-secondary mb-3">Time Control</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {TIME_CONTROLS.map(tc => (
                                <button key={tc.id} onClick={() => setTimeControl(tc.id)}
                                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                                        timeControl === tc.id
                                            ? 'border-accent bg-accent/10 text-accent'
                                            : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                                    }`}>
                                    <span className={timeControl === tc.id ? 'text-accent' : 'text-text-tertiary'}>{tc.icon}</span>
                                    {tc.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rated */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-secondary">Rated Game</span>
                        <button onClick={() => setIsRated(!isRated)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${isRated ? 'bg-accent' : 'bg-border'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRated ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Color */}
                    <div>
                        <p className="text-sm font-medium text-text-secondary mb-3">I play as</p>
                        <div className="flex gap-2">
                            {(['white', 'random', 'black'] as const).map(c => (
                                <button key={c} onClick={() => setColor(c)}
                                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors capitalize ${
                                        color === c
                                            ? 'border-accent bg-accent/10 text-accent'
                                            : 'border-border text-text-secondary hover:border-border-strong'
                                    }`}>
                                    {c === 'white' ? '♔ White' : c === 'black' ? '♚ Black' : '⊕ Random'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {declined && (
                        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                            {opponentProfile.username} declined the challenge.
                        </div>
                    )}

                    {sent && !declined && (
                        <div className="px-4 py-3 bg-accent/10 border border-accent/30 rounded-lg text-accent text-sm text-center">
                            Challenge sent! Waiting for {opponentProfile.username} to accept…
                        </div>
                    )}

                    <button onClick={handleSend} disabled={sending || (sent && !declined) || !myProfile}
                        className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2">
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} strokeWidth={1.5} />}
                        {sent && !declined ? 'Challenge Sent…' : 'Send Challenge'}
                    </button>
                </div>
            </div>
        </div>
    );
}
