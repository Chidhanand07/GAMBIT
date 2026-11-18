import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import type { ColorChoice, Difficulty } from '@/features/offline/types';
import { speedBucketForMinutes } from '@/lib/chess/timeControl';
import type { LobbyStage } from '../types';
import { useActiveGame } from './useActiveGame';
import { useLiveGames } from './useLiveGames';
import { useLobbyFriends } from './useLobbyFriends';
import { usePlayOnline } from './usePlayOnline';
import { usePrivateGame } from './usePrivateGame';
import { useTimeControlSelection } from './useTimeControlSelection';

/** The invite-link dialog: open state plus the private game it creates. */
function useInviteDialog(timeControl: ReturnType<typeof useTimeControlSelection>) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const game = usePrivateGame({
        socket: useSocket(),
        customMin: timeControl.customMin,
        customInc: timeControl.customInc,
    });
    return {
        open,
        game,
        show: () => setOpen(true),
        closeOnStart: useCallback(() => setOpen(false), []),
        close: () => {
            setOpen(false);
            game.setInviteState('config');
        },
        openRoom: () => {
            if (game.inviteGameId) router.push(`/game/${game.inviteGameId}`);
        },
    };
}

/** Everything the lobby page shows and does, from the real sources (HANDOFF §5). */
export function useLobby() {
    const timeControl = useTimeControlSelection();
    const activeGame = useActiveGame();
    const liveGames = useLiveGames(useSocket());
    const [stage, setStage] = useState<LobbyStage>('none');
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [side, setSide] = useState<ColorChoice>('w');
    // Friends' ratings in the pool of the selected time control (F-125).
    const friends = useLobbyFriends(stage === 'friends', speedBucketForMinutes(timeControl.getTcMinutes().mins));
    const invite = useInviteDialog(timeControl);
    const online = usePlayOnline({ timeControl, activeGame, onGameStart: invite.closeOnStart });

    return {
        timeControl,
        activeGame,
        liveGames,
        friends,
        invite,
        online,
        computer: { difficulty, setDifficulty, side, setSide },
        stage,
        openStage: (next: LobbyStage) => setStage(next),
        closeStage: () => setStage('none'),
    };
}

export type Lobby = ReturnType<typeof useLobby>;
