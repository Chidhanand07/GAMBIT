"use client";

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import { OpponentCard } from '@/features/challenge/components/OpponentCard';
import { ColorPicker, RatedToggle, TimeControlPicker } from '@/features/challenge/components/ChallengeOptions';
import { ChallengeStatus } from '@/features/challenge/components/ChallengeStatus';
import type { ChallengeColor, ChallengeOpponent } from '@/features/challenge/types';

export default function ChallengePage(props: { params: Promise<{ username: string }> }) {
    const params = use(props.params);
    const router = useRouter();
    const socket = useSocket();
    const { profile: myProfile } = useProfile();

    const [opponentProfile, setOpponentProfile] = useState<ChallengeOpponent | null>(null);
    const [timeControl, setTimeControl] = useState('10');
    const [isRated, setIsRated] = useState(true);
    const [color, setColor] = useState<ChallengeColor>('random');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [declined, setDeclined] = useState(false);

    useEffect(() => {
        void fetch(`/api/profile/${encodeURIComponent(params.username)}`)
            .then(r => r.ok ? r.json() : null)
            .then((d: ChallengeOpponent | null) => { if (d) setOpponentProfile(d) })
    }, [params.username]);

    useEffect(() => {
        if (!socket) return;
        const onReady = (data: { game_id: string }) => router.push(`/game/${data.game_id}`);
        const onDeclined = () => { setSending(false); setSent(false); setDeclined(true); }
        socket.on('challenge_ready', onReady);
        socket.on('challenge_declined', onDeclined);
        return () => { socket.off('challenge_ready', onReady); socket.off('challenge_declined', onDeclined); }
    }, [socket, router]);

    const handleSend = () => {
        if (!myProfile) { router.push(`/login?redirect=/challenge/${params.username}`); return; }
        if (!socket || !opponentProfile) return;
        setSending(true);
        socket.emit('challenge_request', {
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
                <OpponentCard opponent={opponentProfile} />

                <div className="p-5 space-y-6">
                    <TimeControlPicker value={timeControl} onChange={setTimeControl} />
                    <RatedToggle value={isRated} onToggle={() => setIsRated(!isRated)} />
                    <ColorPicker value={color} onChange={setColor} />
                    <ChallengeStatus
                        opponentUsername={opponentProfile.username}
                        sending={sending}
                        sent={sent}
                        declined={declined}
                        signedIn={!!myProfile}
                        onSend={handleSend}
                    />
                </div>
            </div>
        </div>
    );
}
