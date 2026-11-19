'use client';

import { useProfile } from '@/components/ProfileProvider';
import { ActiveGameBanner } from '@/features/lobby/components/ActiveGameBanner';
import { ActiveGameWarning } from '@/features/lobby/components/ActiveGameWarning';
import { CustomTimeControl } from '@/features/lobby/components/CustomTimeControl';
import { LiveGames } from '@/features/lobby/components/LiveGames';
import { LobbyPlayArea } from '@/features/lobby/components/LobbyPlayArea';
import { LobbyWelcome } from '@/features/lobby/components/LobbyWelcome';
import { OfflineBoardCard } from '@/features/lobby/components/OfflineBoardCard';
import { PlayBar } from '@/features/lobby/components/PlayBar';
import { PrivateGameDialog } from '@/features/lobby/components/PrivateGameDialog';
import { RatingCard } from '@/features/lobby/components/RatingCard';
import { TimeControlGrid } from '@/features/lobby/components/TimeControlGrid';
import { useLobby } from '@/features/lobby/hooks/useLobby';
import { categoryRating, selectionSummary } from '@/features/lobby/lobbyModel';

/** /lobby (design/Main.dc.html): pick a time control, then play online, MAVERICK or a friend. */
export default function LobbyPage() {
    const { profile } = useProfile();
    const lobby = useLobby();
    const { timeControl: tc, online, invite } = lobby;
    const name = profile ? profile.display_name || profile.username : null;
    const rating = profile && categoryRating(tc.playOnlineTimeControl, profile);
    return (
        <div className="mx-auto box-border flex max-w-[1280px] flex-wrap items-start gap-8 px-8 pb-16 pt-9">
            <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
                {lobby.activeGame && <ActiveGameBanner activeGame={lobby.activeGame} />}
                <LobbyWelcome name={name} />
                <TimeControlGrid selected={tc.selectedTc} onSelect={tc.setSelectedTc} />
                {tc.selectedTc === 'custom' && (
                    <CustomTimeControl
                        minutes={tc.customMin}
                        increment={tc.customInc}
                        onMinutes={tc.setCustomMin}
                        onIncrement={tc.setCustomInc}
                        onPlay={online.playOnline}
                    />
                )}
                <PlayBar
                    summary={selectionSummary(tc.selectedTc, tc.customMin, tc.customInc)}
                    onPlayOnline={online.playOnline}
                    onComputer={() => lobby.openStage('computer')}
                    onFriend={() => lobby.openStage('friends')}
                />
                <LobbyPlayArea lobby={lobby} />
            </section>
            <aside className="flex min-w-0 max-w-[520px] flex-[1_1_320px] flex-col gap-4">
                {rating && name && <RatingCard label={rating.label} name={name} rating={rating.rating} />}
                <OfflineBoardCard />
                <LiveGames games={lobby.liveGames} />
            </aside>
            <ActiveGameWarning open={online.warningOpen} onReturn={online.returnToGame} onStay={online.closeWarning} />
            <PrivateGameDialog open={invite.open} game={invite.game} onClose={invite.close} onOpenRoom={invite.openRoom} />
        </div>
    );
}
