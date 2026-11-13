'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import { ActiveGameBanner } from '@/features/lobby/components/ActiveGameBanner';
import { ActiveGameWarning } from '@/features/lobby/components/ActiveGameWarning';
import { CustomTimeControlModal } from '@/features/lobby/components/CustomTimeControlModal';
import { LiveGamesSidebar } from '@/features/lobby/components/LiveGamesSidebar';
import { OfflineBar } from '@/features/lobby/components/OfflineBar';
import { PlayActions } from '@/features/lobby/components/PlayActions';
import { PrivateGameModal } from '@/features/lobby/components/PrivateGameModal';
import { SearchPanel } from '@/features/lobby/components/SearchPanel';
import { TimeControlPicker } from '@/features/lobby/components/TimeControlPicker';
import { WelcomeBar } from '@/features/lobby/components/WelcomeBar';
import { useActiveGame } from '@/features/lobby/hooks/useActiveGame';
import { useMatchFailedToast, useQueueRefusedToast } from '@/features/lobby/hooks/useMatchFailedToast';
import { useMatchmaking } from '@/features/lobby/hooks/useMatchmaking';
import { usePrivateGame } from '@/features/lobby/hooks/usePrivateGame';
import { useTimeControlSelection } from '@/features/lobby/hooks/useTimeControlSelection';
import { loginHref } from '@/features/lobby/loginRedirect';

const LOBBY_PATH = '/lobby';

const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });

export default function LobbyPage() {
    const router = useRouter();
    const socket = useSocket();
    const { onlineCount } = usePresence();
    // Shared profile context — avoids duplicate /api/profile/me calls
    const { profile: myProfile } = useProfile();

    const [isPrivateModalOpen, setIsPrivateModalOpen] = useState(false);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [showActiveWarning, setShowActiveWarning] = useState(false);

    const timeControl = useTimeControlSelection();
    const activeGame = useActiveGame();
    const closePrivateModalOnStart = useCallback(() => setIsPrivateModalOpen(false), []);
    const reportMatchFailed = useMatchFailedToast();
    const reportQueueRefused = useQueueRefusedToast();
    const matchmaking = useMatchmaking({
        socket,
        router,
        profile: myProfile,
        onGameStart: closePrivateModalOnStart,
        onMatchFailed: reportMatchFailed,
        onQueueRefused: reportQueueRefused,
    });
    const privateGame = usePrivateGame({
        socket,
        customMin: timeControl.customMin,
        customInc: timeControl.customInc,
    });

    // Play Online queues the selected control ("<min>+<inc>"); useMatchmaking builds the payload.
    const handlePlayOnline = () => {
        if (!myProfile || !socket) {
            router.push(loginHref(LOBBY_PATH));
            return;
        }
        if (activeGame) {
            setShowActiveWarning(true);
            return;
        }
        const { inc } = timeControl.getTcMinutes();
        matchmaking.joinQueue({ timeControl: timeControl.playOnlineTimeControl, increment: inc });
    };

    const closePrivateModal = () => {
        setIsPrivateModalOpen(false);
        privateGame.setInviteState('config');
    };

    const openPrivateGameRoom = () => {
        if (privateGame.inviteGameId) router.push(`/game/${privateGame.inviteGameId}`);
    };

    const confirmCustomTimeControl = () => {
        timeControl.setSelectedTc('custom');
        setIsCustomModalOpen(false);
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 page-enter">
            <KnightBackground mode="lobby" />

            {activeGame && <ActiveGameBanner activeGame={activeGame} />}

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 min-w-0">
                    <WelcomeBar profile={myProfile} onlineCount={onlineCount} />
                    <TimeControlPicker
                        selectedTc={timeControl.selectedTc}
                        customMin={timeControl.customMin}
                        customInc={timeControl.customInc}
                        onSelect={timeControl.setSelectedTc}
                        onOpenCustom={() => setIsCustomModalOpen(true)}
                    />
                    <OfflineBar onOpen={() => router.push('/offline')} />
                    {matchmaking.searching ? (
                        <SearchPanel searchTime={matchmaking.searchTime} onCancel={matchmaking.cancelSearch} />
                    ) : (
                        <PlayActions
                            onPlayOnline={handlePlayOnline}
                            onComputer={() => router.push('/offline')}
                            onFriend={() => setIsPrivateModalOpen(true)}
                        />
                    )}
                </div>

                <LiveGamesSidebar profile={myProfile} onlineCount={onlineCount} />
            </div>

            {showActiveWarning && activeGame && (
                <ActiveGameWarning
                    onReturn={() => router.push(`/game/${activeGame.id}`)}
                    onStay={() => setShowActiveWarning(false)}
                />
            )}

            {isPrivateModalOpen && (
                <PrivateGameModal game={privateGame} onClose={closePrivateModal} onOpenRoom={openPrivateGameRoom} />
            )}

            {isCustomModalOpen && (
                <CustomTimeControlModal
                    customMin={timeControl.customMin}
                    customInc={timeControl.customInc}
                    onMinChange={timeControl.setCustomMin}
                    onIncChange={timeControl.setCustomInc}
                    onClose={() => setIsCustomModalOpen(false)}
                    onConfirm={confirmCustomTimeControl}
                />
            )}
        </div>
    );
}
