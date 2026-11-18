import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import type { ActiveGame } from '@/types/lobby';
import { loginHref } from '../loginRedirect';
import { useMatchFailedToast, useQueueRefusedToast } from './useMatchFailedToast';
import { useMatchmaking } from './useMatchmaking';
import type { TimeControlSelection } from './useTimeControlSelection';

const LOBBY_PATH = '/lobby';

interface PlayOnlineOptions {
    timeControl: TimeControlSelection;
    activeGame: ActiveGame | null;
    /** The server started a game for us (e.g. a friend joined the invite link). */
    onGameStart: () => void;
}

/**
 * Play Online: signed-out visitors go to log in (and back), a player with a running game is
 * warned, anyone else is queued for the selected control ("<min>+<inc>").
 */
export function usePlayOnline({ timeControl, activeGame, onGameStart }: PlayOnlineOptions) {
    const router = useRouter();
    const socket = useSocket();
    const { profile } = useProfile();
    const [warningOpen, setWarningOpen] = useState(false);
    const matchmaking = useMatchmaking({
        socket,
        router,
        profile,
        onGameStart,
        onMatchFailed: useMatchFailedToast(),
        onQueueRefused: useQueueRefusedToast(),
    });

    const playOnline = () => {
        if (!profile || !socket) {
            router.push(loginHref(LOBBY_PATH));
            return;
        }
        if (activeGame) {
            setWarningOpen(true);
            return;
        }
        const { inc } = timeControl.getTcMinutes();
        matchmaking.joinQueue({ timeControl: timeControl.playOnlineTimeControl, increment: inc });
    };

    return {
        matchmaking,
        playOnline,
        warningOpen,
        closeWarning: () => setWarningOpen(false),
        returnToGame: () => {
            if (activeGame) router.push(`/game/${activeGame.id}`);
        },
    };
}
