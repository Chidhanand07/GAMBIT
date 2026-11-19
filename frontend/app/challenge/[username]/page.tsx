"use client";

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useProfile } from '@/components/ProfileProvider';
import { OpponentCard } from '@/features/challenge/components/OpponentCard';
import { ColorPicker, RatedToggle, TimeControlPicker } from '@/features/challenge/components/ChallengeOptions';
import { ChallengeStatus } from '@/features/challenge/components/ChallengeStatus';
import { useChallengeRequest } from '@/features/challenge/hooks/useChallengeRequest';
import type { ChallengeColor, ChallengeOpponent } from '@/features/challenge/types';

export default function ChallengePage(props: { params: Promise<{ username: string }> }) {
    const params = use(props.params);
    const router = useRouter();
    const { profile: myProfile } = useProfile();
    const { sending, sent, declined, send } = useChallengeRequest();

    const [opponentProfile, setOpponentProfile] = useState<ChallengeOpponent | null>(null);
    const [timeControl, setTimeControl] = useState('10');
    const [isRated, setIsRated] = useState(true);
    const [color, setColor] = useState<ChallengeColor>('random');

    useEffect(() => {
        void fetch(`/api/profile/${encodeURIComponent(params.username)}`)
            .then(r => r.ok ? r.json() : null)
            .then((d: ChallengeOpponent | null) => { if (d) setOpponentProfile(d) })
    }, [params.username]);

    const handleSend = () => {
        if (!myProfile) { router.push(`/login?redirect=/challenge/${params.username}`); return; }
        if (!opponentProfile) return;
        send({
            to_user_id: opponentProfile.id,
            from_username: myProfile.display_name || myProfile.username,
            time_control: timeControl,
            is_rated: isRated,
            color,
        });
    };

    if (!opponentProfile) return (
        <div className="flex justify-center p-20">
            <Spinner label="Loading player" />
        </div>
    );

    return (
        <div className="mx-auto box-border flex max-w-[640px] flex-col gap-6 px-6 pb-16 pt-9 sm:px-8">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    aria-label="Back"
                    onClick={() => router.back()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-1 border-line bg-surface text-ink"
                >
                    <Icon path="M15 18l-6-6 6-6" size={20} />
                </button>
                <h1 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em]">Challenge a Player</h1>
            </div>

            <Card className="overflow-hidden p-0">
                <OpponentCard opponent={opponentProfile} />
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
            </Card>
        </div>
    );
}
